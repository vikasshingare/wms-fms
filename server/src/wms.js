import {createInboundAsn} from './inbound.js';
import {assertLocation} from './authorization.js';
import {query,decode,fail,required,int} from './db.js';
import {audit,move} from './data.js';

const code = prefix=>`${prefix}-${Date.now().toString().slice(-9)}${Math.floor(Math.random()*100).toString().padStart(2,'0')}`;
const admin = user=>{if(user.role!=='admin')fail('Warehouse operations permission required',403,'FORBIDDEN');};
export async function createAsn(c,user,b){
 if(b.lines){admin(user);return createInboundAsn(c,user,b);}
 admin(user);const [p]=await query('SELECT * FROM products WHERE id=?',[int(b.product_id,'Product')],c);if(!p)fail('Product not found');
 const inners=b.inner_cartons;if(!Array.isArray(inners)||inners.length!==p.inner_cartons_per_master)fail(`Expected ${p.inner_cartons_per_master} inner cartons`);
 const all=inners.flatMap(i=>i.serials||[]);if(inners.some(i=>!Array.isArray(i.serials)||i.serials.length!==p.units_per_inner_carton))fail(`Each inner carton must contain ${p.units_per_inner_carton} serials`);
 if(new Set(all).size!==all.length||all.some(s=>!String(s).trim()))fail('Serials must be non-empty and unique');
 const barcodes=[required(b.master_carton_barcode,'Master carton barcode'),...inners.map(i=>required(i.barcode,'Inner carton barcode'))];if(new Set(barcodes).size!==barcodes.length)fail('Carton barcodes must be unique');
 const [stage]=await query("SELECT id FROM locations WHERE type='STAGING' ORDER BY id LIMIT 1",[],c);
 await assertLocation(user,stage.id,c);
 const result=await query('INSERT INTO asns(code,vendor,product_id,expected_qty,expected_date) VALUES (?,?,?,?,?)',[code('ASN'),required(b.vendor,'Vendor'),p.id,all.length,b.expected_date||new Date().toISOString().slice(0,10)],c);
 const mc=await query("INSERT INTO cartons(barcode,type,product_id,asn_id,qty,location_id) VALUES (?,'MASTER_CARTON',?,?,?,?)",[barcodes[0],p.id,result.insertId,all.length,stage.id],c);
 for(const inner of inners){const ic=await query("INSERT INTO cartons(barcode,type,parent_id,original_parent_id,product_id,asn_id,qty,location_id) VALUES (?,'INNER_CARTON',?,?,?,?,?,?)",[inner.barcode,mc.insertId,mc.insertId,p.id,result.insertId,inner.serials.length,stage.id],c);for(const serial of inner.serials)await query("INSERT INTO assets(serial,product_id,status,location_id,inner_carton_id,master_carton_id,original_inner_carton_id,original_master_carton_id,asn_id) VALUES (?,?,'EXPECTED',?,?,?,?,?,?)",[serial,p.id,stage.id,ic.insertId,mc.insertId,ic.insertId,mc.insertId,result.insertId],c);}
 await audit(c,user,'asn',result.insertId,'CREATED',`ASN created for ${all.length} ${p.name} units`);return {id:result.insertId};
}
export async function receiveAsn(c,user,id,b,{manifestMapping=false}={}){
 admin(user);const [asn]=await query('SELECT * FROM asns WHERE id=? FOR UPDATE',[id],c);if(!asn)fail('ASN not found',404);
 if(!manifestMapping&&(await query('SELECT asn_id FROM inbound_entries WHERE asn_id=? AND manifest_counts IS NOT NULL',[id],c)).length)fail('Receive this carton through the manifest putaway mapping',409);
 const [carton]=await query("SELECT * FROM cartons WHERE barcode=? AND asn_id=? AND type='MASTER_CARTON' FOR UPDATE",[required(b.barcode,'Master carton barcode'),id],c);if(!carton)fail('Master carton does not belong to this ASN');if(carton.status!=='EXPECTED')fail('This carton has already been received',409,'DUPLICATE_RECEIPT');
 const assets=await query('SELECT * FROM assets WHERE master_carton_id=? FOR UPDATE',[carton.id],c);const scans=b.serials;
 if(assets.length!==carton.qty)fail('Upload the complete product-barcode mapping CSV for this master carton before receipt',409,'MAPPING_INCOMPLETE');
 if(!Array.isArray(scans)||new Set(scans).size!==scans.length||scans.length!==assets.length||assets.some(a=>!scans.includes(a.serial)))fail('Scanned serials must exactly match the expected carton contents');
 if(assets.some(a=>a.status!=='EXPECTED'))fail('One or more serials have already been received',409);
 const grn=code('GRN');await query("UPDATE cartons SET status='RECEIVED',grn_code=? WHERE id=? OR parent_id=?",[grn,carton.id,carton.id],c);await query("UPDATE assets SET status='RECEIVED',grn_code=? WHERE master_carton_id=?",[grn,carton.id],c);
 await query("UPDATE asns SET received_qty=received_qty+?,status=IF(received_qty>=expected_qty,'RECEIVED','PARTIAL') WHERE id=?",[assets.length,id],c);
 await query("INSERT INTO movements(carton_id,from_location_id,to_location_id,movement_type,source_type,source_id,actor_id,notes) VALUES (?,NULL,?,'RECEIPT','asn',?,?,?)",[carton.id,carton.location_id,id,user.id,grn],c);
 for(const a of assets)await query("INSERT INTO movements(asset_id,from_location_id,to_location_id,movement_type,source_type,source_id,actor_id,notes) VALUES (?,NULL,?,'RECEIPT','asn',?,?,?)",[a.id,a.location_id,id,user.id,grn],c);
 await audit(c,user,'asn',id,'RECEIVED',`${asn.code} received · ${grn}`);return {id,grn_code:grn,status:'RECEIVED'};
}
async function chooseBin(c,productId,qty,asnId=null){
 const [asn]=asnId?await query('SELECT warehouse_id FROM asns WHERE id=?',[asnId],c):[];
 const args=[productId];let scope='';if(asn?.warehouse_id){scope=" AND l.id IN (SELECT location_id FROM inbound_masters WHERE warehouse_id=? AND kind IN ('PALLET','ZONE') AND location_id IS NOT NULL)";args.push(asn.warehouse_id);}
 const bins=await query("SELECT l.*, (SELECT COUNT(*) FROM assets a WHERE a.location_id=l.id AND a.status<>'EXPECTED') used FROM locations l WHERE l.type='BIN' AND (l.product_id IS NULL OR l.product_id=?)"+scope+" ORDER BY (l.product_id IS NULL),l.id",args,c);
 const bin=bins.find(l=>l.capacity-l.used>=qty);if(!bin)fail('No compatible bin/pallet with capacity under this warehouse/hub; configure its zones and storage locations first');return bin;
}
export async function qcCarton(c,user,id,b){
 admin(user);const [carton]=await query('SELECT * FROM cartons WHERE id=? FOR UPDATE',[id],c);if(!carton)fail('Carton not found',404);if(carton.parent_id)fail('QC the intact parent master carton, or break it first');if(carton.status!=='RECEIVED')fail('QC is only available for received cartons',409);
 if(!['PASS','FAIL'].includes(b.result))fail('QC result must be PASS or FAIL');const passed=b.result==='PASS';if(!passed)required(b.reason,'QC failure reason');
 const [quarantine]=await query("SELECT * FROM locations WHERE type='QUARANTINE' LIMIT 1",[],c);
 const status=passed?'QC_PASSED':'QUARANTINE';const destination=passed?carton.location_id:quarantine.id;
 await query('UPDATE cartons SET status=?,location_id=? WHERE id=? OR parent_id=?',[status,destination,id,id],c);
 const assetWhere=carton.type==='MASTER_CARTON'?'master_carton_id':'inner_carton_id';
 const assets=await query(`SELECT * FROM assets WHERE ${assetWhere}=? FOR UPDATE`,[id],c);
 if(!passed){for(const a of assets)await move(c,user,a,destination,'QUARANTINE','QC_REJECT','carton',id,{condition:'DAMAGED'});}else await query(`UPDATE assets SET status='RECEIVED' WHERE ${assetWhere}=?`,[id],c);
 if(passed){const bin=await chooseBin(c,carton.product_id,carton.qty,carton.asn_id);await query('INSERT INTO putaway_tasks(code,carton_id,product_id,expected_qty,source_location_id,suggested_location_id) VALUES (?,?,?,?,?,?)',[code('PA'),id,carton.product_id,carton.qty,carton.location_id,bin.id],c);}
 await audit(c,user,'carton',id,status,`${carton.barcode} · ${passed?'QC passed, putaway task created':`quarantined: ${b.reason}`}`);return {id,status};
}
export async function confirmPutaway(c,user,id,b){
 admin(user);const [task]=await query('SELECT * FROM putaway_tasks WHERE id=? FOR UPDATE',[id],c);if(!task)fail('Putaway task not found',404);if(task.status==='COMPLETED')fail('This handling unit has already been put away',409,'DUPLICATE_PUTAWAY');if(!['OPEN','PARTIAL'].includes(task.status))fail('Task cannot be confirmed in its current state');
 const [destination]=await query('SELECT * FROM locations WHERE id=? FOR UPDATE',[int(b.destination_location_id,'Destination bin')],c);if(!destination||destination.type!=='BIN')fail('Destination must be a storage bin');if(destination.product_id&&destination.product_id!==task.product_id)fail('Wrong bin: this product is not permitted here',409,'WRONG_BIN');
 if(Number(b.source_location_id)!==task.source_location_id)fail('Scanned source does not match the task staging location');
 let assets,carton=null;
 if(task.carton_id){[carton]=await query('SELECT * FROM cartons WHERE id=? FOR UPDATE',[task.carton_id],c);if(carton.barcode!==b.barcode)fail('Scanned handling unit does not match this task');if(carton.parent_id)fail('Break the parent carton before moving an inner carton independently',409,'CARTON_INTACT');if(carton.status!=='QC_PASSED'||carton.location_id!==task.source_location_id)fail('Carton is not eligible at the source location');const col=carton.type==='MASTER_CARTON'?'master_carton_id':'inner_carton_id';assets=await query(`SELECT * FROM assets WHERE ${col}=? FOR UPDATE`,[carton.id],c);}else{assets=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[task.asset_id],c);if(assets[0]?.serial!==b.barcode)fail('Scanned serial does not match this task');if(assets[0].inner_carton_id||assets[0].master_carton_id)fail('Break the carton before moving loose stock');}
 const asnId=carton?.asn_id||assets[0]?.asn_id;const [asn]=asnId?await query('SELECT warehouse_id FROM asns WHERE id=?',[asnId],c):[];
 if(asn?.warehouse_id&&!(await query("SELECT id FROM inbound_masters WHERE warehouse_id=? AND kind IN ('PALLET','ZONE') AND location_id=?",[asn.warehouse_id,destination.id],c)).length)fail('Destination bin/pallet belongs to another warehouse/hub',403);
 if(assets.length!==task.expected_qty||assets.some(a=>a.location_id!==task.source_location_id||a.status!=='RECEIVED'))fail('Quantity, source location or QC status changed; review this handling unit',409);
 const [[capacity]]=[await query("SELECT COUNT(*) used FROM assets WHERE location_id=? AND status<>'EXPECTED'",[destination.id],c)];if(capacity.used+assets.length>destination.capacity)fail('Destination bin capacity exceeded',409,'BIN_CAPACITY');
 if(carton){await query("UPDATE cartons SET location_id=?,status='STORED' WHERE id=? OR parent_id=?",[destination.id,carton.id,carton.id],c);await query("INSERT INTO movements(carton_id,from_location_id,to_location_id,movement_type,source_type,source_id,actor_id) VALUES (?,?,?,'PUTAWAY','putaway',?,?)",[carton.id,carton.location_id,destination.id,id,user.id],c);}
 for(const a of assets)await move(c,user,a,destination.id,'AVAILABLE','PUTAWAY','putaway',id);
 await query("UPDATE putaway_tasks SET status='COMPLETED',actual_location_id=?,putaway_qty=expected_qty,completed_at=UTC_TIMESTAMP(),operator_user_id=? WHERE id=?",[destination.id,user.id,id],c);
 await audit(c,user,'putaway',id,'COMPLETED',`${b.barcode} put away to ${destination.code} · ${assets.length} units`);return {id,status:'COMPLETED',qty:assets.length};
}
export async function breakCarton(c,user,id,b){
 admin(user);const [parent]=await query('SELECT * FROM cartons WHERE id=? FOR UPDATE',[id],c);if(!parent)fail('Carton not found',404);if(!['RECEIVED','QC_PASSED','STORED'].includes(parent.status))fail('Only accepted, received cartons can be broken');if(parent.parent_id)fail('Detach this inner carton from the master carton first');required(b.reason,'Break reason');
 let removedQty=0;
 const children=parent.type==='MASTER_CARTON'?await query('SELECT id FROM cartons WHERE parent_id=?',[id],c):[];
 if(parent.type==='MASTER_CARTON'&&children.length){
  const ids=b.child_ids;if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)fail('Select unique inner cartons to remove');
  for(const childId of ids){const [child]=await query('SELECT * FROM cartons WHERE id=? AND parent_id=? FOR UPDATE',[childId,id],c);if(!child)fail('Inner carton does not belong to this master carton');removedQty+=child.qty;await query('UPDATE cartons SET parent_id=NULL WHERE id=?',[childId],c);await query('UPDATE assets SET master_carton_id=NULL WHERE inner_carton_id=?',[childId],c);if(parent.status==='QC_PASSED'){const bin=await chooseBin(c,parent.product_id,child.qty,parent.asn_id);await query('INSERT INTO putaway_tasks(code,carton_id,product_id,expected_qty,source_location_id,suggested_location_id) VALUES (?,?,?,?,?,?)',[code('PA'),childId,parent.product_id,child.qty,parent.location_id,bin.id],c);}}
 }else{
  const serials=b.serials;if(!Array.isArray(serials)||!serials.length||new Set(serials).size!==serials.length)fail('Select unique serials to remove');
  for(const serial of serials){const col=parent.type==='MASTER_CARTON'?'master_carton_id':'inner_carton_id';const [asset]=await query(`SELECT * FROM assets WHERE serial=? AND ${col}=? FOR UPDATE`,[serial,id],c);if(!asset||parent.type==='MASTER_CARTON'&&asset.inner_carton_id)fail('Serial does not belong directly to this carton');removedQty++;await query('UPDATE assets SET inner_carton_id=NULL,master_carton_id=NULL WHERE id=?',[asset.id],c);if(parent.status==='QC_PASSED'){const bin=await chooseBin(c,parent.product_id,1,parent.asn_id);await query('INSERT INTO putaway_tasks(code,asset_id,product_id,expected_qty,source_location_id,suggested_location_id) VALUES (?,?,?,1,?,?)',[code('PA'),asset.id,parent.product_id,parent.location_id,bin.id],c);}}
 }
 if(removedQty>parent.qty)fail('Removed quantity exceeds carton contents');
 const remaining=parent.qty-removedQty;await query('UPDATE cartons SET sealed=FALSE,qty=?,status=IF(?=0,\'EMPTY\',status) WHERE id=?',[remaining,remaining,id],c);
 await query("UPDATE putaway_tasks SET expected_qty=?,status=IF(?=0,'CANCELLED','PARTIAL') WHERE carton_id=? AND status IN ('OPEN','PARTIAL')",[remaining,remaining,id],c);
 await query('INSERT INTO carton_break_events(parent_id,child_ids,serials,reason,actor_id) VALUES (?,?,?,?,?)',[id,JSON.stringify(b.child_ids||[]),JSON.stringify(b.serials||[]),b.reason,user.id],c);
 await audit(c,user,'carton',id,'CARTON_BROKEN',`${parent.barcode} opened · ${removedQty} units detached · ${b.reason}`,{removed_qty:removedQty,remaining_qty:remaining});return {id,removed_qty:removedQty,remaining_qty:remaining};
}
export async function createTransfer(c,user,b){
 admin(user);const source=int(b.source_location_id,'Source'),destination=int(b.destination_location_id,'Destination');if(source===destination)fail('Source and destination must differ');
 const [dest]=await query('SELECT * FROM locations WHERE id=?',[destination],c);if(!dest||!['HUB','BIN','ENGINEER'].includes(dest.type))fail('Select a hub, storage bin or engineer destination');
 const ids=b.asset_ids;if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)fail('Select unique assets');
 for(const id of [...ids].sort((a,b)=>a-b)){const [a]=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[id],c);if(!a||a.location_id!==source||a.status!=='AVAILABLE')fail('All assets must be available at the source');if(a.inner_carton_id||a.master_carton_id)fail('Break carton hierarchy before picking loose assets',409,'CARTON_INTACT');if(dest.product_id&&dest.product_id!==a.product_id)fail('Destination does not permit this product');await query("UPDATE assets SET status='RESERVED' WHERE id=?",[id],c);}
 const r=await query('INSERT INTO transfers(code,source_location_id,destination_location_id,asset_ids,created_by) VALUES (?,?,?,?,?)',[code('ST'),source,destination,JSON.stringify(ids),user.id],c);await audit(c,user,'transfer',r.insertId,'RESERVED',`${ids.length} assets reserved for transfer`);return {id:r.insertId};
}
export async function transferAction(c,user,id,action,b){
 if(user.role==='customer')fail('Stock permission required',403,'FORBIDDEN');const [t]=await query('SELECT * FROM transfers WHERE id=? FOR UPDATE',[id],c);if(!t)fail('Transfer not found',404);const ids=decode(t.asset_ids,[]);
 if(action==='dispatch'){
  if(t.outbound)fail('Ship this order through Gate ship-out',409);
  admin(user);if(t.status!=='RESERVED')fail('Only reserved transfers can be dispatched',409);for(const assetId of ids){const [a]=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[assetId],c);if(a.location_id!==t.source_location_id||a.status!=='RESERVED')fail('Reserved stock changed');await query("UPDATE assets SET status='IN_TRANSIT' WHERE id=?",[a.id],c);await query("INSERT INTO movements(asset_id,from_location_id,to_location_id,movement_type,source_type,source_id,actor_id) VALUES (?,?,?,'DISPATCH','transfer',?,?)",[a.id,a.location_id,t.destination_location_id,id,user.id],c);}await query("UPDATE transfers SET status='IN_TRANSIT',dispatched_at=UTC_TIMESTAMP() WHERE id=?",[id],c);
 }else{
  if(decode(t.outbound)?.destination_warehouse)fail('Receive this warehouse transfer through its inbound ASN and putaway mapping',409);
  if(user.role==='engineer'&&t.destination_location_id!==user.location_id)fail('You can only accept stock sent to you',403,'FORBIDDEN');if(t.status!=='IN_TRANSIT')fail('Transfer must be dispatched before receipt',409);
  const assets=[];for(const assetId of [...ids].sort((a,b)=>a-b)){const [a]=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[assetId],c);assets.push(a);}
  if(!Array.isArray(b.serials)||b.serials.length!==assets.length||new Set(b.serials).size!==b.serials.length||assets.some(a=>!b.serials.includes(a.serial)))fail('Scanned serials must exactly match the dispatch');
  const [dest]=await query('SELECT * FROM locations WHERE id=? FOR UPDATE',[t.destination_location_id],c);const [used]=await query("SELECT COUNT(*) used FROM assets WHERE location_id=? AND status<>'EXPECTED'",[dest.id],c);if(used.used+assets.length>dest.capacity)fail('Destination capacity exceeded');const [holder]=dest.type==='ENGINEER'?await query("SELECT id FROM users WHERE location_id=? AND role IN ('engineer','FIELD_ENGINEER')",[dest.id],c):[];if(dest.type==='ENGINEER'&&!holder)fail('Destination engineer is not configured');
  for(const a of assets){if(a.status!=='IN_TRANSIT')fail('Transfer asset is no longer in transit',409);await move(c,user,a,dest.id,holder?'ISSUED_TO_ENGINEER':'AVAILABLE','TRANSFER_RECEIPT','transfer',id,{holder_user_id:holder?.id});}await query("UPDATE transfers SET status='RECEIVED',received_at=UTC_TIMESTAMP() WHERE id=?",[id],c);
 }
 await audit(c,user,'transfer',id,action==='dispatch'?'DISPATCHED':'RECEIVED',`${t.code} ${action==='dispatch'?'dispatched':'received'}`);return {id,status:action==='dispatch'?'IN_TRANSIT':'RECEIVED'};
}
export async function createReturn(c,user,b){
 if(user.role==='customer')fail('Engineer or operations permission required',403);const [a]=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[int(b.asset_id,'Asset')],c);if(!a)fail('Asset not found',404);
 if(user.role==='engineer'&&a.holder_user_id!==user.id)fail('Asset is not in your custody',403);if(!['ISSUED_TO_ENGINEER','RETURNED_TO_ENGINEER'].includes(a.status))fail('Only engineer-held stock can be returned');
 const [dest]=await query('SELECT * FROM locations WHERE id=?',[int(b.destination_location_id,'Destination')],c);if(!dest||!['HUB','QUARANTINE','REPAIR'].includes(dest.type))fail('Returns must go to a hub, quarantine or repair centre');
 const existing=await query("SELECT id FROM return_records WHERE asset_id=? AND status='AWAITING_RECEIPT'",[a.id],c);if(existing.length)fail('A return is already pending for this serial',409);
 const r=await query('INSERT INTO return_records(code,asset_id,source_location_id,destination_location_id,reason,`condition`,created_by) VALUES (?,?,?,?,?,?,?)',[code('RT'),a.id,a.location_id,dest.id,required(b.reason,'Return reason'),b.condition||'USED',user.id],c);
 await audit(c,user,'return',r.insertId,'RETURN_REQUESTED',`Return requested for ${a.serial}; engineer retains custody until receipt`);return {id:r.insertId,status:'AWAITING_RECEIPT'};
}
export async function receiveReturn(c,user,id){admin(user);const [r]=await query('SELECT * FROM return_records WHERE id=? FOR UPDATE',[id],c);if(!r)fail('Return not found',404);if(r.status!=='AWAITING_RECEIPT')fail('Return is already received',409);const [a]=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[r.asset_id],c);if(a.location_id!==r.source_location_id)fail('Asset custody changed; review the return');await move(c,user,a,r.destination_location_id,'RETURNED_WAREHOUSE','RETURN_RECEIPT','return',id,{condition:r.condition});await query("UPDATE return_records SET status='RECEIVED',received_at=UTC_TIMESTAMP() WHERE id=?",[id],c);await audit(c,user,'return',id,'RECEIVED',`${r.code} received; custody transferred to destination`);return {id,status:'RECEIVED'};}
export async function dispositionReturn(c,user,id,b){
 admin(user);const [r]=await query('SELECT * FROM return_records WHERE id=? FOR UPDATE',[id],c);if(!r)fail('Return not found',404);if(!['RECEIVED','REPAIR'].includes(r.status))fail('Return must be received or under repair before disposition');if(!['AVAILABLE','REPAIR','REFURBISHED','SCRAP'].includes(b.disposition))fail('Select a valid disposition');required(b.reason,'Disposition / QC reason');const [a]=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[r.asset_id],c);
 let dest=a.location_id,status=b.disposition,condition=a.condition;if(b.disposition==='REPAIR'){const [repair]=await query("SELECT id FROM locations WHERE type='REPAIR' LIMIT 1",[],c);dest=repair.id;}if(['AVAILABLE','REFURBISHED'].includes(b.disposition)){const bin=await chooseBin(c,a.product_id,1);dest=bin.id;status='AVAILABLE';condition=b.disposition==='REFURBISHED'?'REFURBISHED':'GOOD';}if(b.disposition==='SCRAP')condition='SCRAP';
 await move(c,user,a,dest,status,`DISPOSITION_${b.disposition}`,'return',id,{condition,notes:b.reason});await query('UPDATE return_records SET status=?,disposition=? WHERE id=?',[b.disposition==='REPAIR'?'REPAIR':'CLOSED',b.disposition,id],c);await audit(c,user,'return',id,b.disposition,`${a.serial} · ${b.disposition.toLowerCase()} · ${b.reason}`);return {id,status:b.disposition==='REPAIR'?'REPAIR':'CLOSED'};
}
