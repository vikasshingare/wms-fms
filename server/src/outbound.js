import {Router} from 'express';
import {randomBytes} from 'node:crypto';
import {assertLocation,hasPermission,permittedLocations} from './authorization.js';
import {audit} from './data.js';
import {decode,fail,int,query,required,transaction} from './db.js';
import {breakCarton} from './wms.js';
import {validateWholeCartons,createTransferAsn} from './transfer-inbound.js';

export const outboundRouter=Router();
const types={INTERNAL:'STN',EXTERNAL:'EXT',ENGINEER:'FSE'};
const warehouseSql="SELECT id,code,name,location_id FROM inbound_masters WHERE kind IN ('WAREHOUSE','HUB') AND active=1 AND location_id IS NOT NULL";
const storageSql=`SELECT l.id,l.code,l.name,l.product_id,m.warehouse_id,m.code bin_code
 FROM inbound_masters m JOIN locations l ON l.id=m.location_id
 WHERE m.active=1 AND m.kind IN ('PALLET','ZONE') AND l.type='BIN'
 UNION
 SELECT l.id,l.code,l.name,l.product_id,m.id warehouse_id,l.code bin_code
 FROM inbound_masters m JOIN locations l ON l.id=m.location_id
 WHERE m.active=1 AND m.kind='HUB' AND l.type='HUB'`;

function requireWarehouse(user){
 if(user.role==='customer'||user.role==='engineer')fail('Warehouse access required',403);
}
function write(user){
 if(!hasPermission(user,'warehouse.write'))fail('Warehouse operations permission required',403);
}
function date(value,label){
 const parsed=new Date(value+'T00:00:00Z');
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==value)fail(`Enter a valid ${label}`);
 return value;
}
const marks=ids=>ids.map(()=>'?').join(',');
async function availableSources(user,warehouseId,c){
 const allowed=await permittedLocations(user,c);
 return (await query(`SELECT DISTINCT id FROM (${storageSql}) bins WHERE warehouse_id=?`,[warehouseId],c))
  .map(row=>row.id).filter(id=>!allowed||allowed.includes(id));
}
async function order(user,id,c,lock=false){
 const [row]=await query(`SELECT t.*,s.name source_name,d.name destination_name
  FROM transfers t JOIN locations s ON s.id=t.source_location_id JOIN locations d ON d.id=t.destination_location_id
  WHERE t.id=? AND t.outbound IS NOT NULL${lock?' FOR UPDATE':''}`,[id],c);
 if(!row)fail('Outbound order not found',404);
 if(lock)await assertLocation(user,row.source_location_id,c);
 else{
  const allowed=await permittedLocations(user,c);
  if(allowed&&!allowed.includes(row.source_location_id)&&!allowed.includes(row.destination_location_id))fail('Outbound order is outside your scope',403);
 }
 return {...row,outbound:decode(row.outbound),asset_ids:decode(row.asset_ids,[])};
}

outboundRouter.get('/options',async(req,res)=>{
 requireWarehouse(req.user);
 const scope=await permittedLocations(req.user);
 const warehouses=await query(warehouseSql);
 const sources=warehouses.filter(warehouse=>!scope||scope.includes(warehouse.location_id));
 const bins=await query(storageSql);
 const engineers=await query(`SELECT DISTINCT l.id,l.name FROM locations l JOIN users u ON u.location_id=l.id
  WHERE l.type='ENGINEER' AND u.role IN ('engineer','FIELD_ENGINEER') ORDER BY l.name`);
 const stock=await query(`SELECT location_id,product_id,COUNT(*) qty FROM assets
  WHERE status='AVAILABLE'${scope?.length?` AND location_id IN (${marks(scope)})`:scope?' AND 1=0':''}
  GROUP BY location_id,product_id`,scope||[]);
 res.json({sources,bins:bins.filter(bin=>warehouses.some(warehouse=>warehouse.id===bin.warehouse_id)),warehouses,engineers,stock});
});

