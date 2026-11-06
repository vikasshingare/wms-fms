import {query,decode,fail} from './db.js';
import {audit,move} from './data.js';
import {assertLocation} from './authorization.js';

// Cartons keep their original ASN and globally unique barcode. Each receiving
// ASN references that identity and stores its own immutable shipment mapping.
export async function validateWholeCartons(c,picks){
 const ids=new Set(picks.map(p=>p.id));
 for(const pick of picks)if(!pick.master_barcode)fail('Warehouse transfers require complete master cartons with product barcodes.',409);
 for(const barcode of new Set(picks.map(p=>p.master_barcode))){
  const [carton]=await query('SELECT id,qty,status,sealed FROM cartons WHERE barcode=? FOR UPDATE',[barcode],c);
  const contents=await query('SELECT id,serial FROM assets WHERE master_carton_id=? ORDER BY id FOR UPDATE',[carton.id],c);
  const planned=picks.filter(p=>p.master_barcode===barcode);
  if(carton.status!=='STORED'||!carton.sealed||!contents.length||contents.length!==carton.qty||contents.length!==planned.length||contents.some(a=>!ids.has(a.id)||planned.find(p=>p.id===a.id)?.serial!==a.serial))fail(`Transfer the complete intact master carton ${barcode}; adjust the quantity to a full carton.`,409);
 }
}

export async function createTransferAsn(c,user,t){
 const meta=t.outbound,warehouse=meta.destination_warehouse;
 if(!warehouse)return null;
 const [prior]=await query('SELECT asn_id FROM transfer_asns WHERE transfer_id=?',[t.id],c);
 if(prior)return prior.asn_id;
 const picks=meta.picks;
 const result=await query(`INSERT INTO asns(code,vendor,product_id,warehouse,expected_qty,warehouse_id,receiving_location_id,shipping_reference,invoice_no)
  VALUES (?,?,?,?,?,?,?,?,?)`,[`TRASN-${t.id}`,meta.warehouse.name,picks[0].product_id,warehouse.name,picks.length,warehouse.id,warehouse.location_id,t.code,meta.order_no],c);
 const asnId=result.insertId;
 await query('INSERT INTO transfer_asns(asn_id,transfer_id,source_warehouse_id,destination_warehouse_id) VALUES (?,?,?,?)',[asnId,t.id,meta.warehouse.id,warehouse.id],c);
 for(const line of meta.lines){
  const rows=picks.filter(p=>p.product_id===line.product_id);
  const masters=[...new Set(rows.map(p=>p.master_barcode))];
  const [product]=await query('SELECT * FROM products WHERE id=?',[line.product_id],c);
  const inserted=await query('INSERT INTO asn_lines(asn_id,product_id,expected_qty,expected_boxes,units_per_inner,inners_per_master) VALUES (?,?,?,?,?,?)',[asnId,line.product_id,rows.length,masters.length,product.units_per_inner_carton,product.inner_cartons_per_master],c);
  for(const barcode of masters){
   const [carton]=await query('SELECT id FROM cartons WHERE barcode=?',[barcode],c);
   const mapping=rows.filter(p=>p.master_barcode===barcode).map(p=>({asset_id:p.id,product_barcode:p.serial}));
   await query('INSERT INTO transfer_asn_cartons(asn_id,carton_id,asn_line_id,mapping) VALUES (?,?,?,?)',[asnId,carton.id,inserted.insertId,JSON.stringify(mapping)],c);
   await query("UPDATE cartons SET status='IN_TRANSIT' WHERE id=? OR parent_id=?",[carton.id,carton.id],c);
   await query("INSERT INTO movements(carton_id,from_location_id,to_location_id,movement_type,source_type,source_id,actor_id) VALUES (?,?,?,'CARTON_DISPATCH','transfer',?,?)",[carton.id,rows.find(p=>p.master_barcode===barcode).location_id,warehouse.location_id,t.id,user.id],c);
  }
 }
 await audit(c,user,'asn',asnId,'TRANSFER_ASN_CREATED',`${t.code}: ${meta.warehouse.name} → ${warehouse.name}; existing barcodes retained`);
 return asnId;
}

