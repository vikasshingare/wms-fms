import {inboundRouter} from './inbound.js';
import {outboundRouter} from './outbound.js';
import {inboundEntryRouter} from './inbound-entry.js';
import {auth,authenticate} from './auth.js';
import {ROLES as roles,adaptUser,canonicalRole,hasPermission,permittedLocations,assertLocation,scopedBootstrap} from './authorization.js';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {createHash,randomUUID} from 'node:crypto';
import {pool,query,transaction,decode,fail,required,int} from './db.js';
import {publicUser,bootstrap,getWorks,getWork,getAssets,getAssetBySerial,getCartons,getPutaway,getTransfers,getReturns,audit,assetSelect} from './data.js';
import {createWork,assignWork,workAction} from './work-orders.js';
import {createAsn,receiveAsn,qcCarton,confirmPutaway,breakCarton,createTransfer,transferAction,createReturn,receiveReturn,dispositionReturn} from './wms.js';

if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length<32)throw new Error('Set JWT_SECRET to at least 32 random characters; run npm run db:init first.');
const app=express();app.disable('x-powered-by');
if(process.env.TRUST_PROXY==='loopback')app.set('trust proxy','loopback');
app.use((req,res,next)=>{req.correlationId=randomUUID();res.set('X-Correlation-ID',req.correlationId);res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','no-store');next();});
const origins=(process.env.CORS_ORIGINS||'http://localhost:5174,http://localhost:8081,http://localhost:8082').split(',');
app.use(cors({origin(origin,cb){if(!origin||origins.includes(origin))return cb(null,true);try{const url=new URL(origin);if(['localhost','127.0.0.1'].includes(url.hostname))return cb(null,true);if(process.env.HOST==='0.0.0.0'&&/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname))return cb(null,true);}catch{}cb(new Error('Origin is not allowed'));},methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type','Authorization','Idempotency-Key']}));
app.use(express.json({limit:'10mb'}));
const api=express.Router();
api.get('/health',async(req,res)=>{try{await query('SELECT 1');res.json({status:'ok',service:'service360-api',database:'connected'});}catch{res.status(503).json({status:'error',service:'service360-api',database:'disconnected'});}});
api.use('/auth',auth);
api.use(authenticate);
const admin=req=>{if(req.user.role!=='admin')fail('Operations permission required',403,'FORBIDDEN');};
const superAdmin=req=>{if(!hasPermission(req.user,'users.write'))fail('Super Admin permission required',403,'FORBIDDEN');};
api.get('/users',async(req,res)=>{superAdmin(req);res.json(await query('SELECT id,name,email,role,customer_id,location_id,region,skills FROM users ORDER BY name'));});
api.post('/users',async(req,res)=>{superAdmin(req);const b=req.body,role=required(b.role,'Role');if(!roles.includes(role))fail('Unsupported role');if(role==='SUPER_ADMIN'&&req.user.authorization_role!=='SUPER_ADMIN')fail('Only a Super Admin can grant that role',403);const password=required(b.password,'Password');if(password.length<12)fail('Password must be at least 12 characters');const hash=await bcrypt.hash(password,12);const result=await query('INSERT INTO users(name,email,password_hash,role,customer_id,location_id,region,skills) VALUES (?,?,?,?,?,?,?,?)',[required(b.name,'Name'),required(b.email,'Email').toLowerCase(),hash,role,b.customer_id||null,b.location_id||null,b.region||null,b.skills||null]);await query("INSERT INTO activities(entity_type,entity_id,action,description,actor_id,metadata) VALUES ('user',?,'ROLE_CHANGED',?,?,?)",[result.insertId,`User created with role ${role}`,req.user.id,JSON.stringify({role})]);res.status(201).json((await query('SELECT id,name,email,role,customer_id,location_id,region,skills FROM users WHERE id=?',[result.insertId]))[0]);});
api.post('/users/:id/update',async(req,res)=>{superAdmin(req);const id=int(req.params.id,'User'),b=req.body,[old]=await query('SELECT * FROM users WHERE id=?',[id]);if(!old)fail('User not found',404);if(b.password&&b.password.length<12)fail('Password must be at least 12 characters');if(canonicalRole(old.role)==='SUPER_ADMIN'&&req.user.authorization_role!=='SUPER_ADMIN')fail('Only a Super Admin can change this account',403);const role=b.role||old.role;if(role==='SUPER_ADMIN'&&req.user.authorization_role!=='SUPER_ADMIN')fail('Only a Super Admin can grant that role',403);if(!roles.includes(role))fail('Unsupported role');const customer=Object.hasOwn(b,'customer_id')?b.customer_id:old.customer_id,location=Object.hasOwn(b,'location_id')?b.location_id:old.location_id;if(customer&&!(await query('SELECT id FROM customers WHERE id=?',[customer])).length)fail('Customer not found');if(location&&!(await query('SELECT id FROM locations WHERE id=?',[location])).length)fail('Warehouse location not found');await query('UPDATE users SET name=?,email=?,role=?,customer_id=?,location_id=?,region=?,skills=? WHERE id=?',[b.name||old.name,(b.email||old.email).toLowerCase(),role,customer,location,b.region??old.region,b.skills??old.skills,id]);if(b.password){if(b.password.length<12)fail('Password must be at least 12 characters');await query('UPDATE users SET password_hash=? WHERE id=?',[await bcrypt.hash(b.password,12),id]);}if(role!==old.role)await query("INSERT INTO activities(entity_type,entity_id,action,description,actor_id,metadata) VALUES ('user',?,'ROLE_CHANGED',?,?,?)",[id,`${old.role} → ${role}`,req.user.id,JSON.stringify({from:old.role,to:role})]);else if(['customer_id','location_id','region'].some(k=>b[k]!==undefined&&String(b[k]||'')!==String(old[k]||'')))await query("INSERT INTO activities(entity_type,entity_id,action,description,actor_id,metadata) VALUES ('user',?,'PERMISSION_CHANGED','User scope updated',?,?)",[id,req.user.id,JSON.stringify({customer_id:customer,location_id:location,region:b.region??old.region})]);if(role!==old.role||b.password)await query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE user_id=?',[id]);await query('INSERT INTO security_audit(action,user_id,ip_address,metadata) VALUES (?,?,?,?)',[role!==old.role?'ROLE_CHANGED':'PERMISSION_CHANGED',req.user.id,req.ip,JSON.stringify({target_user_id:id,role,customer_id:customer,location_id:location,region:b.region??old.region})]);res.json((await query('SELECT id,name,email,role,customer_id,location_id,region,skills FROM users WHERE id=?',[id]))[0]);});
async function mutation(req,fn,body=req.body,scope=req.path){
 const txn=body.mobile_txn_id||req.headers['idempotency-key'];
 if(txn&&String(txn).length>120)fail('Transaction ID is too long');
 const hash=createHash('sha256').update(JSON.stringify({scope,body})).digest('hex');
 return transaction(async c=>{
  if(txn){await query('INSERT IGNORE INTO sync_events(user_id,mobile_txn_id,payload_hash) VALUES (?,?,?)',[req.user.id,txn,hash],c);const [existing]=await query('SELECT * FROM sync_events WHERE user_id=? AND mobile_txn_id=? FOR UPDATE',[req.user.id,txn],c);if(existing.payload_hash!==hash)fail('Transaction ID was already used with a different payload',409,'IDEMPOTENCY_CONFLICT');if(existing.response)return decode(existing.response);}
  const result=await fn(c);
  if(txn)await query('UPDATE sync_events SET response=? WHERE user_id=? AND mobile_txn_id=?',[JSON.stringify(result),req.user.id,txn],c);
  return result;
 });
}
const globalRoleFor=u=>['SUPER_ADMIN','SYSTEM_ADMIN','HO_OPERATIONS','AUDITOR'].includes(u.authorization_role);
const policiesFor=user=>({role:user.authorization_role});
api.use(async(req,res,next)=>{
 if(req.path.startsWith('/auth/'))return next();
 const path=req.path;let permission='read';
 if(req.body?.asset_id&&!globalRoleFor(req.user)){const [asset]=await query('SELECT serial FROM assets WHERE id=?',[req.body.asset_id]);if(!asset)fail('Asset not found',404);await getAssetBySerial(asset.serial,req.user);}

 if(path.startsWith('/users'))permission='users.write';
 else if(req.method==='POST'){
 if(path==='/work-orders')permission=req.user.role==='customer'?'request.write':'work.write';
 else if(/work-orders.*assign/.test(path))permission='work.assign';
 else if(/work-orders.*action/.test(path))permission=['close','reopen','cancel'].includes(req.body.action)?'work.close':'field.write';
 else if(/^\/(attendance|mobile|evidence)/.test(path))permission='field.write';
 else if(/^\/(customers|sites|products|locations)$/.test(path))permission='master.write';
 else if(/disposition/.test(path))permission='repair.write';
 else permission=req.user.role==='engineer'?'field.write':'warehouse.write';
 }
 if(!hasPermission(req.user,permission))fail('Permission denied',403,'FORBIDDEN');
 if(!['customer','engineer'].includes(req.user.role)){for(const key of ['source_location_id','destination_location_id'])if(req.body?.[key])await assertLocation(req.user,req.body[key]);}
 const match=path.match(/^\/(cartons|putaway|transfers|returns|asns)\/(\d+)/);
 if(match&&!globalRoleFor(req.user)){
 const [kind,id]=[match[1],Number(match[2])];let rows=[];
 if(kind==='cartons')rows=await query('SELECT location_id FROM cartons WHERE id=?',[id]);
 if(kind==='putaway')rows=await query('SELECT source_location_id location_id,suggested_location_id destination FROM putaway_tasks WHERE id=?',[id]);
 if(kind==='asns')rows=await query('SELECT location_id FROM cartons WHERE asn_id=?',[id]);
 if(kind==='transfers'||kind==='returns'){const table=kind==='transfers'?'transfers':'return_records';rows=await query('SELECT source_location_id location_id,destination_location_id destination FROM '+table+' WHERE id=?',[id]);}
 if(!rows.length)fail('Record not found',404);
 for(const row of rows){if(['transfers','returns'].includes(kind)&&(path.endsWith('/receive')||path.endsWith('/disposition')))await assertLocation(req.user,row.destination);else{await assertLocation(req.user,row.location_id);if(row.destination)await assertLocation(req.user,row.destination);}}
 }
 next();
});
const mut = fn=>async(req,res)=>{res.json(await mutation(req,c=>fn(c,req)));};
api.get('/auth/me',(req,res)=>res.json({...publicUser(req.user),role:req.user.authorization_role,permissions:policiesFor(req.user)}));
api.get(['/bootstrap','/mobile/bootstrap'],async(req,res)=>res.json(await bootstrap(req.user)));
api.get(['/work-orders','/mobile/tasks'],async(req,res)=>res.json(await getWorks(req.user)));
api.get('/work-orders/:id',async(req,res)=>{const w=await getWork(int(req.params.id,'Work order'),req.user);w.activities=await query("SELECT a.*,u.name actor_name FROM activities a JOIN users u ON u.id=a.actor_id WHERE a.entity_type='work_order' AND a.entity_id=? ORDER BY a.id",[w.id]);res.json(w);});
api.post('/work-orders',mut((c,req)=>createWork(c,req.user,req.body)));
api.post('/work-orders/:id/assign',mut((c,req)=>assignWork(c,req.user,int(req.params.id,'Work order'),req.body)));
api.post('/work-orders/:id/action',mut((c,req)=>workAction(c,req.user,int(req.params.id,'Work order'),req.body)));
api.get(['/assets','/mobile/inventory'],async(req,res)=>{let rows=await getAssets(req.user);if(req.path==='/mobile/inventory')rows=rows.filter(a=>a.holder_user_id===req.user.id);res.json(rows);});
api.get('/assets/:serial/history',async(req,res)=>{const asset=await getAssetBySerial(req.params.serial,req.user);const movements=await query('SELECT m.*,s.name from_location_name,d.name to_location_name,u.name actor_name FROM movements m LEFT JOIN locations s ON s.id=m.from_location_id JOIN locations d ON d.id=m.to_location_id JOIN users u ON u.id=m.actor_id WHERE m.asset_id=? ORDER BY m.id DESC',[asset.id]);const allowed=await permittedLocations(req.user);const visible=allowed&&!['customer','engineer'].includes(req.user.role)?movements.filter(m=>(m.from_location_id===null||allowed.includes(m.from_location_id))&&allowed.includes(m.to_location_id)):movements;res.json({asset,movements:visible});});
api.get('/assets/:serial',async(req,res)=>res.json(await getAssetBySerial(req.params.serial,req.user)));
api.post('/assets/validate-scan',async(req,res)=>{const a=await getAssetBySerial(required(req.body.serial,'Serial'),req.user);if(req.body.work_order_id){const w=await getWork(req.body.work_order_id,req.user);if(['Installation','Replacement'].includes(w.type)&&a.holder_user_id!==w.engineer_id&&a.site_id!==w.site_id)fail('Asset is not held by the assigned engineer or installed at this site');if(w.product_id&&a.product_id!==w.product_id)fail('Asset model does not match this work order');}res.json(a);});
api.post('/evidence',mut(async(c,req)=>{
 if(req.user.role==='customer')fail('Field permission required',403);const w=await getWork(int(req.body.work_order_id,'Work order'),req.user,c);
 if(['COMPLETED','CLOSED','CANCELLED'].includes(w.status))fail('Evidence cannot be added to a terminal work order');
 const type=required(req.body.type,'Evidence type');const [template]=await query('SELECT evidence_types FROM checklist_templates ORDER BY id LIMIT 1',[],c);if(!decode(template.evidence_types,[]).includes(type))fail('Unsupported evidence type');
 const data=required(req.body.data,'Image');if(!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(data))fail('Upload a PNG, JPEG or WebP image');if(Buffer.byteLength(data)>7*1024*1024)fail('Photo must be smaller than 5 MB');
 const name=(req.body.name||`${type}.jpg`).slice(0,180);const result=await query('INSERT INTO evidence(work_order_id,type,name,data,captured_by) VALUES (?,?,?,?,?)',[w.id,type,name,data,req.user.id],c);await audit(c,req.user,'work_order',w.id,'EVIDENCE_CAPTURED',`${w.code} · ${type} captured`);return {id:result.insertId,type,name,url:data};
}));
api.get('/evidence/:id',async(req,res)=>{const [e]=await query('SELECT * FROM evidence WHERE id=?',[req.params.id]);if(!e)fail('Evidence not found',404);await getWork(e.work_order_id,req.user);res.json({id:e.id,type:e.type,name:e.name,url:e.data});});
api.post('/attendance',mut(async(c,req)=>{
 if(req.user.role!=='engineer')fail('Engineer permission required',403);const action=req.body.action;if(!['check_in','check_out'].includes(action))fail('Invalid attendance action');
 const [record]=await query('SELECT * FROM attendance WHERE user_id=? AND date=UTC_DATE() FOR UPDATE',[req.user.id],c);
 if(action==='check_in'){if(record)fail('You already started your day',409);await query('INSERT INTO attendance(user_id,date,check_in,latitude,longitude) VALUES (?,UTC_DATE(),UTC_TIMESTAMP(),?,?)',[req.user.id,req.body.latitude??null,req.body.longitude??null],c);}else{if(!record||record.check_out)fail('Start your day before checking out, or you have already checked out',409);await query('UPDATE attendance SET check_out=UTC_TIMESTAMP() WHERE id=?',[record.id],c);}
 const [result]=await query('SELECT * FROM attendance WHERE user_id=? AND date=UTC_DATE()',[req.user.id],c);await audit(c,req.user,'attendance',result.id,action.toUpperCase(),`${req.user.name} ${action==='check_in'?'started':'ended'} the day`);return result;
}));
api.post('/mobile/sync',async(req,res)=>{if(req.user.role!=='engineer')fail('Engineer permission required',403);if(!Array.isArray(req.body.events)||req.body.events.length>50)fail('Sync accepts up to 50 events');const results=[];for(const event of req.body.events){try{const body={...(event.payload||{}),action:event.action,mobile_txn_id:required(event.mobile_txn_id,'Transaction ID')};const result=await mutation(req,c=>workAction(c,req.user,event.work_order_id,body),body,`/work-orders/${event.work_order_id}/action`);results.push({mobile_txn_id:event.mobile_txn_id,status:'SYNCED',result});}catch(e){results.push({mobile_txn_id:event.mobile_txn_id,status:'CONFLICT',error:e.message});}}res.json({results});});
api.get('/customers',async(req,res)=>res.json((await bootstrap(req.user)).customers));
api.get('/sites',async(req,res)=>res.json((await bootstrap(req.user)).sites));
api.get('/engineers',async(req,res)=>{admin(req);res.json((await bootstrap(req.user)).engineers);});
api.get('/products',async(req,res)=>res.json(await query('SELECT * FROM products ORDER BY id')));
api.get('/locations',async(req,res)=>res.json((await bootstrap(req.user)).locations));
api.post('/customers',mut(async(c,req)=>{admin(req);const b=req.body;const r=await query('INSERT INTO customers(code,name,industry,contact_name,email,phone,sla_hours) VALUES (?,?,?,?,?,?,?)',[`CUS-${Date.now()}`,required(b.name,'Customer name'),b.industry||'',b.contact_name||'',b.email||'',b.phone||'',int(b.sla_hours||48,'SLA hours')],c);await audit(c,req.user,'customer',r.insertId,'CREATED',`Customer ${b.name} created`);return (await query('SELECT * FROM customers WHERE id=?',[r.insertId],c))[0];}));
api.post('/sites',mut(async(c,req)=>{admin(req);const b=req.body;const customer=int(b.customer_id,'Customer');if(!(await query('SELECT id FROM customers WHERE id=?',[customer],c)).length)fail('Customer not found');const name=required(b.name,'Site name');const code=`SIT-${Date.now()}`;const l=await query("INSERT INTO locations(code,name,type,region) VALUES (?,?,'SITE',?)",[code,name,b.region||''],c);const r=await query('INSERT INTO sites(code,name,customer_id,address,city,region,contact_name,contact_phone,latitude,longitude,location_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[code,name,customer,required(b.address,'Address'),b.city||'',b.region||'',b.contact_name||'',b.contact_phone||'',b.latitude??null,b.longitude??null,l.insertId],c);await audit(c,req.user,'site',r.insertId,'CREATED',`Site ${name} created`);return (await query('SELECT * FROM sites WHERE id=?',[r.insertId],c))[0];}));
api.post('/products',mut(async(c,req)=>{admin(req);const b={...req.body};if(Object.hasOwn(b,'units_per_master')){b.units_per_inner_carton=int(b.units_per_master,'Pieces per master carton');b.inner_cartons_per_master=1;}const r=await query('INSERT INTO products(sku,name,model,category,units_per_inner_carton,inner_cartons_per_master) VALUES (?,?,?,?,?,?)',[required(b.sku,'SKU'),required(b.name,'Product name'),b.model||'',b.category||'',int(b.units_per_inner_carton||2,'Units per inner carton'),int(b.inner_cartons_per_master||2,'Inner cartons per master')],c);await audit(c,req.user,'product',r.insertId,'CREATED',`Product ${b.sku} created`);return (await query('SELECT * FROM products WHERE id=?',[r.insertId],c))[0];}));
api.post('/locations',mut(async(c,req)=>{admin(req);const b=req.body;if(!['BIN','HUB','STAGING','QUARANTINE','REPAIR'].includes(b.type))fail('Select a supported warehouse location type');const r=await query('INSERT INTO locations(code,name,type,region,capacity,product_id) VALUES (?,?,?,?,?,?)',[required(b.code,'Location code'),required(b.name,'Location name'),b.type,b.region||'',int(b.capacity||1000,'Capacity'),b.product_id||null],c);await audit(c,req.user,'location',r.insertId,'CREATED',`Location ${b.code} created`);return (await query('SELECT * FROM locations WHERE id=?',[r.insertId],c))[0];}));
api.get('/asns',async(req,res)=>{admin(req);res.json((await bootstrap(req.user)).asns);});
api.post('/asns',mut((c,req)=>createAsn(c,req.user,req.body)));
api.post('/asns/:id/receive',mut((c,req)=>receiveAsn(c,req.user,int(req.params.id,'ASN'),req.body)));
api.get('/cartons',async(req,res)=>{admin(req);res.json((await bootstrap(req.user)).cartons);});
api.post('/cartons/:id/qc',mut((c,req)=>qcCarton(c,req.user,int(req.params.id,'Carton'),req.body)));
api.post('/cartons/:id/break',mut((c,req)=>breakCarton(c,req.user,int(req.params.id,'Carton'),req.body)));
api.get('/putaway',async(req,res)=>{admin(req);res.json((await bootstrap(req.user)).putaway_tasks);});
api.post('/putaway/:id/confirm',mut((c,req)=>confirmPutaway(c,req.user,int(req.params.id,'Putaway task'),req.body)));
api.get('/transfers',async(req,res)=>{if(req.user.role==='customer')fail('Stock permission required',403);res.json((await bootstrap(req.user)).transfers);});
api.post('/transfers',mut((c,req)=>createTransfer(c,req.user,req.body)));
api.post('/transfers/:id/dispatch',mut((c,req)=>transferAction(c,req.user,int(req.params.id,'Transfer'),'dispatch',req.body)));
api.post('/transfers/:id/receive',mut((c,req)=>transferAction(c,req.user,int(req.params.id,'Transfer'),'receive',req.body)));
api.get('/returns',async(req,res)=>{if(req.user.role==='customer')fail('Stock permission required',403);res.json((await bootstrap(req.user)).returns);});
api.post('/returns',mut((c,req)=>createReturn(c,req.user,req.body)));
api.post('/returns/:id/receive',mut((c,req)=>receiveReturn(c,req.user,int(req.params.id,'Return'))));
api.post('/returns/:id/disposition',mut((c,req)=>dispositionReturn(c,req.user,int(req.params.id,'Return'),req.body)));
api.get('/reports',async(req,res)=>{const data=await bootstrap(req.user);const countBy=(rows,key)=>Object.entries(rows.reduce((all,row)=>(all[row[key]||'Unassigned']=(all[row[key]||'Unassigned']||0)+1,all),{})).map(([name,count])=>({name,count}));res.json({stats:data.stats,by_type:countBy(data.work_orders,'type'),by_status:countBy(data.work_orders,'status'),inventory_by_location:countBy(data.assets,'location_name'),engineer_performance:data.engineers.map(e=>({...e,completed:data.work_orders.filter(w=>w.engineer_id===e.id&&['COMPLETED','CLOSED'].includes(w.status)).length}))});});
api.use('/inbound/asns/:id/entry',inboundEntryRouter);
api.use('/inbound',inboundRouter);
api.use('/outbound',outboundRouter);
api.use((req,res)=>res.status(404).json({error:'API endpoint not found',code:'NOT_FOUND'}));
app.use('/api/v1',api);app.use('/api',api);
app.use((err,req,res,next)=>{let status=err.status||500;let message=err.message;let code=err.code||'INTERNAL_ERROR';if(err.code==='ER_DUP_ENTRY'){status=409;message='This record already exists. Check serials, carton barcodes and unique codes.';code='DUPLICATE_RECORD';}if(err.code==='ER_NO_REFERENCED_ROW_2'){status=400;message='A referenced record was not found.';code='INVALID_REFERENCE';}if(status>=500){console.error(`[${req.correlationId}]`,err);message='The server could not complete this operation. Please retry.';}res.status(status).json({error:message,code,correlation_id:req.correlationId});});
const server=app.listen(Number(process.env.PORT||4000),process.env.HOST||'127.0.0.1',()=>console.log(`Service360 API listening at http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||4000}/api`));
async function shutdown(){server.close();await pool.end();process.exit(0);}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
