import {parse} from 'csv-parse/sync';
import {Router} from 'express';
import {createHash,randomBytes} from 'node:crypto';
import {query,transaction,fail,required,int,decode} from './db.js';
import {assertLocation,permittedLocations,globalRole,hasPermission} from './authorization.js';
import {audit} from './data.js';

const kinds=['WAREHOUSE','HUB','ZONE','PALLET','PACK','COMBO','PARTNER','MATERIAL_SOURCE','TRANSPORT','FACTORY'];
const text=(value,max=180)=>value==null?null:String(value).trim().slice(0,max)||null;
const date=(value,label)=>{if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(new Date(value+'T00:00:00Z').getTime())||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail(`Invalid ${label}`);return value;};
async function master(id,kind,c,optional=false){if(!id){if(optional)return null;fail(`${kind} master is required`);}const [m]=await query("SELECT * FROM inbound_masters WHERE id=? AND (kind=? OR (?='WAREHOUSE' AND kind='HUB')) AND active=1",[int(id,kind),kind,kind],c);if(!m)fail(`${kind} master not found or inactive`);return m;}
async function warehouseScope(user,warehouse,c){await assertLocation(user,warehouse.location_id,c);}
export async function inboundMasters(user,c){
 if(['customer','engineer'].includes(user.role))fail('Warehouse access required',403);
 const rows=await query('SELECT * FROM inbound_masters ORDER BY kind,name,id',[],c),ids=await permittedLocations(user,c);
 const warehouses=rows.filter(m=>['WAREHOUSE','HUB'].includes(m.kind)&&(!ids||ids.includes(m.location_id)));
 const allowed=new Set(warehouses.map(m=>m.id));
 return rows.filter(m=>['WAREHOUSE','HUB'].includes(m.kind)?allowed.has(m.id):!m.warehouse_id||allowed.has(m.warehouse_id)).map(m=>({...m,items:decode(m.items,[]),active:!!m.active}));
}
export const inboundRouter=Router();
inboundRouter.get('/putaway-options',async(req,res)=>{
 if(['customer','engineer'].includes(req.user.role))fail('Warehouse access required',403);
 const allowed=await permittedLocations(req.user);
 const candidates=await query(`SELECT a.id,a.receiving_location_id FROM asns a JOIN inbound_entries e ON e.asn_id=a.id
  WHERE e.manifest_counts IS NOT NULL AND a.received_qty<a.expected_qty ORDER BY a.id DESC`);
 const asns=[],cartons=[];
 for(const candidate of candidates){
  if(allowed&&!allowed.includes(candidate.receiving_location_id))continue;
  const asn=await asnDetails(candidate.id,req.user);
  asns.push({id:asn.id,code:asn.code,warehouse_id:asn.warehouse_id,transfer:!!asn.transfer});
  cartons.push(...asn.cartons.filter(c=>c.type==='MASTER_CARTON'&&c.status==='EXPECTED').map(c=>({...c,asn_id:asn.id,warehouse_id:asn.warehouse_id,transfer:!!asn.transfer,expected_serials:asn.transfer?c.mapping.map(item=>item.product_barcode):null})));
 }
 res.json({asns,cartons});
});
inboundRouter.get('/masters',async(req,res)=>res.json(await inboundMasters(req.user)));
function requireMasterWrite(user){
 if(!hasPermission(user,'master.write')&&user.authorization_role!=='WAREHOUSE_MANAGER')fail('Master data permission required',403);
}
async function storageZone(user,b,c){
 const zone=await master(b.parent_id,'ZONE',c);
 const warehouse=await master(zone.warehouse_id,'WAREHOUSE',c);
 if(b.warehouse_id&&Number(b.warehouse_id)!==warehouse.id)fail('Bin zone belongs to another warehouse/hub');
 await warehouseScope(user,warehouse,c);
 return {zone,warehouse};
}
async function createStorage(c,warehouse,zone,b){
 const code=required(b.code,'Code');
 if(code.length>60)fail('Storage code must be at most 60 characters');
 const name=required(b.name,'Name').slice(0,180);
 const capacity=int(b.capacity,'Capacity');
 if(capacity>2147483647)fail('Capacity exceeds the supported limit');
 const type=b.location_type||'BIN';
 if(!['BIN','PALLET'].includes(type))fail('Storage type must be BIN or PALLET');
 const prefix=`WH${warehouse.id}-`;
 const physicalCode=prefix.length+code.length<=60?prefix+code:prefix+createHash('sha256').update(code).digest('hex').slice(0,40);
 const locationName=`${warehouse.code} · ${name}`.slice(0,180);
 const location=await query("INSERT INTO locations(code,name,type,region,capacity) VALUES (?,?,'BIN',?,?)",[physicalCode,locationName,warehouse.region||'',capacity],c);
 const row=await query("INSERT INTO inbound_masters(kind,code,name,warehouse_id,parent_id,location_id,region,capacity,location_type) VALUES ('PALLET',?,?,?,?,?,?,?,?)",[code,name,warehouse.id,zone.id,location.insertId,warehouse.region,capacity,type],c);
 return (await query('SELECT * FROM inbound_masters WHERE id=?',[row.insertId],c))[0];
}
inboundRouter.post('/masters/storage-grid',async(req,res)=>{
 requireMasterWrite(req.user);
 const b=req.body;
 const rows=int(b.rows,'Rows'),pallets=int(b.pallets,'Pallets per row'),levels=int(b.levels,'Levels');
 if(rows*pallets*levels>1000)fail('Generate at most 1,000 positions at a time');
 const result=await transaction(async c=>{
  const {warehouse,zone}=await storageZone(req.user,b,c);
  for(let row=1;row<=rows;row++){
   for(let pallet=1;pallet<=pallets;pallet++){
    for(let level=0;level<levels;level++){
     const code=`R${row}-P${pallet}-L${level}`;
     await createStorage(c,warehouse,zone,{...b,code,name:code});
    }
   }
  }
  const count=rows*pallets*levels;
  await audit(c,req.user,'inbound_master',zone.id,'STORAGE_GRID_CREATED',`${count} storage positions created in ${warehouse.code} / ${zone.code}`);
  return {count};
 });
 res.status(201).json(result);
});
inboundRouter.post('/masters',async(req,res)=>{
 requireMasterWrite(req.user);
 const b=req.body,kind=required(b.kind,'Master type');if(!kinds.includes(kind))fail('Invalid master type');
 if(kind==='PACK'&&Object.hasOwn(b,'units_per_master')){b.units_per_inner=int(b.units_per_master,'Pieces per master carton');b.inners_per_master=1;}
 res.status(201).json(await transaction(async c=>{
  if(['WAREHOUSE','HUB'].includes(kind)&&!globalRole(req.user))fail('Central administration permission required',403);
  let warehouse=null,location_id=null;
  if(kind==='ZONE'){warehouse=await master(b.warehouse_id,'WAREHOUSE',c);await warehouseScope(req.user,warehouse,c);}
  if(kind==='PALLET'){
   const {warehouse,zone}=await storageZone(req.user,b,c);
   const row=await createStorage(c,warehouse,zone,b);
   await audit(c,req.user,'inbound_master',row.id,'CREATED',`Storage position ${row.code} created`);
   return {...row,items:[]};
  }
  if(['WAREHOUSE','HUB'].includes(kind)){
    if(b.location_id){const [l]=await query('SELECT * FROM locations WHERE id=?',[int(b.location_id,'Receiving location')],c);if(!l||!['STAGING','HUB'].includes(l.type))fail('Invalid receiving location');await assertLocation(req.user,l.id,c);location_id=l.id;}
    else{const l=await query('INSERT INTO locations(code,name,type,region) VALUES (?,?,?,?)',[required(b.code,'Code')+'-RCV',required(b.name,'Name')+' · Receiving',kind==='HUB'?'HUB':'STAGING',text(b.region,80)||''],c);location_id=l.insertId;}
  }
  let product=null;if(kind==='PACK'){const [p]=await query('SELECT * FROM products WHERE id=?',[int(b.product_id,'Product')],c);if(!p)fail('Product not found');product=p;}
  let items=[];
  if(kind==='COMBO'){
   if(!Array.isArray(b.items)||!b.items.length)fail('Add at least one product to the combo');
   const ids=new Set();for(const item of b.items){const id=int(item.product_id,'Combo product');if(ids.has(id))fail('Duplicate product in combo');ids.add(id);if(!(await query('SELECT id FROM products WHERE id=?',[id],c)).length)fail('Combo product not found');items.push({product_id:id,qty:int(item.qty,'Combo quantity')});}
  }
  const r=await query('INSERT INTO inbound_masters(kind,code,name,warehouse_id,parent_id,location_id,product_id,city,address,region,capacity,units_per_inner,inners_per_master,items,location_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
   kind,required(b.code,'Code').slice(0,60),required(b.name,'Name').slice(0,180),warehouse?.id||null,null,location_id,product?.id||null,text(b.city,100),text(b.address,255),text(b.region||warehouse?.region,80),null,kind==='PACK'?int(b.units_per_inner,'Units per inner carton'):null,kind==='PACK'?int(b.inners_per_master,'Inner cartons per master'):null,JSON.stringify(items),['WAREHOUSE','HUB'].includes(kind)?kind:null],c);
  await audit(c,req.user,'inbound_master',r.insertId,'CREATED',`${kind} master ${b.code} created`);
  return {...(await query('SELECT * FROM inbound_masters WHERE id=?',[r.insertId],c))[0],items};
 }));
});

