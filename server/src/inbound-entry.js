import {Router} from 'express';
import {parse} from 'csv-parse/sync';
import {asnDetails} from './inbound.js';
import {hasPermission} from './authorization.js';
import {audit} from './data.js';
import {decode,fail,int,query,transaction} from './db.js';
import {confirmPutaway,qcCarton,receiveAsn} from './wms.js';
import {processTransferMapping} from './transfer-inbound.js';

export const inboundEntryRouter=Router({mergeParams:true});
const outcomes=['GOOD','LEAKAGE','DAMAGE'];
const textFields={arrival_details:500,supervisor_name:180,driver_handover:180};
const timeFields=['docked_at','offloaded_at','handed_over_at'];

function requireWrite(user){
 if(!hasPermission(user,'warehouse.write'))fail('Warehouse operations permission required',403);
}

function localTime(value){
 if(!value)return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))fail('Enter a valid date and time');
 const parsed=new Date(value+'Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,16)!==value)fail('Enter a valid date and time');
 return value.replace('T',' ')+':00';
}

async function loadEntry(user,id,c){
 const asn=await asnDetails(id,user,c);
 const [entry]=await query('SELECT * FROM inbound_entries WHERE asn_id=?',[id],c);
 const checks=await query('SELECT k.* FROM inbound_carton_checks k JOIN cartons c ON c.id=k.carton_id WHERE c.asn_id=?',[id],c);
 const journey=await query(`SELECT c.barcode,a.code asn_code,t.code transfer_code,s.name source_warehouse,d.name destination_warehouse,
  t.dispatched_at,r.processed_at,r.outcome,l.code putaway_location
  FROM transfer_asn_cartons r JOIN transfer_asns link ON link.asn_id=r.asn_id
  JOIN transfers t ON t.id=link.transfer_id JOIN asns a ON a.id=r.asn_id JOIN cartons c ON c.id=r.carton_id
  JOIN inbound_masters s ON s.id=link.source_warehouse_id JOIN inbound_masters d ON d.id=link.destination_warehouse_id
  LEFT JOIN locations l ON l.id=r.destination_location_id
  WHERE r.carton_id IN (SELECT carton_id FROM transfer_asn_cartons WHERE asn_id=? UNION SELECT id FROM cartons WHERE asn_id=? AND type='MASTER_CARTON')
  ORDER BY t.id DESC,c.id`,[id,id],c);
 return {asn,entry:entry||null,checks,manifest:decode(entry?.manifest_counts),journey};
}

async function lockAsn(user,id,c){
 await query('SELECT id FROM asns WHERE id=? FOR UPDATE',[id],c);
 return asnDetails(id,user,c);
}

inboundEntryRouter.get('/',async(req,res)=>{
 const id=int(req.params.id,'ASN');
 res.json(await loadEntry(req.user,id));
});

inboundEntryRouter.get('/mapping-template',async(req,res)=>{
 const asn=await asnDetails(int(req.params.id,'ASN'),req.user);
 const columns=['master_carton_barcode','product_barcode','condition','putaway_location'];
 const rows=[];
 const assets=asn.transfer?[]:await query('SELECT serial,original_master_carton_id master_id FROM assets WHERE asn_id=? ORDER BY id',[asn.id]);
 for(const carton of asn.cartons.filter(c=>c.type==='MASTER_CARTON')){
  if(asn.transfer){
   for(const item of carton.mapping)rows.push({master_carton_barcode:carton.barcode,product_barcode:item.product_barcode,condition:carton.outcome||'GOOD',putaway_location:''});
  }else{
   const mapped=assets.filter(asset=>asset.master_id===carton.id);
   for(let i=0;i<Math.max(carton.qty,mapped.length);i++)rows.push({master_carton_barcode:carton.barcode,product_barcode:mapped[i]?.serial||'',condition:'GOOD',putaway_location:''});
  }
 }
 res.json({asn_code:asn.code,columns,rows});
});