outboundRouter.post('/',async(req,res)=>{
 write(req.user);
 const b=req.body;
 if(!Object.hasOwn(types,b.type))fail('Choose an outbound transfer type');
 const warehouseId=int(b.source_warehouse_id,'Source warehouse');
 const destinationId=int(b.destination_id,'Destination');
 const orderNo=required(b.order_no,'Order number').slice(0,100);
 const orderDate=date(b.order_date,'order date');
 const invoiceDate=b.invoice_date?date(b.invoice_date,'invoice date'):null;
 if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>50)fail('Add 1–50 product lines');
 const lines=b.lines.map(row=>({product_id:int(row?.product_id,'Product'),qty:int(row?.qty,'Quantity in pieces'),description:String(row?.description||'').trim().slice(0,500)}));
 if(new Set(lines.map(line=>line.product_id)).size!==lines.length)fail('Add each product once');
 if(lines.reduce((sum,line)=>sum+line.qty,0)>2000)fail('One order can contain up to 2,000 pieces');
 const photo=b.photo||null;
 if(photo&&(b.type!=='ENGINEER'||typeof photo!=='string'||photo.length>7*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)))fail('Attach a JPEG, PNG or WebP product photo under 5 MB for the engineer');
 res.status(201).json(await transaction(async c=>{
  const [warehouse]=await query(warehouseSql+' AND id=?',[warehouseId],c);
  if(!warehouse)fail('Source warehouse is unavailable');
  await assertLocation(req.user,warehouse.location_id,c);
  const [destination]=await query('SELECT id,name,type,product_id FROM locations WHERE id=?',[destinationId],c);
  if(!destination)fail('Destination is unavailable');
  if(b.type==='ENGINEER'){
   const [engineer]=await query("SELECT id FROM users WHERE location_id=? AND role IN ('engineer','FIELD_ENGINEER')",[destinationId],c);
   if(destination.type!=='ENGINEER'||!engineer)fail('Choose a field engineer stock location');
  }else{
   const matches=await query(`SELECT DISTINCT warehouse_id FROM (${storageSql}) bins WHERE id=?`,[destinationId],c);
   const receiving=await query(warehouseSql+' AND location_id=?',[destinationId],c);
   if((!matches.length&&!receiving.length)||receiving.some(w=>w.id===warehouseId))fail('Choose a destination for this transfer type');
   if(b.type==='EXTERNAL'&&matches.some(row=>row.warehouse_id===warehouseId))fail('Choose another warehouse');
   if(matches.some(row=>row.warehouse_id===warehouseId))await assertLocation(req.user,destinationId,c);
  }
  const sources=(await availableSources(req.user,warehouseId,c)).filter(id=>id!==destinationId);
  if(!sources.length)fail('There are no eligible source bins in this warehouse');
  for(const line of lines){
   if(destination.product_id&&destination.product_id!==line.product_id)fail('The destination bin does not accept this product');
   const [stock]=await query(`SELECT COUNT(*) qty FROM assets WHERE product_id=? AND status='AVAILABLE' AND location_id IN (${marks(sources)})`,[line.product_id,...sources],c);
   if(Number(stock.qty)<line.qty)fail('Requested quantity exceeds available stock',409);
  }
  const meta={type:b.type,order_no:orderNo,order_date:orderDate,invoice_date:invoiceDate,warehouse,lines,has_photo:!!photo};
  if(b.type!=='ENGINEER'){
   const destinations=await query(`SELECT DISTINCT w.id,w.code,w.name,w.location_id FROM inbound_masters w
    LEFT JOIN inbound_masters bin ON bin.warehouse_id=w.id AND bin.location_id=?
    WHERE w.active=1 AND w.kind IN ('WAREHOUSE','HUB') AND (w.location_id=? OR bin.id IS NOT NULL)`,[destinationId,destinationId],c);
   const target=destinations.find(w=>w.id!==warehouse.id);
   if(target)meta.destination_warehouse=target;
  }
  const code=`${types[b.type]}-${warehouse.code.slice(0,20)}-${randomBytes(5).toString('hex').toUpperCase()}`;
  const result=await query("INSERT INTO transfers(code,source_location_id,destination_location_id,status,asset_ids,created_by,outbound) VALUES (?,?,?,'DRAFT','[]',?,?)",[code,warehouse.location_id,destinationId,req.user.id,JSON.stringify(meta)],c);
  if(photo)await query('INSERT INTO outbound_transfer_photos(transfer_id,photo) VALUES (?,?)',[result.insertId,photo],c);
  await audit(c,req.user,'transfer',result.insertId,'ORDER_CREATED',`${code} outbound order created`);
  return {id:result.insertId,code};
 }));
});

outboundRouter.get('/:id',async(req,res)=>{
 requireWarehouse(req.user);
 res.json(await order(req.user,int(req.params.id,'Transfer')));
});
outboundRouter.get('/:id/photo',async(req,res)=>{
 const id=int(req.params.id,'Transfer');
 if(req.user.role==='customer')fail('Stock permission required',403);
 const transfer=await order(req.user,id);
 if(req.user.role==='engineer'&&!['IN_TRANSIT','RECEIVED'].includes(transfer.status))fail('This transfer has not shipped',403);
 const [record]=await query('SELECT photo FROM outbound_transfer_photos WHERE transfer_id=?',[id]);
 if(!record)fail('No product photo attached',404);
 res.set('Cache-Control','private, no-store').json(record);
});