export async function createInboundAsn(c,user,b){
 const warehouse=await master(b.warehouse_id,'WAREHOUSE',c);await warehouseScope(user,warehouse,c);
 const zone=await master(b.zone_id,'ZONE',c,true),pallet=await master(b.pallet_id,'PALLET',c,true);
 if(zone&&zone.warehouse_id!==warehouse.id||pallet&&pallet.warehouse_id!==warehouse.id)fail('Zone/pallet belongs to a different warehouse');
 if(pallet?.parent_id&&pallet.parent_id!==zone?.id)fail('Selected pallet is not in this zone');
 const references={};for(const [key,kind] of Object.entries({material_source_id:'MATERIAL_SOURCE',factory_id:'FACTORY',consignor_id:'PARTNER',consignee_id:'PARTNER',transport_mode_id:'TRANSPORT',combo_id:'COMBO'}))references[key]=await master(b[key],kind,c,true);
 const invoice=required(b.invoice_no,'Invoice number').slice(0,100);
 const shipment=date(b.shipment_date,'shipment date'),expected=date(b.expected_date,'expected date')||new Date().toISOString().slice(0,10);
 if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>50)fail('Add 1–50 product lines');
 const lines=[];const allSerials=new Set();const products=new Set();let total=0,totalBoxes=0;
 for(const line of b.lines){
  const [p]=await query('SELECT * FROM products WHERE id=?',[int(line.product_id,'Product')],c);if(!p)fail('Product not found');
  if(products.has(p.id))fail('Use one ASN line per product');products.add(p.id);
  if(!p.serialized)fail('This inbound workflow requires a serialized product');
  const pack=await master(line.pack_config_id,'PACK',c,true);if(pack&&pack.product_id!==p.id)fail('Packing configuration belongs to another product');
  const units=pack?.units_per_inner||p.units_per_inner_carton,inners=pack?.inners_per_master||p.inner_cartons_per_master;
  const qty=int(line.expected_qty,'Expected pieces');const boxes=Math.ceil(qty/(units*inners));
  if(line.serials?.length)fail('Upload product barcodes by master-carton CSV after creating the ASN');
  const serials=[];
  total+=qty;totalBoxes+=boxes;if(total>10000||totalBoxes>1000)fail('One ASN supports up to 10,000 units and 1,000 master cartons');
  lines.push({p,pack,units,inners,boxes,qty,serials,mfg:date(line.manufacturing_date,'manufacturing date')});
 }
 const combo=references.combo_id;if(combo){const items=decode(combo.items,[]);const factor=lines[0].qty/items.find(i=>i.product_id===lines[0].p.id)?.qty;if(!Number.isInteger(factor)||factor<1||items.length!==lines.length||items.some(i=>lines.find(l=>l.p.id===i.product_id)?.qty!==i.qty*factor))fail('Product lines must match whole multiples of the selected combo');}
 let asnCode='ASN'+Date.now()+randomBytes(2).toString('hex').toUpperCase();
 const r=await query('INSERT INTO asns(code,vendor,product_id,warehouse,expected_qty,expected_date,warehouse_id,receiving_location_id,invoice_no,invoice_date,po_no,po_date,material_source_id,shipping_reference,factory_id,container_no,consignor_id,consignee_id,consignor_city,seal_no,transport_mode_id,shipment_date,zone_id,pallet_id,combo_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
  asnCode,references.consignor_id?.name||text(b.vendor)||references.material_source_id?.name||'Inbound shipment',lines[0].p.id,warehouse.name,total,expected,warehouse.id,warehouse.location_id,invoice,date(b.invoice_date,'invoice date'),text(b.po_no,100),date(b.po_date,'PO date'),references.material_source_id?.id||null,text(b.shipping_reference),references.factory_id?.id||null,text(b.container_no,100),references.consignor_id?.id||null,references.consignee_id?.id||null,text(b.consignor_city||references.consignor_id?.city,100),text(b.seal_no,100),references.transport_mode_id?.id||null,shipment,zone?.id||null,pallet?.id||null,combo?.id||null],c);
 asnCode=warehouse.code.replace(/[^A-Za-z0-9]/g,'').slice(0,8).toUpperCase()+String(r.insertId).padStart(6,'0');
 await query('UPDATE asns SET code=? WHERE id=?',[asnCode,r.insertId],c);
 for(const line of lines){
  const {p,units,inners,boxes,qty,serials,pack}=line;
  const result=await query('INSERT INTO asn_lines(asn_id,product_id,expected_qty,expected_boxes,manufacturing_date,units_per_inner,inners_per_master,pack_config_id) VALUES (?,?,?,?,?,?,?,?)',[r.insertId,p.id,qty,boxes,line.mfg,units,inners,pack?.id||null],c);
  let offset=0;
  const barcode=type=>p.sku.replace(/[^A-Za-z0-9-]/g,'').slice(0,12)+type+(BigInt('0x'+randomBytes(6).toString('hex'))%100000000000000n).toString().padStart(14,'0');
  for(let box=1;box<=boxes;box++){
   const cartonQty=Math.min(units*inners,qty-offset);
   await query("INSERT INTO cartons(barcode,type,product_id,asn_id,qty,location_id,asn_line_id,box_number,box_total) VALUES (?,'MASTER_CARTON',?,?,?,?,?,?,?)",[barcode('M'),p.id,r.insertId,cartonQty,warehouse.location_id,result.insertId,box,boxes],c);
   offset+=cartonQty;
  }
 }
 await audit(c,user,'asn',r.insertId,'CREATED',`${asnCode} · ${total} units / ${totalBoxes} boxes; labels generated`);
 return {id:r.insertId,code:asnCode,expected_qty:total,expected_boxes:totalBoxes};
}