const conditions=['GOOD','BAD','DAMAGE'];
const storedOutcome=outcome=>outcome==='BAD'?'LEAKAGE':outcome;
inboundEntryRouter.post('/manifest',async(req,res)=>{
 requireWrite(req.user);
 const id=int(req.params.id,'ASN');
 res.json(await transaction(async c=>{
  const asn=await lockAsn(req.user,id,c);
  if(asn.received_qty||asn.cartons.some(carton=>carton.status!=='EXPECTED'))fail('The manifest is locked after receipt begins',409);
  const lines=Array.isArray(req.body.lines)?req.body.lines:[];
  if(!asn.lines.length||lines.length!==asn.lines.length)fail('Enter box counts for every ASN product');
  const counts={};
  for(const line of asn.lines){
   const input=lines.find(row=>Number(row?.id)===line.id);
   if(!input)fail('A product is missing from the manifest');
   const row=Object.fromEntries(conditions.map(outcome=>[outcome,input[outcome]]));
   if(Object.values(row).some(qty=>!Number.isSafeInteger(qty)||qty<0)||Object.values(row).reduce((sum,qty)=>sum+qty,0)!==line.expected_boxes){
    fail(`Good, bad and damaged counts for ${line.sku} must total ${line.expected_boxes} boxes`);
   }
   counts[line.id]=row;
  }
  const json=JSON.stringify(counts);
  await query('INSERT INTO inbound_entries(asn_id,manifest_counts) VALUES (?,?) ON DUPLICATE KEY UPDATE manifest_counts=?',[id,json,json],c);
  await audit(c,req.user,'asn',id,'MANIFEST_SAVED','Inbound box counts saved');
  return loadEntry(req.user,id,c);
 }));
});

function mappingGroups(body){
 let rows=body.rows;
 if(typeof body.csv==='string'){
  if(Buffer.byteLength(body.csv)>5*1024*1024)fail('CSV exceeds 5 MB');
  try{rows=parse(body.csv,{bom:true,columns:true,trim:true,skip_empty_lines:true});}catch{fail('Invalid CSV mapping file');}
 }
 if(!Array.isArray(rows)||!rows.length||rows.length>10000)fail('Provide 1–10,000 mapping rows');
 const groups=new Map(),serials=new Set();
 const barcode=(value,max)=>{
  if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\x00-\x1f\x7f]/.test(value))fail('Enter valid carton and product barcodes as text');
  return value.trim();
 };
 for(const row of rows){
  const master=barcode(row?.master_carton_barcode,80);
  const serial=barcode(row.product_barcode,100);
  const outcome=String(row.condition||'').trim().toUpperCase();
  if(!conditions.includes(outcome))fail('Condition must be GOOD, BAD or DAMAGE');
  if(serials.has(serial.toUpperCase()))fail(`Duplicate product barcode ${serial}`);
  serials.add(serial.toUpperCase());
  if(!groups.has(master))groups.set(master,{outcome,serials:[],location:String(row.putaway_location||'').trim()});
  const group=groups.get(master);
  if(group.location!==String(row.putaway_location||'').trim())fail('Use one putaway location for each master carton');
  if(group.outcome!==outcome)fail('Use one condition for each master carton');
  group.serials.push(serial);
 }
 return groups;
}

async function transferRows(c,asn,body){
 if(!asn.transfer)return body;
 let rows=body.rows;
 if(typeof body.csv==='string'){
  if(Buffer.byteLength(body.csv)>5*1024*1024)fail('CSV exceeds 5 MB');
  try{rows=parse(body.csv,{bom:true,columns:true,trim:true,skip_empty_lines:true});}catch{fail('Invalid CSV mapping file');}
 }
 if(!Array.isArray(rows)||!rows.length||rows.length>10000)fail('Provide 1–10,000 mapping rows');
 const condition=value=>({'GOOD QUANTITY':'GOOD','BAD QUANTITY':'BAD','LEAKAGE QUANTITY':'BAD','DAMAGE QUANTITY':'DAMAGE','DAMAGED QUANTITY':'DAMAGE'}[String(value||'').trim().toUpperCase()]||String(value||'').trim().toUpperCase());
 const expanded=[];
 for(const row of rows){
  const master=String(row.master_carton_barcode||row.master_carton||'').trim();
  expanded.push({master_carton_barcode:master,product_barcode:row.product_barcode,condition:condition(row.condition||row.product_type),putaway_location:String(row.putaway_location||row.pallet_no||'').trim()});
 }
 return {rows:expanded};
}

