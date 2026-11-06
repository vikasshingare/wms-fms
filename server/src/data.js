import {canonicalRole,globalRole,scopedBootstrap,permittedLocations,assertLocation,policies} from './authorization.js';
import {query,decode,fail} from './db.js';

export const publicUser = u => {
 const role=canonicalRole(u.authorization_role||u.role);
 return {id:u.id,name:u.name,email:u.email,role,customer_id:u.customer_id,location_id:u.location_id,region:u.region,permissions:policies[role]||[]};
};
export const workSelect = `SELECT w.*,c.name customer_name,s.name site_name,s.code site_code,s.address,s.city,s.contact_name,s.contact_phone,s.latitude,s.longitude,s.location_id site_location_id,e.name engineer_name,a.serial,aa.serial allocated_serial,p.name product_name FROM work_orders w JOIN customers c ON c.id=w.customer_id JOIN sites s ON s.id=w.site_id LEFT JOIN users e ON e.id=w.engineer_id LEFT JOIN assets a ON a.id=w.asset_id LEFT JOIN assets aa ON aa.id=w.allocated_asset_id LEFT JOIN products p ON p.id=w.product_id`;
export const assetSelect = `SELECT a.*,p.name product_name,p.sku,p.model,l.name location_name,l.type location_type,c.name customer_name FROM assets a JOIN products p ON p.id=a.product_id JOIN locations l ON l.id=a.location_id LEFT JOIN customers c ON c.id=a.customer_id`;
export const normalizeWork = w => ({...w,checklist:decode(w.checklist,[]),evidence:decode(w.evidence,[]),confirmation:decode(w.confirmation,null)});
export function workScope(user,alias='w') {return user.role==='customer'?{sql:`${alias}.customer_id=?`,args:[user.customer_id]}:user.role==='engineer'?{sql:`${alias}.engineer_id=?`,args:[user.id]}:globalRole(user)?{sql:'1=1',args:[]}:{sql:`${alias}.site_id IN (SELECT id FROM sites WHERE location_id IN (SELECT location_id FROM user_location_scopes WHERE user_id=?) OR location_id=? OR (region=? AND ? IN ('REGIONAL_MANAGER','COORDINATOR','REGIONAL_STOCK_MANAGER')))`,args:[user.id,user.location_id||0,user.region||'__DENIED__',user.authorization_role]};}
export async function getWork(id,user,c,lock=false){const s=workScope(user);const rows=await query(`${workSelect} WHERE w.id=? AND ${s.sql}${lock?' FOR UPDATE':''}`,[id,...s.args],c);if(!rows.length)fail('Work order not found',404,'NOT_FOUND');return normalizeWork(rows[0]);}
export async function getWorks(user,c){const s=workScope(user);return (await query(`${workSelect} WHERE ${s.sql} ORDER BY w.created_at DESC,w.id DESC`,s.args,c)).map(normalizeWork);}
export async function getAssets(user,c){let sql='1=1',args=[];if(user.role==='customer'){sql='a.customer_id=? AND a.site_id IS NOT NULL';args=[user.customer_id];}if(user.role==='engineer'){sql='(a.holder_user_id=? OR a.site_id IN (SELECT site_id FROM work_orders WHERE engineer_id=?))';args=[user.id,user.id];}const rows=await query(`${assetSelect} WHERE ${sql} ORDER BY a.id DESC`,args,c);if(!globalRole(user)&&!['customer','engineer'].includes(user.role)){const ids=await permittedLocations(user,c);return rows.filter(a=>ids.includes(a.location_id));}return user.role==='engineer'?rows.filter(a=>a.holder_user_id===user.id):rows;}
export async function getAssetBySerial(serial,user,c,lock=false){const rows=await query(`${assetSelect} WHERE a.serial=?${lock?' FOR UPDATE':''}`,[serial],c);if(!rows.length)fail('Serial number not found',404,'NOT_FOUND');const a=rows[0];if(user.role==='customer' && (a.customer_id!==user.customer_id||!a.site_id))fail('Asset is outside your customer scope',403,'FORBIDDEN');if(user.role==='engineer'&&a.holder_user_id!==user.id){const allowed=await query('SELECT id FROM work_orders WHERE engineer_id=? AND site_id=? LIMIT 1',[user.id,a.site_id],c);if(!allowed.length)fail('Asset is not in your custody or assigned site',403,'FORBIDDEN');}if(!globalRole(user)&&user.role!=='customer'&&user.role!=='engineer')await assertLocation(user,a.location_id,c);return a;}
export async function audit(c,user,entity_type,entity_id,action,description,metadata=null){await query('INSERT INTO activities(entity_type,entity_id,action,description,actor_id,metadata) VALUES (?,?,?,?,?,?)',[entity_type,entity_id,action,description,user.id,metadata?JSON.stringify(metadata):null],c);}
export async function move(c,user,asset,location_id,status,type,source_type,source_id,extra={}){
 await query('INSERT INTO movements(asset_id,from_location_id,to_location_id,movement_type,source_type,source_id,actor_id,notes) VALUES (?,?,?,?,?,?,?,?)',[asset.id,asset.location_id,location_id,type,source_type,source_id,user.id,extra.notes||null],c);
 await query('UPDATE assets SET location_id=?,status=?,holder_user_id=?,site_id=?,customer_id=?,`condition`=? WHERE id=?',[location_id,status,extra.holder_user_id??null,extra.site_id??null,extra.customer_id??asset.customer_id,extra.condition||asset.condition,asset.id],c);
}
export async function getCartons(c){const rows=await query(`SELECT c.*,p.name product_name,a.code asn_code,l.name location_name FROM cartons c JOIN products p ON p.id=c.product_id JOIN asns a ON a.id=c.asn_id JOIN locations l ON l.id=c.location_id ORDER BY c.id`,[],c);const serials=await query('SELECT serial,inner_carton_id,master_carton_id FROM assets WHERE inner_carton_id IS NOT NULL OR master_carton_id IS NOT NULL',[],c);return rows.map(r=>({...r,sealed:!!r.sealed,children:rows.filter(x=>x.parent_id===r.id).map(x=>({...x,serials:serials.filter(a=>a.inner_carton_id===x.id).map(a=>a.serial)})),serials:serials.filter(a=>r.type==='MASTER_CARTON'?a.master_carton_id===r.id:a.inner_carton_id===r.id).map(a=>a.serial)}));}
export async function getPutaway(c){return query(`SELECT t.*,COALESCE(c.barcode,a.serial) barcode,COALESCE(c.type,'SERIAL') handling_unit_type,p.name product_name,s.name source_name,d.name suggested_name,asn.code asn_code FROM putaway_tasks t LEFT JOIN cartons c ON c.id=t.carton_id LEFT JOIN assets a ON a.id=t.asset_id JOIN products p ON p.id=t.product_id JOIN locations s ON s.id=t.source_location_id JOIN locations d ON d.id=t.suggested_location_id LEFT JOIN asns asn ON asn.id=COALESCE(c.asn_id,a.asn_id) ORDER BY t.id DESC`,[],c);}
export async function getTransfers(user,c){
 const scope=user.role==='engineer'?"WHERE (t.destination_location_id=? OR t.source_location_id=?) AND (t.outbound IS NULL OR t.status IN ('IN_TRANSIT','RECEIVED'))":'';
 const rows=await query(`SELECT t.*,s.name source_name,d.name destination_name FROM transfers t JOIN locations s ON s.id=t.source_location_id JOIN locations d ON d.id=t.destination_location_id ${scope} ORDER BY t.id DESC`,user.role==='engineer'?[user.location_id,user.location_id]:[],c);
 const assets=new Map((await query('SELECT id,serial FROM assets',[],c)).map(asset=>[asset.id,asset.serial]));
 return rows.map(row=>{
  const ids=decode(row.asset_ids,[]);
  const outbound=decode(row.outbound);
  if(outbound)delete outbound.picks;
  return {...row,outbound,asset_ids:ids,serials:ids.map(id=>assets.get(id)).filter(Boolean),qty:outbound?outbound.lines.reduce((sum,line)=>sum+line.qty,0):ids.length};
 });
}
export async function getReturns(user,c){return query(`SELECT r.*,a.serial,p.name product_name,s.name source_name,d.name destination_name FROM return_records r JOIN assets a ON a.id=r.asset_id JOIN products p ON p.id=a.product_id JOIN locations s ON s.id=r.source_location_id JOIN locations d ON d.id=r.destination_location_id ${user.role==='engineer'?'WHERE r.created_by=?':''} ORDER BY r.id DESC`,user.role==='engineer'?[user.id]:[],c);}
export function calcStats(works,assets){const active=works.filter(w=>!['COMPLETED','CLOSED','CANCELLED'].includes(w.status)),completed=works.filter(w=>['COMPLETED','CLOSED'].includes(w.status));const overdue=active.filter(w=>new Date(w.due_at+'Z')<new Date());return {open_work_orders:active.length,in_progress:works.filter(w=>['IN_PROGRESS','CHECKED_IN','EN_ROUTE'].includes(w.status)).length,completed:completed.length,inventory_units:assets.filter(a=>a.status!=='EXPECTED').length,my_requests:works.length,assets_at_site:assets.filter(a=>a.status==='INSTALLED').length,pending:works.filter(w=>w.status==='PENDING').length,overdue:overdue.length,today_tasks:active.filter(w=>String(w.scheduled_at).slice(0,10)===new Date().toISOString().slice(0,10)).length,sla_compliance:works.length?Math.round((works.length-overdue.length)/works.length*100):100};}
export async function bootstrap(user,c){
 const work_orders=await getWorks(user,c),assets=await getAssets(user,c);
 const customerArgs=user.role==='customer'?[user.customer_id]:[];
 const customers=await query(`SELECT * FROM customers ${user.role==='customer'?'WHERE id=?':''} ORDER BY id`,customerArgs,c);
 const sites=await query(`SELECT s.*,c.name customer_name FROM sites s JOIN customers c ON c.id=s.customer_id ${user.role==='customer'?'WHERE s.customer_id=?':user.role==='engineer'?'WHERE s.id IN (SELECT site_id FROM work_orders WHERE engineer_id=?)':''} ORDER BY s.id`,user.role==='customer'?customerArgs:user.role==='engineer'?[user.id]:[],c);
 const engineers=user.role==='customer'?[]:await query(`SELECT u.id,u.name,u.email,u.region,u.skills,u.location_id,
  a.latitude check_in_latitude,a.longitude check_in_longitude,a.check_in location_recorded_at,
  (SELECT COUNT(*) FROM work_orders w WHERE w.engineer_id=u.id AND w.status NOT IN ('CLOSED','COMPLETED','CANCELLED')) active_jobs
  FROM users u LEFT JOIN attendance a ON a.id=(
   SELECT latest.id FROM attendance latest WHERE latest.user_id=u.id AND latest.check_in IS NOT NULL
    AND latest.latitude BETWEEN -90 AND 90 AND latest.longitude BETWEEN -180 AND 180
   ORDER BY latest.date DESC,latest.id DESC LIMIT 1
  ) WHERE u.role IN ('engineer','FIELD_ENGINEER')`,[],c);
 const locations=user.role==='customer'?await query('SELECT l.* FROM locations l JOIN sites s ON s.location_id=l.id WHERE s.customer_id=?',[user.customer_id],c):await query('SELECT * FROM locations ORDER BY id',[],c);
 const products=await query('SELECT * FROM products ORDER BY id',[],c);
 const isAdmin=user.role==='admin';
 const asns=isAdmin?await query(`SELECT a.*,
  (SELECT transfer_id FROM transfer_asns link WHERE link.asn_id=a.id) receiving_transfer_id,
  ((SELECT COUNT(*) FROM assets stock WHERE stock.asn_id=a.id)+COALESCE((SELECT SUM(JSON_LENGTH(r.mapping)) FROM transfer_asn_cartons r WHERE r.asn_id=a.id),0)) mapped_qty,p.name product_name,
  e.arrival_details,e.docked_at,e.offloaded_at,e.supervisor_name,e.driver_handover,e.handed_over_at,e.created_at entry_created_at,e.manifest_counts IS NOT NULL manifest_ready,e.manifest_counts,
  ((SELECT COUNT(*) FROM inbound_carton_checks k JOIN cartons c ON c.id=k.carton_id WHERE c.asn_id=a.id AND c.type='MASTER_CARTON') + (SELECT COUNT(*) FROM transfer_asn_cartons r WHERE r.asn_id=a.id AND r.processed_at IS NOT NULL)) processed_boxes
  FROM asns a JOIN products p ON p.id=a.product_id LEFT JOIN inbound_entries e ON e.asn_id=a.id ORDER BY a.id DESC`,[],c):[];
 const cartons=isAdmin?await getCartons(c):[];
 const putaway_tasks=isAdmin?await getPutaway(c):[];
 const transfers=user.role!=='customer'?await getTransfers(user,c):[];
 const returns=user.role!=='customer'?await getReturns(user,c):[];
 let activitySql='1=1',activityArgs=[];
 if(user.role==='customer'){activitySql="a.entity_type='work_order' AND a.entity_id IN (SELECT id FROM work_orders WHERE customer_id=?)";activityArgs=[user.customer_id];}
 if(user.role==='engineer'){activitySql="a.actor_id=? OR (a.entity_type='work_order' AND a.entity_id IN (SELECT id FROM work_orders WHERE engineer_id=?))";activityArgs=[user.id,user.id];}
 const activities=await query(`SELECT a.*,u.name actor_name FROM activities a JOIN users u ON u.id=a.actor_id WHERE ${activitySql} ORDER BY a.id DESC LIMIT 50`,activityArgs,c);
 const att=await query('SELECT * FROM attendance WHERE user_id=? AND date=UTC_DATE()',[user.id],c);
 const checklist_templates=(await query('SELECT * FROM checklist_templates ORDER BY id',[],c)).map(x=>({...x,items:decode(x.items,[]),evidence_types:decode(x.evidence_types,[])}));
 if(['SUPER_ADMIN','SYSTEM_ADMIN','AUDITOR'].includes(canonicalRole(user.authorization_role||user.role))){const security=await query("SELECT CONCAT('security-',a.id) id,'auth' entity_type,COALESCE(a.user_id,0) entity_id,a.action,a.action description,COALESCE(u.name,'Unauthenticated') actor_name,a.created_at FROM security_audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 50",[],c);activities.unshift(...security);}
 const scoped=await scopedBootstrap({user:publicUser(user),stats:calcStats(work_orders,assets),work_orders,assets,customers,sites,engineers,locations,products,asns,cartons,putaway_tasks,transfers,returns,activities,attendance:att[0]||null,checklist_templates},user);scoped.stats=calcStats(scoped.work_orders,scoped.assets);scoped.engineers=scoped.engineers.map(e=>({...e,active_jobs:scoped.work_orders.filter(w=>w.engineer_id===e.id&&!['CLOSED','COMPLETED','CANCELLED'].includes(w.status)).length}));return scoped;
}