export async function asnDetails(id,user,c){
 if(['customer','engineer'].includes(user.role))fail('Warehouse access required',403);
 const [asn]=await query('SELECT * FROM asns WHERE id=?',[id],c);if(!asn)fail('ASN not found',404);
 if(asn.receiving_location_id)await assertLocation(user,asn.receiving_location_id,c);
 else{const cartons=await query('SELECT DISTINCT location_id FROM cartons WHERE asn_id=?',[id],c);for(const carton of cartons)await assertLocation(user,carton.location_id,c);}
 const lines=await query(`SELECT l.*,p.sku,p.name product_name,(SELECT COUNT(*) FROM movements m JOIN assets a ON a.id=m.asset_id WHERE m.movement_type='RECEIPT' AND m.source_type='asn' AND m.source_id=l.asn_id AND a.product_id=l.product_id) received_qty FROM asn_lines l JOIN products p ON p.id=l.product_id WHERE l.asn_id=? ORDER BY l.id`,[id],c);
 let cartons=await query('SELECT c.*,p.sku,p.name product_name,m.barcode parent_barcode FROM cartons c JOIN products p ON p.id=c.product_id LEFT JOIN cartons m ON m.id=c.parent_id WHERE c.asn_id=? ORDER BY c.product_id,c.box_number,c.id',[id],c);
 const [transfer]=await query(`SELECT t.*,s.name source_warehouse,d.name destination_warehouse FROM transfer_asns t
  JOIN inbound_masters s ON s.id=t.source_warehouse_id JOIN inbound_masters d ON d.id=t.destination_warehouse_id WHERE t.asn_id=?`,[id],c);
 if(transfer){
  cartons=await query(`SELECT c.*,p.sku,p.name product_name,r.asn_line_id receipt_line_id,r.mapping,r.processed_at,r.outcome,r.destination_location_id
   FROM transfer_asn_cartons r JOIN cartons c ON c.id=r.carton_id JOIN products p ON p.id=c.product_id WHERE r.asn_id=? ORDER BY c.id`,[id],c);
  cartons=cartons.map(c=>({...c,qty:decode(c.mapping,[]).length,asn_id:id,asn_line_id:c.receipt_line_id,status:c.processed_at?'STORED':'EXPECTED',mapping:decode(c.mapping,[])}));
  const inners=await query(`SELECT i.*,p.sku,p.name product_name,m.barcode parent_barcode,r.asn_line_id receipt_line_id,r.processed_at,r.mapping
   FROM transfer_asn_cartons r JOIN cartons m ON m.id=r.carton_id JOIN cartons i ON i.original_parent_id=m.id JOIN products p ON p.id=i.product_id WHERE r.asn_id=? ORDER BY i.id`,[id],c);
  const historicalInners=inners.filter(c=>decode(c.mapping,[]).some(row=>row.inner_carton_barcode===c.barcode));
  cartons.push(...historicalInners.map((c,index)=>({...c,mapping:undefined,qty:decode(c.mapping,[]).filter(row=>row.inner_carton_barcode===c.barcode).length,box_number:index+1,box_total:historicalInners.length,asn_id:id,asn_line_id:c.receipt_line_id,status:c.processed_at?'STORED':'EXPECTED'})));
 }
 const masters=await inboundMasters(user,c);
 const mapped={};for(const key of ['warehouse_id','zone_id','pallet_id','material_source_id','consignor_id','consignee_id','factory_id','transport_mode_id','combo_id'])mapped[key.replace('_id','_name')]=masters.find(m=>m.id===asn[key])?.name||null;
 const mappings=await query('SELECT master_carton_id,COUNT(*) mapped_qty FROM assets WHERE asn_id=? GROUP BY master_carton_id',[id],c);
 return {...asn,...mapped,transfer:transfer||null,mapped_qty:mappings.reduce((n,m)=>n+Number(m.mapped_qty),0),warehouse_code:masters.find(m=>m.id===asn.warehouse_id)?.code||null,lines,cartons:cartons.map(c=>({...c,mapped_qty:c.mapping?.length||Number(mappings.find(m=>m.master_carton_id===c.id)?.mapped_qty||0)}))};
}
inboundRouter.get('/asns/:id',async(req,res)=>res.json(await asnDetails(int(req.params.id,'ASN'),req.user)));
inboundRouter.get('/asns/:id/mapping-template',async(req,res)=>{
 const asn=await asnDetails(int(req.params.id,'ASN'),req.user);
 if(asn.transfer){
  const rows=asn.cartons.filter(c=>c.type==='MASTER_CARTON').flatMap(c=>c.mapping.map(row=>({master_carton_barcode:c.barcode,product_barcode:row.product_barcode,condition:c.outcome||'GOOD',putaway_location:''})));
  return res.json({asn_code:asn.code,rows});
 }
 const assets=await query('SELECT serial,master_carton_id FROM assets WHERE asn_id=? ORDER BY id',[asn.id]);
 const rows=[];for(const carton of asn.cartons.filter(c=>c.type==='MASTER_CARTON'&&c.status==='EXPECTED')){
  const serials=assets.filter(a=>a.master_carton_id===carton.id);
  for(let i=0;i<carton.qty;i++)rows.push({master_carton_barcode:carton.barcode,product_code:carton.sku,product_barcode:serials[i]?.serial||''});
 }
 res.json({asn_code:asn.code,rows});
});
inboundRouter.post('/asns/:id/import-mapping',async(req,res)=>{
 if(!hasPermission(req.user,'warehouse.write'))fail('Warehouse write permission required',403);
 if(typeof req.body.csv!=='string'||Buffer.byteLength(req.body.csv)>5*1024*1024)fail('Upload a CSV file no larger than 5 MB');
 let rows;try{rows=parse(req.body.csv,{bom:true,columns:true,skip_empty_lines:true,trim:true,max_record_size:1000});}catch{fail('Invalid CSV. Use the downloaded master-carton mapping template.');}
 if(!rows.length||rows.length>10000)fail('CSV must contain 1–10,000 product barcode rows');
 if(!['master_carton_barcode','product_code','product_barcode'].every(key=>Object.hasOwn(rows[0],key)))fail('CSV columns must be master_carton_barcode,product_code,product_barcode');
 const id=int(req.params.id,'ASN');
 res.json(await transaction(async c=>{
  await query('SELECT id FROM asns WHERE id=? FOR UPDATE',[id],c);
  const asn=await asnDetails(id,req.user,c),groups=new Map(),seen=new Set();
  if(asn.transfer)fail('This transfer already has barcode mappings. Use the putaway mapping page to assign destination bins.',409);
  for(let i=0;i<rows.length;i++){
   const row=rows[i],barcode=required(row.product_barcode,`Row ${i+2}: product barcode`);
   if(/[\x00-\x1f\x7f]/.test(barcode))fail(`Row ${i+2}: product barcode contains control characters`);
   if(barcode.length>100)fail(`Row ${i+2}: product barcode exceeds 100 characters`);
   if(seen.has(barcode))fail(`Row ${i+2}: duplicate product barcode ${barcode}`);seen.add(barcode);
   const carton=asn.cartons.find(x=>x.type==='MASTER_CARTON'&&x.barcode===row.master_carton_barcode);
   if(!carton)fail(`Row ${i+2}: master carton does not belong to this ASN`);
   if(carton.status!=='EXPECTED')fail(`Row ${i+2}: cannot change a received/QC/putaway carton`,409);
   if(row.product_code!==carton.sku)fail(`Row ${i+2}: product code does not match master carton`);
   if(asn.cartons.some(x=>x.parent_id===carton.id))fail('This legacy carton has inner-carton stock; its original mapping is preserved');
   if(!groups.has(carton.id))groups.set(carton.id,{carton,serials:[]});groups.get(carton.id).serials.push(barcode);
  }
  let added=0;
  for(const {carton,serials} of groups.values()){
   if(serials.length!==carton.qty)fail(`${carton.barcode}: upload all ${carton.qty} pieces for this carton`);
   const existing=await query('SELECT * FROM assets WHERE master_carton_id=?',[carton.id],c);
   if(existing.some(a=>!serials.includes(a.serial)))fail(`${carton.barcode}: previously mapped barcodes cannot be replaced`);
   for(const serial of serials){
    const [asset]=await query('SELECT * FROM assets WHERE serial=? FOR UPDATE',[serial],c);
    if(asset){if(asset.master_carton_id!==carton.id||asset.asn_id!==id||asset.status!=='EXPECTED')fail(`Product barcode ${serial} is already assigned elsewhere`,409);continue;}
    await query("INSERT INTO assets(serial,product_id,status,location_id,master_carton_id,original_master_carton_id,asn_id) VALUES (?,?,'EXPECTED',?,?,?,?)",[serial,carton.product_id,carton.location_id,carton.id,carton.id,id],c);added++;
   }
  }
  await audit(c,req.user,'asn',id,'CARTON_MAPPING_IMPORTED',`${rows.length} product barcodes mapped to ${groups.size} master cartons`,{added});
  return {asn_id:id,cartons:groups.size,mapped_rows:rows.length,added};
 }));
});
inboundRouter.get('/asns/:id/labels',async(req,res)=>{const asn=await asnDetails(int(req.params.id,'ASN'),req.user);res.json({asn,labels:asn.cartons.filter(c=>c.type==='MASTER_CARTON').map(c=>({carton_id:c.id,barcode:c.barcode,type:c.type,product_code:c.sku,product_name:c.product_name,units_in_pack:c.qty,box_number:c.box_number||1,box_total:c.box_total||asn.cartons.filter(x=>x.type===c.type&&x.product_id===c.product_id).length,po_invoice:asn.po_no||asn.invoice_no||'',asn_no:asn.code,warehouse:asn.warehouse_code||asn.warehouse_name||asn.warehouse,parent_barcode:c.parent_barcode}))});});
