import {fail,query} from './db.js';

export const ROLES=['SUPER_ADMIN','SYSTEM_ADMIN','HO_OPERATIONS','WAREHOUSE_MANAGER','WAREHOUSE_OPERATOR','REGIONAL_MANAGER','COORDINATOR','REGIONAL_STOCK_MANAGER','FIELD_ENGINEER','CUSTOMER_ADMIN','CUSTOMER_USER','AUDITOR','REPAIR_TECHNICIAN'];
export const canonicalRole=role=>({admin:'SYSTEM_ADMIN',engineer:'FIELD_ENGINEER',customer:'CUSTOMER_USER',super_admin:'SUPER_ADMIN'}[role]||role);
export const policies={
 SUPER_ADMIN:['*'], SYSTEM_ADMIN:['*'],
 HO_OPERATIONS:['read','work.write','work.assign','work.close','master.write','warehouse.write','repair.write'],
 WAREHOUSE_MANAGER:['read','warehouse.write'], WAREHOUSE_OPERATOR:['read','warehouse.write'],
 REGIONAL_MANAGER:['read','work.write','work.assign','work.close','warehouse.write'],
 COORDINATOR:['read','work.write','work.assign'], REGIONAL_STOCK_MANAGER:['read','warehouse.write'],
 FIELD_ENGINEER:['read','field.write'], CUSTOMER_ADMIN:['read','request.write'], CUSTOMER_USER:['read','request.write'],
 AUDITOR:['read'], REPAIR_TECHNICIAN:['read','repair.write'],
};
export const customerRole=u=>canonicalRole(u.authorization_role||u.role).startsWith('CUSTOMER_');
export const engineerRole=u=>canonicalRole(u.authorization_role||u.role)==='FIELD_ENGINEER';
export const globalRole=u=>['SUPER_ADMIN','SYSTEM_ADMIN','HO_OPERATIONS','AUDITOR'].includes(canonicalRole(u.authorization_role||u.role));
export function hasPermission(user,permission){const grants=policies[canonicalRole(user.authorization_role||user.role)]||[];return grants.includes('*')||grants.includes(permission);}
export function requirePermission(permission){return(req,res,next)=>{if(!hasPermission(req.user,permission))fail('Permission denied',403,'FORBIDDEN');next();};}
export function adaptUser(user){const role=canonicalRole(user.role);if(!ROLES.includes(role))fail('Unknown account role',403,'FORBIDDEN');return {...user,authorization_role:role,role:role.startsWith('CUSTOMER_')?'customer':role==='FIELD_ENGINEER'?'engineer':'admin'};}
async function expandWarehouseLocations(ids,c){if(!ids.length)return ids;const placeholders=ids.map(()=>'?').join(',');const descendants=await query("SELECT child.location_id id FROM inbound_masters child JOIN inbound_masters wh ON wh.id=child.warehouse_id WHERE wh.kind IN ('WAREHOUSE','HUB') AND child.kind IN ('PALLET','ZONE') AND wh.location_id IN ("+placeholders+") AND child.location_id IS NOT NULL",ids,c);return [...new Set([...ids,...descendants.map(x=>x.id)])];}
export async function permittedLocations(user,c){
 if(globalRole(user))return null;
 if(engineerRole(user))return [user.location_id].filter(Boolean);
 if(customerRole(user))return(await query('SELECT location_id id FROM sites WHERE customer_id=?',[user.customer_id||0],c)).map(x=>x.id);
 const explicit=await query('SELECT location_id id FROM user_location_scopes WHERE user_id=?',[user.id],c);
 if(explicit.length)return expandWarehouseLocations(explicit.map(x=>x.id),c);
 if(['REGIONAL_MANAGER','COORDINATOR','REGIONAL_STOCK_MANAGER'].includes(user.authorization_role))return(await query('SELECT id FROM locations WHERE region=?',[user.region||'__DENIED__'],c)).map(x=>x.id);
 return expandWarehouseLocations([user.location_id].filter(Boolean),c);
}
export async function assertLocation(user,id,c){const allowed=await permittedLocations(user,c);if(allowed&&!allowed.includes(Number(id)))fail('Location is outside your authorized scope',403,'SCOPE_DENIED');}
export async function scopedBootstrap(data,user){
 const locations=await permittedLocations(user);
 if(globalRole(user))return data;
 const engineer=engineerRole(user),customer=customerRole(user);
 if(engineer){data.work_orders=data.work_orders.filter(w=>w.engineer_id===user.id);data.assets=data.assets.filter(a=>a.holder_user_id===user.id);}
 else if(!customer){
  const ids=new Set(locations);data.assets=data.assets.filter(a=>ids.has(a.location_id));
  data.sites=data.sites.filter(s=>ids.has(s.location_id)||(['REGIONAL_MANAGER','COORDINATOR','REGIONAL_STOCK_MANAGER'].includes(user.authorization_role)&&s.region===user.region&&!!user.region));
  const sites=new Set(data.sites.map(s=>s.id));data.work_orders=data.work_orders.filter(w=>sites.has(w.site_id));
 }
 const sites=new Set(data.sites.map(s=>s.id));
 const customers=new Set(data.sites.map(s=>s.customer_id));data.customers=data.customers.filter(c=>customers.has(c.id));
 data.locations=data.locations.filter(l=>locations.includes(l.id)||(engineer&&data.sites.some(s=>s.location_id===l.id)));
 data.engineers=data.engineers.filter(e=>engineer?e.id===user.id:locations.includes(e.location_id));
 const loc=new Set(locations);data.cartons=data.cartons.filter(c=>loc.has(c.location_id));
 data.putaway_tasks=data.putaway_tasks.filter(t=>loc.has(t.source_location_id)&&loc.has(t.suggested_location_id));
 data.transfers=data.transfers.filter(t=>loc.has(t.source_location_id)||loc.has(t.destination_location_id));
 data.returns=data.returns.filter(t=>loc.has(t.source_location_id)||loc.has(t.destination_location_id));
 const asns=new Set(data.cartons.map(c=>c.asn_id));data.asns=data.asns.filter(a=>a.receiving_location_id?loc.has(a.receiving_location_id):asns.has(a.id));
 const orders=new Set(data.work_orders.map(w=>w.id));data.activities=data.activities.filter(a=>a.actor_id===user.id||a.entity_type==='work_order'&&orders.has(a.entity_id));
 data.stats={...data.stats,open_work_orders:data.work_orders.filter(w=>!['CLOSED','COMPLETED','CANCELLED'].includes(w.status)).length,inventory_units:data.assets.length,my_requests:data.work_orders.length,assets_at_site:data.assets.filter(a=>a.status==='INSTALLED').length,in_progress:data.work_orders.filter(w=>w.status==='IN_PROGRESS').length,completed:data.work_orders.filter(w=>['CLOSED','COMPLETED'].includes(w.status)).length};
 return data;
}
