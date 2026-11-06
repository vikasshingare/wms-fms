import {pool} from './db.js';
import {migrateInbound,seedInboundMasters} from './inbound-schema.js';
try{await migrateInbound();await seedInboundMasters();console.log('ASN and inbound master schema ready.');}finally{await pool.end();}