inboundEntryRouter.post('/putaway-mapping',async(req,res)=>{
 requireWrite(req.user);
 const id=int(req.params.id,'ASN');
 const defaultDestination=req.body.destination_location_id?int(req.body.destination_location_id,'Destination bin'):null;
 res.json(await transaction(async c=>{
  const asn=await lockAsn(req.user,id,c);
  const groups=mappingGroups(await transferRows(c,asn,req.body));
  const [entry]=await query('SELECT manifest_counts FROM inbound_entries WHERE asn_id=?',[id],c);
  const manifest=decode(entry?.manifest_counts);
  if(!manifest)fail('Save inbound manifest counts first',409);
  if(await processTransferMapping(c,req.user,asn,groups,manifest,defaultDestination))return loadEntry(req.user,id,c);
  const used=await query('SELECT c.asn_line_id,k.outcome,COUNT(*) qty FROM inbound_carton_checks k JOIN cartons c ON c.id=k.carton_id WHERE c.asn_id=? GROUP BY c.asn_line_id,k.outcome',[id],c);
  for(const row of used){
   const outcome=row.outcome==='LEAKAGE'?'BAD':row.outcome;
   if(manifest[row.asn_line_id])manifest[row.asn_line_id][outcome]-=Number(row.qty);
  }
  for(const [barcode,group] of groups){
   let destination=defaultDestination;
   if(group.location){
    const [bin]=await query(`SELECT l.id FROM inbound_masters m JOIN locations l ON l.id=m.location_id WHERE m.active=1 AND m.warehouse_id=? AND m.kind='PALLET' AND l.type='BIN' AND (m.code=? OR l.code=?)`,[asn.warehouse_id,group.location,group.location],c);
    if(!bin)fail(`Unknown putaway_location ${group.location} in this warehouse`);
    destination=bin.id;
   }
   const carton=asn.cartons.find(row=>row.type==='MASTER_CARTON'&&row.barcode===barcode);
   if(!carton)fail(`Master carton ${barcode} does not belong to this ASN`);
   if(carton.status!=='EXPECTED'){
    const [check]=await query('SELECT outcome FROM inbound_carton_checks WHERE carton_id=?',[carton.id],c);
    const mapped=await query('SELECT serial FROM assets WHERE original_master_carton_id=?',[carton.id],c);
    const actual=new Set(mapped.map(row=>row.serial));
    const same=check?.outcome===storedOutcome(group.outcome)&&actual.size===group.serials.length&&group.serials.every(serial=>actual.has(serial));
    const [task]=destination&&group.outcome==='GOOD'?await query('SELECT actual_location_id FROM putaway_tasks WHERE carton_id=? AND status=\'COMPLETED\'',[carton.id],c):[];
    if(same&&(!destination||group.outcome!=='GOOD'||task?.actual_location_id===destination))continue;
    fail(`Master carton ${barcode} was already processed`,409);
   }
   const line=asn.lines.find(row=>row.id===carton.asn_line_id);
   if(!line||!(manifest[line.id]?.[group.outcome]>0))fail(`No ${group.outcome} boxes remain on the manifest for ${barcode}`);
   manifest[line.id][group.outcome]--;
   if(group.serials.length!==carton.qty)fail(`Master carton ${barcode} must contain exactly ${carton.qty} product barcodes`);
   const existing=await query('SELECT id,serial FROM assets WHERE master_carton_id=?',[carton.id],c);
   const serials=group.serials;
   const bySerial=new Map(existing.map(asset=>[asset.serial,asset.id]));
   if(existing.length&&(existing.length!==serials.length||serials.some(serial=>!bySerial.has(serial))))fail(`Product barcodes must match the existing mapping for ${barcode}`);
   for(const serial of serials){
    if(!existing.length)await query("INSERT INTO assets(serial,product_id,status,location_id,master_carton_id,original_master_carton_id,asn_id) VALUES (?,?,'EXPECTED',?,?,?,?)",[serial,carton.product_id,carton.location_id,carton.id,carton.id,id],c);
   }
   await receiveAsn(c,req.user,id,{barcode,serials},{manifestMapping:true});
   const good=group.outcome==='GOOD';
   await qcCarton(c,req.user,carton.id,{result:good?'PASS':'FAIL',reason:group.outcome});
   await query('INSERT INTO inbound_carton_checks(carton_id,outcome) VALUES (?,?)',[carton.id,storedOutcome(group.outcome)],c);
   if(good&&destination){
    const [task]=await query("SELECT id FROM putaway_tasks WHERE carton_id=? AND status='OPEN'",[carton.id],c);
    await confirmPutaway(c,req.user,task.id,{barcode,source_location_id:carton.location_id,destination_location_id:destination});
   }
  }
  return loadEntry(req.user,id,c);
 }));
});