outboundRouter.post('/:id/cancel',async(req,res)=>{
 write(req.user);
 const id=int(req.params.id,'Transfer');
 res.json(await transaction(async c=>{
  const transfer=await order(req.user,id,c,true);
  if(transfer.status==='CANCELLED')return transfer;
  if(!['DRAFT','RESERVED','PICKED'].includes(transfer.status))fail('Only orders awaiting ship-out can be cancelled',409);
  for(const location of new Set((transfer.outbound.picks||[]).map(pick=>pick.location_id)))await assertLocation(req.user,location,c);
  if(transfer.asset_ids.length){
   const updated=await query(`UPDATE assets SET status='AVAILABLE' WHERE status='RESERVED' AND id IN (${marks(transfer.asset_ids)})`,transfer.asset_ids,c);
   if(updated.affectedRows!==transfer.asset_ids.length)fail('Reserved stock changed. Review the order.',409);
  }
  await query("UPDATE transfers SET status='CANCELLED' WHERE id=?",[id],c);
  await audit(c,req.user,'transfer',id,'CANCELLED',`${transfer.code} cancelled before ship-out`);
  return order(req.user,id,c);
 }));
});

outboundRouter.post('/:id/pick-list',async(req,res)=>{
 write(req.user);
 const id=int(req.params.id,'Transfer');
 res.json(await transaction(async c=>{
  const transfer=await order(req.user,id,c,true);
  if(transfer.outbound.picks)return transfer;
  if(transfer.status!=='DRAFT')fail('Only draft orders can generate a pick list',409);
  const {warehouse,lines}=transfer.outbound;
  const sources=(await availableSources(req.user,warehouse.id,c)).filter(source=>source!==transfer.destination_location_id);
  if(!sources.length)fail('There are no eligible source bins');
  const bins=await query(`SELECT id,bin_code FROM (${storageSql}) bins WHERE warehouse_id=?`,[warehouse.id],c);
  const picks=[];
  for(const line of [...lines].sort((a,b)=>a.product_id-b.product_id)){
   const rows=await query(`SELECT a.id,a.serial,a.product_id,a.location_id,l.name location_name,p.sku,p.name product_name,
    p.units_per_inner_carton*p.inner_cartons_per_master units_per_box,
    master.barcode master_barcode,inner_carton.barcode inner_barcode,
    COALESCE((SELECT MIN(m.created_at) FROM movements m WHERE m.asset_id=a.id AND m.movement_type IN ('RECEIPT','OPENING_BALANCE')),a.created_at) fifo_date
    FROM assets a JOIN locations l ON l.id=a.location_id JOIN products p ON p.id=a.product_id
    LEFT JOIN cartons master ON master.id=COALESCE(a.master_carton_id,a.original_master_carton_id)
    LEFT JOIN cartons inner_carton ON inner_carton.id=COALESCE(a.inner_carton_id,a.original_inner_carton_id)
    WHERE a.product_id=? AND a.status='AVAILABLE' AND a.location_id IN (${marks(sources)})
    ${transfer.outbound.destination_warehouse?`AND a.master_carton_id IS NOT NULL AND master.status='STORED' AND master.sealed=1
     AND master.qty=(SELECT COUNT(*) FROM assets content WHERE content.master_carton_id=master.id AND content.status='AVAILABLE' AND content.location_id=a.location_id)` : ''}
    ORDER BY fifo_date,a.id LIMIT ? FOR UPDATE`,[line.product_id,...sources,line.qty],c);
   if(rows.length!==line.qty)fail('Available stock changed. Review the order quantities.',409);
   picks.push(...rows.map(row=>({...row,bin_code:bins.find(bin=>bin.id===row.location_id)?.bin_code})));
  }
  const ids=picks.map(pick=>pick.id);
  if(transfer.outbound.destination_warehouse)await validateWholeCartons(c,picks);
  await query(`UPDATE assets SET status='RESERVED' WHERE id IN (${marks(ids)})`,ids,c);
  const meta={...transfer.outbound,picks};
  await query("UPDATE transfers SET status='RESERVED',asset_ids=?,outbound=? WHERE id=?",[JSON.stringify(ids),JSON.stringify(meta),id],c);
  await audit(c,req.user,'transfer',id,'PICK_LIST_GENERATED',`${transfer.code} reserved ${ids.length} pieces by FIFO`);
  return order(req.user,id,c);
 }));
});

function groups(rows,key){
 const grouped=new Map();
 for(const row of rows){
  if(!row[key])continue;
  if(!grouped.has(row[key]))grouped.set(row[key],[]);
  grouped.get(row[key]).push(row);
 }
 return grouped;
}

