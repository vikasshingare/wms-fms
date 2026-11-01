import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({host:process.env.DB_HOST || '127.0.0.1',port:Number(process.env.DB_PORT || 3306),user:process.env.DB_USER || 'service360_app',password:process.env.DB_PASSWORD || '',database:process.env.DB_NAME || 'service360',waitForConnections:true,connectionLimit:12,timezone:'Z',dateStrings:true,decimalNumbers:true});
export async function query(sql, params=[], connection=pool) { const [rows] = await connection.execute(sql, params); return rows; }
export async function transaction(fn) { const c=await pool.getConnection(); try {await c.query("SET time_zone = '+00:00'");await c.beginTransaction();const result=await fn(c);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();} }
export function decode(value, fallback=null){ if(value==null) return fallback; if(typeof value==='object')return value;try{return JSON.parse(value);}catch{return fallback;} }
export function fail(message,status=400,code='VALIDATION_ERROR'){const error=new Error(message);error.status=status;error.code=code;throw error;}
export function required(value,label){if(value===undefined||value===null||String(value).trim()==='')fail(`${label} is required`);return String(value).trim();}
export function int(value,label){const n=Number(value);if(!Number.isInteger(n)||n<1)fail(`${label} must be a positive integer`);return n;}
export const nowSql = () => new Date().toISOString().slice(0,19).replace('T',' ');
