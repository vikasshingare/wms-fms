import {schema} from './schema.js';
import {pool,query} from './db.js';
// Additive migration: preserves existing users, passwords, roles and inventory.
try{for(const sql of schema)await query(sql);await query('ALTER TABLE users MODIFY role VARCHAR(40) NOT NULL');console.log('Authentication and authorization schema is ready.');}finally{await pool.end();}