outboundRouter.post('/:id/picked',async(req,res)=>{
 write(req.user);
 const id=int(req.params.id,'Transfer');
 res.json(await transaction(async c=>{
  const transfer=await order(req.user,id,c,true);
  const picks=transfer.outbound.picks||[];
  if(!picks.length||!['RESERVED','PICKED'].includes(transfer.status))fail('Generate a pick list before confirming stock',409);
  const scans=req.body.serials;
  if(!Array.isArray(scans)||scans.length!==picks.length||new Set(scans).size!==picks.length||picks.some(pick=>!scans.includes(pick.serial)))fail('Scanned serials must match the complete FIFO pick list');
  if(transfer.status==='PICKED')return transfer;
  const ids=picks.map(pick=>pick.id);
  const assets=await query(`SELECT id,serial,location_id,status,master_carton_id,inner_carton_id FROM assets WHERE id IN (${marks(ids)}) ORDER BY id FOR UPDATE`,ids,c);
  const planned=new Map(picks.map(pick=>[pick.id,pick]));
  if(assets.length!==picks.length||assets.some(asset=>asset.status!=='RESERVED'||asset.location_id!==planned.get(asset.id).location_id))fail('Reserved stock changed. Review the pick list.',409);
  for(const location of new Set(assets.map(asset=>asset.location_id)))await assertLocation(req.user,location,c);
  const reason=`FIFO pick for ${transfer.code}`;
  if(transfer.outbound.destination_warehouse)await validateWholeCartons(c,picks);
  for(const [master,items] of transfer.outbound.destination_warehouse?[]:groups(assets,'master_carton_id')){
   const childIds=[...new Set(items.map(item=>item.inner_carton_id).filter(Boolean))];
   await breakCarton(c,req.user,master,childIds.length?{child_ids:childIds,reason}:{serials:items.map(item=>item.serial),reason});
  }
  for(const [inner,items] of transfer.outbound.destination_warehouse?[]:groups(assets,'inner_carton_id'))await breakCarton(c,req.user,inner,{serials:items.map(item=>item.serial),reason});
  await query("UPDATE transfers SET status='PICKED' WHERE id=?",[id],c);
  await audit(c,req.user,'transfer',id,'PICKED',`${transfer.code} pick list confirmed`);
  return order(req.user,id,c);
 }));
});

outboundRouter.post('/:id/ship-out',async(req,res)=>{
 write(req.user);
 const id=int(req.params.id,'Transfer');
 const b=req.body;
 const gate={mode:required(b.mode,'Transport mode').slice(0,60),date:date(b.date,'ship-out date'),transporter:required(b.transporter,'Transporter name').slice(0,180),vehicle:String(b.vehicle||'').trim().slice(0,60)};
 if(gate.mode==='Road'&&!gate.vehicle)fail('Enter the vehicle number for road transport');
 res.json(await transaction(async c=>{
  const transfer=await order(req.user,id,c,true);
  if(transfer.outbound.gate&&Object.keys(gate).every(key=>gate[key]===transfer.outbound.gate[key]))return transfer;
  if(transfer.status!=='PICKED')fail('Confirm the pick list before ship-out',409);
  const picks=transfer.outbound.picks;
  if(transfer.outbound.destination_warehouse)await validateWholeCartons(c,picks);
  const ids=picks.map(pick=>pick.id);
  const assets=await query(`SELECT id,location_id,status,master_carton_id,inner_carton_id FROM assets WHERE id IN (${marks(ids)}) ORDER BY id FOR UPDATE`,ids,c);
  const planned=new Map(picks.map(pick=>[pick.id,pick]));
  if(assets.length!==picks.length||assets.some(asset=>asset.status!=='RESERVED'||asset.location_id!==planned.get(asset.id).location_id||(!transfer.outbound.destination_warehouse&&(asset.master_carton_id||asset.inner_carton_id))))fail('Picked stock changed. Review the order.',409);
  for(const location of new Set(assets.map(asset=>asset.location_id)))await assertLocation(req.user,location,c);
  await query(`UPDATE assets SET status='IN_TRANSIT' WHERE id IN (${marks(ids)})`,ids,c);
  for(const asset of assets){
   await query("INSERT INTO movements(asset_id,from_location_id,to_location_id,movement_type,source_type,source_id,actor_id,notes) VALUES (?,?,?,'DISPATCH','transfer',?,?,?)",[asset.id,asset.location_id,transfer.destination_location_id,id,req.user.id,gate.vehicle||gate.mode],c);
  }
  const receivingAsn=await createTransferAsn(c,req.user,transfer);
  await query("UPDATE transfers SET status='IN_TRANSIT',dispatched_at=UTC_TIMESTAMP(),outbound=? WHERE id=?",[JSON.stringify({...transfer.outbound,gate,receiving_asn_id:receivingAsn}),id],c);
  await audit(c,req.user,'transfer',id,'GATE_SHIP_OUT',`${transfer.code} shipped via ${gate.transporter}`);
  return order(req.user,id,c);
 }));
});
