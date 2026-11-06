import {query} from './db.js';
export const inboundSchema=[
 `CREATE TABLE IF NOT EXISTS transfer_asns (asn_id INT PRIMARY KEY, transfer_id INT NOT NULL UNIQUE, source_warehouse_id INT NOT NULL, destination_warehouse_id INT NOT NULL, FOREIGN KEY(asn_id) REFERENCES asns(id), FOREIGN KEY(transfer_id) REFERENCES transfers(id))`,
 `CREATE TABLE IF NOT EXISTS transfer_asn_cartons (asn_id INT NOT NULL, carton_id INT NOT NULL, asn_line_id INT NOT NULL, mapping JSON NOT NULL, outcome VARCHAR(12) NULL, destination_location_id INT NULL, processed_at DATETIME NULL, PRIMARY KEY(asn_id,carton_id), FOREIGN KEY(asn_id) REFERENCES asns(id), FOREIGN KEY(carton_id) REFERENCES cartons(id))`,
 `CREATE TABLE IF NOT EXISTS outbound_transfer_photos (transfer_id INT PRIMARY KEY, photo MEDIUMTEXT NOT NULL, FOREIGN KEY(transfer_id) REFERENCES transfers(id))`,
 `CREATE TABLE IF NOT EXISTS inbound_masters(id INT PRIMARY KEY AUTO_INCREMENT,kind VARCHAR(32) NOT NULL,code VARCHAR(60) NOT NULL,name VARCHAR(180) NOT NULL,warehouse_id INT NULL,parent_id INT NULL,location_id INT NULL,product_id INT NULL,city VARCHAR(100),address VARCHAR(255),region VARCHAR(80),capacity INT NULL,units_per_inner INT NULL,inners_per_master INT NULL,items JSON NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY master_kind_code(kind,code))`,
 `CREATE TABLE IF NOT EXISTS asn_lines(id INT PRIMARY KEY AUTO_INCREMENT,asn_id INT NOT NULL,product_id INT NOT NULL,expected_qty INT NOT NULL,expected_boxes INT NOT NULL,manufacturing_date DATE NULL,units_per_inner INT NOT NULL,inners_per_master INT NOT NULL,pack_config_id INT NULL,FOREIGN KEY(asn_id) REFERENCES asns(id),FOREIGN KEY(product_id) REFERENCES products(id))`,
 `CREATE TABLE IF NOT EXISTS inbound_entries (
   asn_id INT PRIMARY KEY, arrival_details VARCHAR(500), docked_at DATETIME,
   offloaded_at DATETIME, supervisor_name VARCHAR(180), driver_handover VARCHAR(180),
   handed_over_at DATETIME, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(asn_id) REFERENCES asns(id)
 )`,
 `CREATE TABLE IF NOT EXISTS inbound_carton_checks (
   carton_id INT PRIMARY KEY, outcome ENUM('GOOD','LEAKAGE','DAMAGE') NOT NULL,
   FOREIGN KEY(carton_id) REFERENCES cartons(id)
 )`,
];
export const asnColumns={warehouse_id:'INT NULL',receiving_location_id:'INT NULL',invoice_no:'VARCHAR(100) NULL',invoice_date:'DATE NULL',po_no:'VARCHAR(100) NULL',po_date:'DATE NULL',material_source_id:'INT NULL',shipping_reference:'VARCHAR(180) NULL',factory_id:'INT NULL',container_no:'VARCHAR(100) NULL',consignor_id:'INT NULL',consignee_id:'INT NULL',consignor_city:'VARCHAR(100) NULL',seal_no:'VARCHAR(100) NULL',transport_mode_id:'INT NULL',shipment_date:'DATE NULL',zone_id:'INT NULL',pallet_id:'INT NULL',combo_id:'INT NULL'};
export async function migrateInbound(c){
 for(const sql of inboundSchema)await query(sql,[],c);
 for(const [table,columns] of Object.entries({asns:asnColumns,inbound_entries:{manifest_counts:'JSON NULL'},inbound_masters:{location_type:'VARCHAR(20) NULL'},cartons:{asn_line_id:'INT NULL',box_number:'INT NULL',box_total:'INT NULL'},transfers:{outbound:'JSON NULL'}})){
  const existing=await query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table],c);
  const names=new Set(existing.map(x=>x.COLUMN_NAME));
  for(const [name,type] of Object.entries(columns))if(!names.has(name))await query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`,[],c);
 }
 const indexes=await query("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inbound_masters'",[],c);
 if(indexes.some(index=>index.INDEX_NAME==='master_kind_code')){
  await query(`ALTER TABLE inbound_masters
    ADD COLUMN code_scope INT GENERATED ALWAYS AS (CASE WHEN kind='PALLET' THEN COALESCE(warehouse_id,0) ELSE 0 END) STORED,
    DROP INDEX master_kind_code,
    ADD UNIQUE KEY master_kind_scope_code(kind,code_scope,code)`,[],c);
 }
}

// Seed reusable reference choices without changing any existing master records.
export async function seedInboundMasters(c){
 // Preserve existing bin IDs while converting old zone-to-bin links into zone children.
 const legacyZones=await query("SELECT z.*,l.code bin_code,l.name bin_name,l.capacity bin_capacity FROM inbound_masters z JOIN locations l ON l.id=z.location_id WHERE z.kind='ZONE' AND l.type='BIN'",[],c);
 for(const z of legacyZones){await query("INSERT IGNORE INTO inbound_masters(kind,code,name,warehouse_id,parent_id,location_id,region,capacity,location_type) VALUES ('PALLET',?,?,?,?,?,?,?,'BIN')",[z.bin_code,z.bin_name,z.warehouse_id,z.id,z.location_id,z.region,z.bin_capacity],c);const [child]=await query("SELECT id FROM inbound_masters WHERE kind='PALLET' AND parent_id=? AND location_id=?",[z.id,z.location_id],c);if(child)await query('UPDATE inbound_masters SET location_id=NULL WHERE id=?',[z.id],c);}

 const [staging]=await query("SELECT * FROM locations WHERE type='STAGING' ORDER BY id LIMIT 1",[],c);
 if(staging){
  await query("INSERT IGNORE INTO inbound_masters(kind,code,name,location_id,region) VALUES ('WAREHOUSE','HO-WH','HO Warehouse',?,?)",[staging.id,staging.region],c);
  const [warehouse]=await query("SELECT * FROM inbound_masters WHERE kind='WAREHOUSE' AND code='HO-WH'",[],c);
  await query("INSERT IGNORE INTO inbound_masters(kind,code,name,warehouse_id,region) VALUES ('ZONE','HO-STORAGE','Storage zone',?,?)",[warehouse.id,staging.region],c);
  const [zone]=await query("SELECT id FROM inbound_masters WHERE kind='ZONE' AND code='HO-STORAGE'",[],c);
  const bins=await query("SELECT * FROM locations WHERE type='BIN' AND region=?",[staging.region],c);
  for(const bin of bins)if(!(await query("SELECT id FROM inbound_masters WHERE kind='PALLET' AND location_id=?",[bin.id],c)).length)await query("INSERT IGNORE INTO inbound_masters(kind,code,name,warehouse_id,parent_id,location_id,region,capacity,location_type) VALUES ('PALLET',?,?,?,?,?,?,?,'BIN')",[bin.code,bin.name,warehouse.id,zone.id,bin.id,bin.region,bin.capacity],c);

 }
 for(const [kind,code,name] of [['MATERIAL_SOURCE','SUPPLIER','Supplier / purchase receipt'],['MATERIAL_SOURCE','STN','Stock transfer note'],['MATERIAL_SOURCE','CUSTOMER_RETURN','Customer return'],['TRANSPORT','ROAD','Road'],['TRANSPORT','AIR','Air'],['TRANSPORT','SEA','Sea'],['TRANSPORT','RAIL','Rail']])await query('INSERT IGNORE INTO inbound_masters(kind,code,name) VALUES (?,?,?)',[kind,code,name],c);
}
