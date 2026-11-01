import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import {randomBytes} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import {schema} from './schema.js';

const DB = process.env.DB_NAME || 'service360';
if (!/^service360(?:_[a-z0-9_]+)?$/.test(DB)) throw new Error('Setup is restricted to a service360 database');
const admin = await mysql.createConnection({host:process.env.DB_HOST || '127.0.0.1',port:Number(process.env.DB_PORT || 3306),user:process.env.DB_ADMIN_USER || 'root',password:process.env.DB_ADMIN_PASSWORD || ''});
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
let password=process.env.DB_PASSWORD || randomBytes(24).toString('hex');
if (!process.env.DB_PASSWORD){
  await admin.query("CREATE USER IF NOT EXISTS 'service360_app'@'localhost' IDENTIFIED BY ?",[password]);
  await admin.query("ALTER USER 'service360_app'@'localhost' IDENTIFIED BY ?",[password]);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON \`${DB}\`.* TO 'service360_app'@'localhost'`);
  await writeFile(new URL('../.env',import.meta.url),`PORT=4000\nHOST=127.0.0.1\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=${DB}\nDB_USER=service360_app\nDB_PASSWORD=${password}\nJWT_SECRET=${randomBytes(48).toString('hex')}\nCORS_ORIGINS=http://localhost:5174,http://127.0.0.1:5174,http://localhost:8081,http://localhost:8082,http://127.0.0.1:8081,http://127.0.0.1:8082\n`);
}
await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON \`${DB}\`.* TO 'service360_app'@'localhost'`);
await admin.changeUser({database:DB});
await admin.query("SET time_zone = '+00:00'");
for (const sql of schema) await admin.query(sql);
const [[existing]]=await admin.query('SELECT COUNT(*) count FROM users');
if(existing.count){console.log('Service360 schema ready; existing data preserved.');await admin.end();process.exit(0);}
const hash=await bcrypt.hash('Service360!',12);
await admin.beginTransaction();
try{
  await admin.query("INSERT INTO customers(id,code,name,industry,contact_name,email,phone,sla_hours) VALUES (1,'CUS-001','ACME Retail Pvt. Ltd.','Retail','John Mathew','john@acme.example','+91 98765 43210',48),(2,'CUS-002','Delta Electronics','Electronics','Meera Shah','meera@delta.example','+91 98765 43211',24),(3,'CUS-003','City Mart','Retail','Vikram Rao','vikram@citymart.example','+91 98765 43212',48)");
  await admin.query("INSERT INTO products(id,sku,name,model,category,units_per_inner_carton,inner_cartons_per_master) VALUES (1,'POS-PRO-X1','POS Terminal','Pro X1','Devices',2,2),(2,'SCAN-S200','Barcode Scanner','S200','Devices',2,2),(3,'PRINT-T80','Thermal Printer','T80','Accessories',2,2)");
  await admin.query("INSERT INTO locations(id,code,name,type,region,capacity,product_id) VALUES (1,'HO-STAGING','HO Receiving / Staging','STAGING','Central',1000,NULL),(2,'A-01-01','HO Warehouse · Bin A-01-01','BIN','Central',200,1),(3,'A-01-02','HO Warehouse · Bin A-01-02','BIN','Central',200,2),(4,'NORTH-HUB','Region — North','HUB','North',2000,NULL),(5,'SOUTH-HUB','Region — South','HUB','South',2000,NULL),(6,'FSE-RAHUL','Rahul Sharma · Field Stock','ENGINEER','North',100,NULL),(7,'FSE-PRIYA','Priya Nair · Field Stock','ENGINEER','South',100,NULL),(8,'SITE-ABC','ABC Retail Store','SITE','North',100,NULL),(9,'SITE-ACME','ACME Flagship Store','SITE','North',100,NULL),(10,'SITE-DELTA','Delta Electronics','SITE','South',100,NULL),(11,'SITE-CITY','City Mart','SITE','North',100,NULL),(12,'QC-HOLD','HO Quarantine','QUARANTINE','Central',500,NULL),(13,'REPAIR-HO','Central Repair Centre','REPAIR','Central',500,NULL),(14,'B-01-01','HO Warehouse · Bin B-01-01','BIN','Central',200,3)");
  await admin.query("INSERT INTO users(id,name,email,password_hash,role,customer_id,location_id,region,skills) VALUES (1,'Alex Morgan','admin@service360.local',?,'admin',NULL,NULL,'All','Operations'),(2,'John Mathew','customer@service360.local',?,'customer',1,NULL,'North',NULL),(3,'Rahul Sharma','rahul@service360.local',?,'engineer',NULL,6,'North','Installation, Service, Replacement'),(4,'Priya Nair','priya@service360.local',?,'engineer',NULL,7,'South','Installation, Service, Inspection')",[hash,hash,hash,hash]);
  await admin.query("INSERT INTO sites(id,code,name,customer_id,address,city,region,contact_name,contact_phone,latitude,longitude,location_id) VALUES (1,'SIT-00045','ABC Retail Store',1,'24, MG Road, Connaught Place','New Delhi','North','Amit Kapoor','+91 98765 41001',28.6315,77.2167,8),(2,'SIT-00046','ACME Flagship Store',1,'18, Sector 18 Market','Noida','North','Anita Singh','+91 98765 41002',28.5706,77.3272,9),(3,'SIT-00047','Delta Electronics',2,'45, Residency Road','Bengaluru','South','Meera Shah','+91 98765 41003',12.9716,77.5946,10),(4,'SIT-00048','City Mart',3,'72, Civil Lines','New Delhi','North','Vikram Rao','+91 98765 41004',28.6833,77.2264,11)");
  await admin.query("INSERT INTO assets(id,serial,product_id,status,location_id,holder_user_id,site_id,customer_id) VALUES (1,'SN78451236',1,'ISSUED_TO_ENGINEER',6,3,NULL,NULL),(2,'SN78451237',1,'ISSUED_TO_ENGINEER',6,3,NULL,NULL),(3,'SN78451238',1,'INSTALLED',8,NULL,1,1),(4,'SN78451239',1,'INSTALLED',9,NULL,2,1),(5,'SN78451240',1,'INSTALLED',10,NULL,3,2),(6,'SN78451241',1,'INSTALLED',11,NULL,4,3),(7,'SN78451242',1,'AVAILABLE',4,NULL,NULL,NULL),(8,'SN78451243',1,'AVAILABLE',4,NULL,NULL,NULL),(9,'SC20000001',2,'ISSUED_TO_ENGINEER',6,3,NULL,NULL),(10,'SC20000002',2,'INSTALLED',8,NULL,1,1),(11,'SC20000003',2,'AVAILABLE',3,NULL,NULL,NULL),(12,'TP80000001',3,'INSTALLED',9,NULL,2,1),(13,'SN78451244',1,'ISSUED_TO_ENGINEER',7,4,NULL,NULL),(14,'SN78451245',1,'RETURNED_TO_ENGINEER',6,3,NULL,NULL),(15,'SN78451246',1,'REPAIR',13,NULL,NULL,NULL)");
  for(let i=0;i<20;i++)await admin.query("INSERT INTO assets(serial,product_id,status,location_id) VALUES (?,1,'AVAILABLE',2)",[`SN-STOCK-${String(i+1).padStart(4,'0')}`]);
  await admin.query("INSERT INTO asset_site_assignments(asset_id,site_id) SELECT id,site_id FROM assets WHERE site_id IS NOT NULL");
  const day=new Date().toISOString().slice(0,10);
  const due=new Date(Date.now()+48*3600000).toISOString().slice(0,19).replace('T',' ');
  const orders=[
    ['WO-100245','Installation','ASSIGNED','High','Install a new POS terminal at checkout',1,1,3,null,1,1,`${day} 10:00:00`],
    ['WO-100246','Service','IN_PROGRESS','High','Payment terminal intermittently disconnects',3,4,3,6,null,1,`${day} 13:00:00`],
    ['WO-100247','De-installation','ASSIGNED','Medium','Remove terminal from the old service counter',2,3,3,5,null,1,`${day} 15:30:00`],
    ['WO-100248','Replacement','ASSIGNED','High','Replace damaged checkout terminal',1,2,3,4,2,1,`${day} 16:00:00`],
    ['WO-100249','Preventive Maintenance','CREATED','Low','Quarterly equipment health check',1,1,null,3,null,1,`${day} 11:30:00`],
    ['WO-100250','Inspection','PENDING','Medium','Network and site readiness inspection',2,3,4,null,null,1,`${day} 14:00:00`],
    ['WO-100238','Installation','CLOSED','Medium','Install thermal receipt printer',1,2,4,12,null,3,`${day} 09:00:00`],
    ['WO-100239','Service','COMPLETED','Medium','Scanner connectivity resolved',1,1,3,10,null,2,`${day} 09:00:00`],
    ['WO-100240','Service','CLOSED','Low','Firmware upgrade completed',1,1,3,3,null,1,`${day} 09:00:00`],
    ['WO-100251','Installation','CREATED','Medium','New terminal for seasonal checkout',1,2,null,null,null,1,`${day} 17:00:00`]
  ];
  for(const o of orders) await admin.query('INSERT INTO work_orders(code,type,status,priority,summary,customer_id,site_id,engineer_id,asset_id,allocated_asset_id,product_id,scheduled_at,due_at,description,checklist,evidence,confirmation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,JSON_ARRAY(),JSON_ARRAY(),NULL)',[...o,due,o[4]]);
  await admin.query("UPDATE work_orders SET completed_at=UTC_TIMESTAMP(),resolution='Service verified and customer confirmation recorded.' WHERE status IN ('COMPLETED','CLOSED')");
  const items=[{id:'site_verified',label:'Customer and site details verified',required:true},{id:'installation_tested',label:'Installation / service tests passed',required:true},{id:'customer_briefed',label:'Customer briefed on completed work',required:true}];
  await admin.query('INSERT INTO checklist_templates(name,version,items,evidence_types) VALUES (?,1,?,?)',['Standard field service',JSON.stringify(items),JSON.stringify(['Shop front','Inside shop','Installed device'])]);
  for(let n=1;n<=3;n++){
    const status=n===1?'QC_PASSED':n===2?'RECEIVED':'EXPECTED';
    const [asn]=await admin.query('INSERT INTO asns(code,vendor,product_id,expected_qty,received_qty,status,expected_date) VALUES (?,?,1,4,?,?,?)',[`ASN-00056${n}`,'TechSupply Solutions',n===3?0:4,status,day]);
    const [mc]=await admin.query('INSERT INTO cartons(barcode,type,product_id,asn_id,qty,status,location_id,grn_code) VALUES (?,\'MASTER_CARTON\',1,?,4,?,1,?)',[`MC-00078${n}`,asn.insertId,status,n===3?null:`GRN-00034${n}`]);
    for(let k=1;k<=2;k++){
      const [ic]=await admin.query('INSERT INTO cartons(barcode,type,parent_id,original_parent_id,product_id,asn_id,qty,status,location_id,grn_code) VALUES (?,\'INNER_CARTON\',?,?,1,?,2,?,1,?)',[`IC-00${n}0${k}`,mc.insertId,mc.insertId,asn.insertId,status,n===3?null:`GRN-00034${n}`]);
      for(let j=1;j<=2;j++) await admin.query('INSERT INTO assets(serial,product_id,status,location_id,inner_carton_id,master_carton_id,original_inner_carton_id,original_master_carton_id,asn_id,grn_code) VALUES (?,1,?,1,?,?,?,?,?,?)',[`POS-${n}${k}${j}-2026`,n===3?'EXPECTED':'RECEIVED',ic.insertId,mc.insertId,ic.insertId,mc.insertId,asn.insertId,n===3?null:`GRN-00034${n}`]);
    }
    if(n===1)await admin.query("INSERT INTO putaway_tasks(code,carton_id,product_id,expected_qty,source_location_id,suggested_location_id) VALUES ('PA-000128',?,1,4,1,2)",[mc.insertId]);
  }
  await admin.query("INSERT INTO transfers(code,source_location_id,destination_location_id,status,asset_ids,created_by) VALUES ('ST-000084',4,6,'IN_TRANSIT',JSON_ARRAY(7,8),1)");
  await admin.query("UPDATE assets SET status='IN_TRANSIT' WHERE id IN (7,8)");
  await admin.query("INSERT INTO return_records(code,asset_id,source_location_id,destination_location_id,reason,\`condition\`,status,created_by) VALUES ('RT-000032',14,6,4,'Screen damage reported at customer site','DAMAGED','AWAITING_RECEIPT',3),('RT-000031',15,4,13,'Power supply fault','DAMAGED','REPAIR',1)");
  const activity=[['work_order',1,'ASSIGNED','WO-100245 assigned to Rahul Sharma'],['carton',1,'QC_PASSED','MC-000781 passed inbound quality checks'],['asn',2,'RECEIVED','GRN created for ASN-000562'],['work_order',8,'COMPLETED','WO-100239 completed by Rahul Sharma'],['transfer',1,'DISPATCHED','Stock dispatched from North Hub to Rahul Sharma'],['return',1,'RETURN_REQUESTED','Return initiated for SN78451245']];
  for(const a of activity)await admin.query('INSERT INTO activities(entity_type,entity_id,action,description,actor_id) VALUES (?,?,?,?,1)',a);
  await admin.query("INSERT INTO movements(asset_id,from_location_id,to_location_id,movement_type,source_type,actor_id,notes) SELECT id,NULL,location_id,'OPENING_BALANCE','seed',1,'Seeded local demonstration inventory' FROM assets WHERE status<>'EXPECTED'");
  await admin.commit();console.log('Service360 database initialized with customers, engineers, tasks, stock and cartons.');
}catch(e){await admin.rollback();throw e;}finally{await admin.end();}
