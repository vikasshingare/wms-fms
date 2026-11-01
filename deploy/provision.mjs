// Run as root on the target host, after npm ci in server/. Never prints secrets.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const mysql=require('mysql2');
const bcrypt=require('bcryptjs');
function sql(input){const r=spawnSync('mysql',['--batch','--skip-column-names'],{input,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim();}
const present=sql("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='service360';");
const config='/etc/service360/api.env';
if(present==='1'&&!existsSync(config))throw new Error('Existing unmanaged service360 database detected; refusing to replace it.');
if(present==='0')sql(readFileSync(new URL('../database/service360.sql',import.meta.url),'utf8'));
if(!existsSync(config)){
  const password=randomBytes(30).toString('hex');
  sql(`CREATE USER 'service360_runtime'@'localhost' IDENTIFIED BY ${mysql.escape(password)}; GRANT SELECT,INSERT,UPDATE,DELETE ON service360.* TO 'service360_runtime'@'localhost';`);
  mkdirSync('/etc/service360',{recursive:true,mode:0o750});
  writeFileSync(config,`NODE_ENV=production\nHOST=127.0.0.1\nPORT=4200\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=service360\nDB_USER=service360_runtime\nDB_PASSWORD=${password}\nJWT_SECRET=${randomBytes(48).toString('hex')}\nCORS_ORIGINS=https://srv2091881.hstgr.cloud\nTRUST_PROXY=loopback\n`,{mode:0o640});
  const accounts=[];
  for(const email of ['admin@service360.local','customer@service360.local','rahul@service360.local','priya@service360.local']){
    const password=randomBytes(18).toString('base64url');
    const hash=await bcrypt.hash(password,12);
    sql(`UPDATE service360.users SET password_hash=${mysql.escape(hash)} WHERE email=${mysql.escape(email)};`);
    accounts.push({email,password});
  }
  writeFileSync('/root/service360-logins.json',JSON.stringify({portal:'https://srv2091881.hstgr.cloud/service360/',mobile:'https://srv2091881.hstgr.cloud/service360/mobile/',accounts},null,2),{mode:0o600});
}
console.log('Service360 database and private configuration ready.');
