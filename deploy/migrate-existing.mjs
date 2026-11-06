// Run as root on the existing Linux deployment. Runtime credentials stay DML-only.
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const dotenv=require('dotenv');
const config=dotenv.parse(readFileSync('/etc/service360/api.env'));
if(config.DB_NAME!=='service360')throw new Error('Unexpected database; no migration performed');
const username='s360_mig_'+randomBytes(6).toString('hex');
const password=randomBytes(32).toString('hex');
function sql(input){
 const result=spawnSync('mysql',['--batch','--skip-column-names'],{input,encoding:'utf8'});
 if(result.status!==0)throw new Error('Administrative database command failed');
}
let pool;
try{
 sql(`CREATE USER '${username}'@'localhost' IDENTIFIED BY '${password}'; GRANT ALL ON service360.* TO '${username}'@'localhost';`);
 Object.assign(process.env,config,{DB_USER:username,DB_PASSWORD:password});
 ({pool}=await import('../server/src/db.js'));
 const {migrateInbound}=await import('../server/src/inbound-schema.js');
 await migrateInbound();
 console.log('Existing database migrated without replacing application data.');
}finally{
 if(pool)await pool.end();
 sql(`DROP USER IF EXISTS '${username}'@'localhost';`);
}