inboundEntryRouter.post('/',async(req,res)=>{
 requireWrite(req.user);
 const id=int(req.params.id,'ASN');
 const fields=Object.entries(textFields).map(([key,max])=>String(req.body[key]??'').trim().slice(0,max)||null);
 const [docked,offloaded,handedOver]=timeFields.map(key=>localTime(req.body[key]));
 const times=[docked,offloaded,handedOver].filter(Boolean);
 if(times.some((value,i)=>i>0&&value<times[i-1]))fail('Docking, offload, and handover must be in chronological order');
 res.json(await transaction(async c=>{
  await lockAsn(req.user,id,c);
  await query(`INSERT INTO inbound_entries
    (asn_id,arrival_details,supervisor_name,driver_handover,docked_at,offloaded_at,handed_over_at)
    VALUES (?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE arrival_details=?,supervisor_name=?,driver_handover=?,docked_at=?,offloaded_at=?,handed_over_at=?`,
    [id,...fields,docked,offloaded,handedOver,...fields,docked,offloaded,handedOver],c);
  await audit(c,req.user,'asn',id,'GRN_ENTRY_SAVED','Inbound arrival and handover details saved');
  return loadEntry(req.user,id,c);
 }));
});

inboundEntryRouter.post('/clear',async(req,res)=>{
 requireWrite(req.user);
 const id=int(req.params.id,'ASN');
 res.json(await transaction(async c=>{
  const asn=await lockAsn(req.user,id,c);
  if(asn.received_qty>0||asn.cartons.some(carton=>carton.status!=='EXPECTED'))fail('An inbound entry with received cartons cannot be deleted',409);
  await query('DELETE FROM inbound_entries WHERE asn_id=?',[id],c);
  await audit(c,req.user,'asn',id,'GRN_ENTRY_DELETED','Draft inbound entry deleted');
  return loadEntry(req.user,id,c);
 }));
});

inboundEntryRouter.post('/cartons',async(req,res)=>{
 requireWrite(req.user);
 const id=int(req.params.id,'ASN');
 const selections=req.body.cartons;
 if(!Array.isArray(selections)||!selections.length||selections.length>1000)fail('Select 1–1,000 master cartons');
 const requested=new Map();
 for(const item of selections){
  const cartonId=int(item?.id,'Master carton');
  if(requested.has(cartonId)||!outcomes.includes(item.outcome))fail('Choose one valid condition per master carton');
  requested.set(cartonId,item.outcome);
 }
 res.json(await transaction(async c=>{
  const asn=await lockAsn(req.user,id,c);
  const [entry]=await query('SELECT asn_id,manifest_counts FROM inbound_entries WHERE asn_id=?',[id],c);
  if(!entry)fail('Save the inbound entry details before processing cartons',409);
  if(entry.manifest_counts)fail('Use putaway mapping for this manifest',409);
  const cartons=new Map(asn.cartons.filter(carton=>carton.type==='MASTER_CARTON').map(carton=>[carton.id,carton]));
  for(const [cartonId,outcome] of [...requested].sort(([a],[b])=>a-b)){
   const carton=cartons.get(cartonId);
   if(!carton)fail('Master carton does not belong to this ASN');
   const [existing]=await query('SELECT outcome FROM inbound_carton_checks WHERE carton_id=?',[cartonId],c);
   if(existing?.outcome===outcome)continue;
   if(existing||!['EXPECTED','RECEIVED'].includes(carton.status))fail(`Carton ${carton.barcode} was already processed`,409);
   if(carton.status==='EXPECTED'){
    const assets=await query('SELECT serial FROM assets WHERE master_carton_id=?',[cartonId],c);
    await receiveAsn(c,req.user,id,{barcode:carton.barcode,serials:assets.map(asset=>asset.serial)});
   }
   await qcCarton(c,req.user,cartonId,{result:outcome==='GOOD'?'PASS':'FAIL',reason:outcome});
   await query('INSERT INTO inbound_carton_checks(carton_id,outcome) VALUES (?,?)',[cartonId,outcome],c);
  }
  return loadEntry(req.user,id,c);
 }));
});
