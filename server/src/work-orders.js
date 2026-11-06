import {query,decode,fail,required,int,nowSql} from './db.js';
import {getWork,getAssetBySerial,audit,move} from './data.js';

export const workTypes=['Installation','Service','Replacement','De-installation','Preventive Maintenance','Inspection'];
export async function createWork(c,user,b){
 if(user.role==='engineer')fail('Only customers and operations can create requests',403,'FORBIDDEN');
 const [site]=await query('SELECT s.*,c.sla_hours FROM sites s JOIN customers c ON c.id=s.customer_id WHERE s.id=?',[int(b.site_id,'Site')],c);
 if(!site)fail('Site not found',404);if(user.role==='customer'&&site.customer_id!==user.customer_id)fail('Site is outside your customer scope',403,'FORBIDDEN');
 if(!workTypes.includes(b.type))fail('Select a valid service type');
 const priority=b.priority||'Medium';if(!['Low','Medium','High','Critical'].includes(priority))fail('Invalid priority');
 if(b.asset_id){const [asset]=await query('SELECT * FROM assets WHERE id=?',[int(b.asset_id,'Asset')],c);if(!asset||asset.site_id!==site.id)fail('Selected asset is not installed at this site');}
 if(b.product_id&&!((await query('SELECT id FROM products WHERE id=?',[int(b.product_id,'Product')],c)).length))fail('Product not found');
 const scheduled=b.scheduled_at?new Date(b.scheduled_at):new Date();if(Number.isNaN(scheduled.getTime()))fail('Invalid schedule date');
 const due=new Date(scheduled.getTime()+site.sla_hours*3600000);
 const code=`WO-${Date.now().toString().slice(-9)}${Math.floor(Math.random()*100).toString().padStart(2,'0')}`;
 const row=await query('INSERT INTO work_orders(code,type,status,priority,summary,description,customer_id,site_id,asset_id,product_id,scheduled_at,due_at,checklist,evidence) VALUES (?,?,\'CREATED\',?,?,?,?,?,?,?,?,?,JSON_ARRAY(),JSON_ARRAY())',[code,b.type,priority,required(b.summary,'Summary').slice(0,200),b.description||'',site.customer_id,site.id,b.asset_id||null,b.product_id||null,scheduled.toISOString().slice(0,19).replace('T',' '),due.toISOString().slice(0,19).replace('T',' ')],c);
 await audit(c,user,'work_order',row.insertId,'CREATED',`${code} · ${b.type} request created`);return getWork(row.insertId,user,c);
}
export async function assignWork(c,user,id,b){
 if(user.role!=='admin')fail('Operations permission required',403,'FORBIDDEN');
 const w=await getWork(id,user,c,true);if(['COMPLETED','CLOSED','CANCELLED'].includes(w.status))fail('Terminal work orders cannot be assigned');
 const [engineer]=await query("SELECT * FROM users WHERE id=? AND role IN ('engineer','FIELD_ENGINEER')",[int(b.engineer_id,'Engineer')],c);if(!engineer)fail('Engineer not found');
 if(b.allocated_asset_id){const [a]=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[int(b.allocated_asset_id,'Allocated asset')],c);if(!a||a.holder_user_id!==engineer.id||a.status!=='ISSUED_TO_ENGINEER')fail('Allocate an asset already issued to this engineer');if(w.product_id&&a.product_id!==w.product_id)fail('Allocated model does not match work order');const conflict=await query("SELECT id FROM work_orders WHERE allocated_asset_id=? AND id<>? AND status NOT IN ('COMPLETED','CLOSED','CANCELLED')",[a.id,w.id],c);if(conflict.length)fail('Asset is allocated to another active work order',409);}
 await query("UPDATE work_orders SET engineer_id=?,allocated_asset_id=?,status='ASSIGNED',version=version+1 WHERE id=?",[engineer.id,b.allocated_asset_id||null,w.id],c);
 await audit(c,user,'work_order',id,'ASSIGNED',`${w.code} assigned to ${engineer.name}`);return getWork(id,user,c);
}
export async function workAction(c,user,id,b){
 if(user.role==='customer')fail('Field engineer or operations permission required',403,'FORBIDDEN');
 const w=await getWork(id,user,c,true);const action=required(b.action,'Action');
 if(b.version!==undefined&&Number(b.version)!==w.version)fail('This work order changed. Sync and review before retrying.',409,'VERSION_CONFLICT');
 const rules={accept:{from:['ASSIGNED'],to:'ACCEPTED'},en_route:{from:['ACCEPTED'],to:'EN_ROUTE'},check_in:{from:['ACCEPTED','EN_ROUTE'],to:'CHECKED_IN'},start:{from:['CHECKED_IN'],to:'IN_PROGRESS'},pending:{from:['ASSIGNED','ACCEPTED','EN_ROUTE','CHECKED_IN','IN_PROGRESS'],to:'PENDING'},resume:{from:['PENDING'],to:'ACCEPTED'},complete:{from:['IN_PROGRESS'],to:'COMPLETED'},close:{from:['COMPLETED','QC_PENDING'],to:'CLOSED'},reopen:{from:['COMPLETED','QC_PENDING','CLOSED'],to:'REOPENED'},cancel:{from:['CREATED','ASSIGNED','ACCEPTED','PENDING','REOPENED'],to:'CANCELLED'}};
 const r=rules[action];if(!r)fail('Unsupported action');if(!r.from.includes(w.status))fail(`Cannot ${action.replaceAll('_',' ')} a ${w.status.replaceAll('_',' ').toLowerCase()} work order`,409,'INVALID_TRANSITION');
 if(['close','reopen','cancel'].includes(action)&&user.role!=='admin')fail('Operations permission required',403,'FORBIDDEN');
 if(action==='pending')required(b.reason,'Pending reason');
 if(action==='reopen')required(b.reason,'Reopen reason');
 if(action==='check_in'){if(!Number.isFinite(Number(b.latitude))||!Number.isFinite(Number(b.longitude))||Math.abs(Number(b.latitude))>90||Math.abs(Number(b.longitude))>180)fail('Valid GPS coordinates are required for check-in');}
 if(action==='complete')await completeWork(c,user,w,b);
 await query('UPDATE work_orders SET status=?,version=version+1,completed_at=IF(?=\'COMPLETED\',UTC_TIMESTAMP(),completed_at) WHERE id=?',[r.to,r.to,id],c);
 await audit(c,user,'work_order',id,r.to,`${w.code} · ${r.to.replaceAll('_',' ').toLowerCase()}${b.reason?`: ${b.reason}`:''}`,{latitude:b.latitude??null,longitude:b.longitude??null,captured_at:b.captured_at||null,from_status:w.status});
 return getWork(id,user,c);
}
async function completeWork(c,user,w,b){
 const [template]=await query('SELECT * FROM checklist_templates ORDER BY id LIMIT 1',[],c);
 const checklist=Array.isArray(b.checklist)?b.checklist:[];
 const missing=decode(template.items,[]).filter(i=>i.required&&!checklist.some(v=>v.id===i.id&&v.checked===true));if(missing.length)fail(`Complete required checklist: ${missing.map(i=>i.label).join(', ')}`);
 const evidence=Array.isArray(b.evidence)?b.evidence:[];const validated=[];
 for(const type of decode(template.evidence_types,[])){const item=evidence.find(e=>e.type===type);if(!item?.id)fail(`Required evidence missing: ${type}`);const [stored]=await query('SELECT id,type,name FROM evidence WHERE id=? AND work_order_id=? AND type=?',[item.id,w.id,type],c);if(!stored)fail(`Upload valid ${type} evidence for this work order`);validated.push(stored);}
 if(!b.confirmation?.accepted||!String(b.confirmation?.name||'').trim())fail('Customer name and acceptance are required');
 const resolution=required(b.resolution,'Resolution');
 const [engineer]=await query("SELECT * FROM users WHERE id=? AND role IN ('engineer','FIELD_ENGINEER')",[w.engineer_id],c);if(!engineer)fail('Work order needs an assigned engineer');
 let newAsset=null,oldAsset=null;
 if(['Installation','Replacement'].includes(w.type)){
  const serial=required(b.serial,'New asset serial');newAsset=await getAssetBySerial(serial,user,c,true);
  if(newAsset.holder_user_id!==engineer.id||newAsset.location_id!==engineer.location_id||newAsset.status!=='ISSUED_TO_ENGINEER')fail('Asset must be in the assigned engineer’s stock',409,'CUSTODY_ERROR');
  if(w.allocated_asset_id&&newAsset.id!==w.allocated_asset_id)fail('Scanned serial does not match the allocated asset');
  if(w.product_id&&newAsset.product_id!==w.product_id)fail('Scanned model does not match the work order');
  if(newAsset.customer_id&&newAsset.customer_id!==w.customer_id)fail('Asset belongs to another customer');
  const other=await query("SELECT id FROM work_orders WHERE allocated_asset_id=? AND id<>? AND status NOT IN ('COMPLETED','CLOSED','CANCELLED')",[newAsset.id,w.id],c);if(other.length)fail('Asset is reserved for another work order');
 }
 if(['Replacement','De-installation'].includes(w.type)){
  oldAsset=await getAssetBySerial(required(b.old_serial||b.serial,'Installed asset serial'),user,c,true);
  if(oldAsset.site_id!==w.site_id||oldAsset.status!=='INSTALLED')fail('Old asset must be installed at the work-order site',409,'CUSTODY_ERROR');
  if(w.asset_id&&oldAsset.id!==w.asset_id)fail('Scanned old serial does not match the work-order asset');
  await move(c,user,oldAsset,engineer.location_id,'RETURNED_TO_ENGINEER','SITE_RETURN','work_order',w.id,{holder_user_id:engineer.id,condition:b.condition||'USED'});
  await query('UPDATE asset_site_assignments SET active_to=UTC_TIMESTAMP() WHERE asset_id=? AND active_to IS NULL',[oldAsset.id],c);
 }
 if(newAsset){await move(c,user,newAsset,w.site_location_id,'INSTALLED','INSTALLATION','work_order',w.id,{site_id:w.site_id,customer_id:w.customer_id});await query('INSERT INTO asset_site_assignments(asset_id,site_id,work_order_id) VALUES (?,?,?)',[newAsset.id,w.site_id,w.id],c);}
 if(['Service','Preventive Maintenance'].includes(w.type)&&w.asset_id){const [asset]=await query('SELECT * FROM assets WHERE id=? FOR UPDATE',[w.asset_id],c);if(!asset||asset.site_id!==w.site_id||asset.status!=='INSTALLED')fail('The service asset is no longer installed at this site',409);}
 await query('UPDATE work_orders SET resolution=?,checklist=?,evidence=?,confirmation=? WHERE id=?',[resolution,JSON.stringify(checklist),JSON.stringify(validated),JSON.stringify(b.confirmation),w.id],c);
}