export async function processTransferMapping(c,user,asn,groups,manifest,defaultDestination=null){
 const [link]=await query('SELECT * FROM transfer_asns WHERE asn_id=?',[asn.id],c);
 if(!link)return false;
 const [transfer]=await query('SELECT status FROM transfers WHERE id=? FOR UPDATE',[link.transfer_id],c);
 if(!['IN_TRANSIT','RECEIVED'].includes(transfer.status))fail('Transfer has not shipped',409);
 const receipts=await query('SELECT r.*,c.barcode,c.product_id FROM transfer_asn_cartons r JOIN cartons c ON c.id=r.carton_id WHERE r.asn_id=? ORDER BY c.id FOR UPDATE',[asn.id],c);
 const used={};
 for(const row of receipts)if(row.outcome){const key=`${row.asn_line_id}:${row.outcome}`;used[key]=(used[key]||0)+1;}
 for(const [barcode,group] of groups){
  const receipt=receipts.find(r=>r.barcode===barcode);
  if(!receipt)fail(`Master carton ${barcode} does not belong to this transfer ASN`);
  const mapping=decode(receipt.mapping,[]);
  if(group.serials.length!==mapping.length||group.serials.some(serial=>!mapping.some(m=>m.product_barcode===serial)))fail(`Keep the original master and product barcode mapping for ${barcode}`);
  const [bin]=await query(`SELECT l.* FROM inbound_masters m JOIN locations l ON l.id=m.location_id
   WHERE m.active=1 AND m.warehouse_id=? AND m.kind='PALLET' AND l.type='BIN' AND (m.code=? OR l.code=? OR l.id=?)`,[link.destination_warehouse_id,group.location||'',group.location||'',group.location?null:defaultDestination],c);
  if(!bin)fail(`Enter an authorized destination warehouse bin in putaway_location for ${barcode}`);
  await assertLocation(user,bin.id,c);
  if(bin.product_id&&bin.product_id!==receipt.product_id)fail('Destination bin does not accept this product');
  if(receipt.processed_at){
   if(receipt.outcome===group.outcome&&receipt.destination_location_id===bin.id)continue;
   fail(`Carton ${barcode} was already received at another location or condition`,409);
  }
  const key=`${receipt.asn_line_id}:${group.outcome}`;
  if((used[key]||0)>=Number(manifest[receipt.asn_line_id]?.[group.outcome]||0))fail(`No ${group.outcome} boxes remain on this manifest`);
  used[key]=(used[key]||0)+1;
  await query('SELECT id FROM locations WHERE id=? FOR UPDATE',[bin.id],c);
  const [occupied]=await query("SELECT COUNT(*) qty FROM assets WHERE location_id=? AND status<>'EXPECTED'",[bin.id],c);
  if(Number(occupied.qty)+mapping.length>bin.capacity)fail('Destination capacity exceeded');
  for(const item of [...mapping].sort((a,b)=>a.asset_id-b.asset_id)){
   const [asset]=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[item.asset_id],c);
   if(asset.status!=='IN_TRANSIT'||asset.master_carton_id!==receipt.carton_id)fail('Transferred carton contents changed',409);
   await move(c,user,asset,bin.id,group.outcome==='GOOD'?'AVAILABLE':'QUARANTINE','TRANSFER_RECEIPT','asn',asn.id,{condition:group.outcome==='GOOD'?asset.condition:group.outcome});
  }
  await query("UPDATE cartons SET location_id=?,status=? WHERE id=? OR parent_id=?",[bin.id,group.outcome==='GOOD'?'STORED':'QUARANTINE',receipt.carton_id,receipt.carton_id],c);
  await query('UPDATE transfer_asn_cartons SET outcome=?,destination_location_id=?,processed_at=UTC_TIMESTAMP() WHERE asn_id=? AND carton_id=?',[group.outcome,bin.id,asn.id,receipt.carton_id],c);
  await query("INSERT INTO movements(carton_id,from_location_id,to_location_id,movement_type,source_type,source_id,actor_id) VALUES (?,?,?,'CARTON_PUTAWAY','asn',?,?)",[receipt.carton_id,asn.receiving_location_id,bin.id,asn.id,user.id],c);
  await query("UPDATE asns SET received_qty=received_qty+?,status=IF(received_qty>=expected_qty,'RECEIVED','PARTIAL') WHERE id=?",[mapping.length,asn.id],c);
  await audit(c,user,'asn',asn.id,'TRANSFER_CARTON_PUTAWAY',`${barcode} → ${bin.code} (${group.outcome})`);
 }
 const [remaining]=await query('SELECT COUNT(*) qty FROM transfer_asn_cartons WHERE asn_id=? AND processed_at IS NULL',[asn.id],c);
 if(!Number(remaining.qty))await query("UPDATE transfers SET status='RECEIVED',received_at=UTC_TIMESTAMP() WHERE id=?",[link.transfer_id],c);
 return true;
}
