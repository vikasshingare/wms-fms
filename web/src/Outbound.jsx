import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import './outbound.css';

const types={INTERNAL:'Internal WH transfer',EXTERNAL:'External WH transfer',ENGINEER:'Field engineer dispatch'};
const today=()=>new Date().toLocaleDateString('en-CA');
const blankLine=()=>({product_id:'',qty:'',description:''});
const stateLabel=status=>({DRAFT:'Awaiting pick list',RESERVED:'Awaiting picking',PICKED:'Ready for ship-out',IN_TRANSIT:'Shipped',RECEIVED:'Received',CANCELLED:'Cancelled'}[status]||status);
const canWrite=data=>data.user?.permissions?.some(p=>p==='*'||p==='warehouse.write');
const Field=({label,children})=><label className="field"><span>{label}</span>{children}</label>;
const Button=({children,...props})=><button type="button" className="btn secondary" {...props}>{children}</button>;
const Intro=({title,children})=><div className="page-intro"><div><div className="eyebrow">WAREHOUSE MANAGEMENT</div><h1>{title}</h1></div><div className="inline-actions">{children}</div></div>;
const Table=({headers,children})=><div className="table-scroll"><table><thead><tr>{headers.map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;

function TransferForm({data,call,onSave,onCancel}){
 const [options,setOptions]=useState(null);
 const [type,setType]=useState('INTERNAL');
 const [source,setSource]=useState('');
 const [destination,setDestination]=useState('');
 const [lines,setLines]=useState([blankLine()]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  let current=true;
  call('/outbound/options').then(result=>{if(current)setOptions(result)}).catch(err=>{if(current)setError(err.message)});
  return ()=>{current=false};
 },[call]);
 const bins=options?.bins||[];
 const sourceBins=new Set(bins.filter(bin=>bin.warehouse_id===Number(source)).map(bin=>bin.id));
 const available=new Map();
 for(const row of options?.stock||[]){
  if(sourceBins.has(row.location_id)&&row.location_id!==Number(destination))available.set(row.product_id,(available.get(row.product_id)||0)+Number(row.qty));
 }
 const eligibleBins=bins.filter(bin=>type==='INTERNAL'
  ?bin.warehouse_id===Number(source)&&data.locations.some(location=>location.id===bin.id)
  :!sourceBins.has(bin.id));
 const destinations=type==='ENGINEER'?(options?.engineers||[]):[...new Map([...eligibleBins,...(type==='INTERNAL'?(options?.warehouses||[]).filter(w=>w.id!==Number(source)).map(w=>({...w,id:w.location_id,warehouse_id:w.id,bin_code:'Receiving ASN'})):[])].map(bin=>[bin.id,bin])).values()];
 const destinationBin=bins.find(bin=>bin.id===Number(destination));
 const products=data.products.filter(product=>available.get(product.id)>0&&(!destinationBin?.product_id||destinationBin.product_id===product.id));
 function changeDestination(value){
  setDestination(value);
  setLines([blankLine()]);
 }
 function updateLine(index,field,value){
  setLines(previous=>previous.map((line,i)=>i===index?{...line,[field]:value}:line));
 }
 async function submit(event){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  setBusy(true);setError('');
  try{
   const payload={type,source_warehouse_id:Number(source),destination_id:Number(destination),order_no:form.get('order_no'),order_date:form.get('order_date'),invoice_date:form.get('invoice_date'),lines};
   const image=form.get('photo');
   if(image?.size){
    if(image.size>5*1024*1024)throw new Error('Select a product photo under 5 MB.');
    payload.photo=await new Promise((resolve,reject)=>{
     const reader=new FileReader();
     reader.onload=()=>resolve(reader.result);
     reader.onerror=()=>reject(new Error('Could not read the product photo.'));
     reader.readAsDataURL(image);
    });
   }
   await onSave(await call('/outbound',payload));
  }catch(err){setError(err.message)}finally{setBusy(false)}
 }
 return <section className="panel outbound-form">
  <h2>New transfer order</h2>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {!options?<p>Loading warehouses and available stock…</p>:<form onSubmit={submit}>
   <div className="asn-fields">
    <Field label="Transfer type"><select value={type} onChange={e=>{setType(e.target.value);changeDestination('')}}>{Object.entries(types).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label="Order number"><input name="order_no" required maxLength={100}/></Field>
    <Field label="Order date"><input type="date" name="order_date" defaultValue={today()} required/></Field>
    <Field label="Invoice date"><input type="date" name="invoice_date"/></Field>
    <Field label="Source warehouse"><select required value={source} onChange={e=>{setSource(e.target.value);changeDestination('')}}><option value="">Select warehouse</option>{options.sources.map(warehouse=><option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></Field>
    <Field label={type==='ENGINEER'?'Field engineer':'Destination location'}><select required disabled={!source} value={destination} onChange={e=>changeDestination(e.target.value)}><option value="">Select destination</option>{destinations.map(location=><option key={location.id} value={location.id}>{type==='ENGINEER'?location.name:`${options.warehouses.find(w=>w.id===location.warehouse_id)?.code} · ${location.bin_code} · ${location.name}`}</option>)}</select></Field>
    {type==='ENGINEER'&&<Field label="Product photo for the engineer"><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"/></Field>}
   </div>
   <h3>Products</h3><p className="info-banner">Between warehouses, transfer complete intact master cartons. Existing master carton and product barcodes are retained. Ship-out creates the destination ASN; receiving staff upload the mapping with their bin locations.</p>
   {source&&destination&&!products.length&&<p className="info-banner">No available stock for this source and destination.</p>}
   {lines.map((line,index)=>{
    const product=products.find(p=>p.id===Number(line.product_id));
    const balance=available.get(Number(line.product_id))||0;
    const piecesPerBox=product?.units_per_inner_carton*product?.inner_cartons_per_master;
    return <div className="asn-fields outbound-line" key={index}>
     <Field label="Product"><select required disabled={!destination} value={line.product_id} onChange={e=>{updateLine(index,'product_id',e.target.value);updateLine(index,'qty','')}}><option value="">Select product</option>{products.filter(p=>p.id===Number(line.product_id)||!lines.some(other=>Number(other.product_id)===p.id)).map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
     <Field label="Quantity (PCS)"><input type="number" required min="1" max={balance} step="1" disabled={!product} value={line.qty} onChange={e=>updateLine(index,'qty',e.target.value)}/></Field>
     <Field label="Available (PCS)"><input readOnly value={balance}/></Field>
     <Field label="Packing equivalent"><input readOnly value={piecesPerBox?`${Math.floor(Number(line.qty)/piecesPerBox)} boxes + ${Number(line.qty)%piecesPerBox} PCS`:'—'}/></Field>
     <Field label="Description"><input maxLength={500} value={line.description} onChange={e=>updateLine(index,'description',e.target.value)}/></Field>
     {lines.length>1&&<Button onClick={()=>setLines(previous=>previous.filter((_,i)=>i!==index))}>Remove product</Button>}
    </div>;
   })}
   <div className="inline-actions">
    <Button disabled={!destination||lines.length>=Math.min(products.length,50)} onClick={()=>setLines(previous=>[...previous,blankLine()])}>Add product</Button>
    <button className="btn primary" disabled={busy||!destination||lines.some(line=>!line.product_id||!line.qty)}>Save order</button>
    <Button disabled={busy} onClick={onCancel}>Cancel</Button>
   </div>
  </form>}
 </section>;
}

export function Transfers({data,call,refresh,open,setModal}){
 const [creating,setCreating]=useState(false);
 const [search,setSearch]=useState('');
 const rows=data.transfers.filter(row=>[row.code,row.source_name,row.destination_name,row.outbound?.order_no].some(value=>String(value||'').toLowerCase().includes(search.toLowerCase())));
 return <>
  <Intro title="Transfers & dispatch"><Button onClick={()=>open('pick-lists')}>Pick lists</Button><Button onClick={()=>open('gate-ship-out')}>Gate ship-out</Button>{canWrite(data)&&<button className="btn primary" onClick={()=>setCreating(true)}>Create transfer</button>}</Intro>
  {creating&&<TransferForm data={data} call={call} onCancel={()=>setCreating(false)} onSave={async result=>{await refresh();open('pick-lists',result.id)}}/>}
  <section className="panel outbound-form">
   <Field label="Search transfers"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="STN, order number or location"/></Field>
   <Table headers={['STN no.','Transfer type','Source','Destination','Quantity','Status','Actions']}>
    {rows.map(row=><tr key={row.id}>
     <td><b>{row.code}</b><small className="cell-sub">{row.outbound?.order_no||'—'}</small></td><td>{types[row.outbound?.type]||'Stock transfer'}</td>
     <td>{row.outbound?.warehouse.name||row.source_name}</td><td>{row.destination_name}</td><td>{row.qty} PCS</td><td>{stateLabel(row.status)}</td>
     <td><div className="inline-actions">
      {row.outbound&&<Button onClick={()=>open('pick-lists',row.id)}>Pick list</Button>}
      {row.outbound&&['PICKED','IN_TRANSIT','RECEIVED'].includes(row.status)&&<Button onClick={()=>open('gate-ship-out',row.id)}>Ship-out</Button>}
      {!row.outbound&&row.status==='RESERVED'&&canWrite(data)&&<Button onClick={()=>setModal({kind:'transfer-dispatch',record:row})}>Dispatch</Button>}
      {row.status==='IN_TRANSIT'&&canWrite(data)&&<Button onClick={()=>setModal({kind:'transfer-receive',record:row})}>Confirm receipt</Button>}
     </div></td>
    </tr>)}
    {!rows.length&&<tr><td colSpan={7} className="inbound-empty">No matching transfers.</td></tr>}
   </Table>
  </section>
 </>;
}

function PickDocument({transfer,shipOut,products}){
 const {outbound:order}=transfer;
 const picks=order.picks||[];
 const productRows=order.lines.map(line=>{
  const item=picks.find(pick=>pick.product_id===line.product_id);
  const product=products.find(product=>product.id===line.product_id);
  const size=item?.units_per_box||(product?.units_per_inner_carton*product?.inner_cartons_per_master)||1;
  return {product:item?`${item.sku} · ${item.product_name}`:product?`${product.sku} · ${product.name}`:`Product ${line.product_id}`,qty:line.qty,boxes:Math.floor(line.qty/size),loose:line.qty%size,description:line.description};
 });
 return <article className="outbound-document">
  <h2>{types[order.type]} {shipOut?'ship-out':'pick list'}</h2>
  <dl className="outbound-document-meta">
   {[['STN no.',transfer.code],['Order no.',order.order_no],['Order date',order.order_date],['Invoice date',order.invoice_date],['From warehouse',order.warehouse.code+' · '+order.warehouse.name],['To location',transfer.destination_name],['Status',stateLabel(transfer.status)],['Products',order.lines.length]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}
   {shipOut&&order.gate&&Object.entries({Transport:order.gate.mode,'Ship-out date':order.gate.date,Transporter:order.gate.transporter,Vehicle:order.gate.vehicle}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}
  </dl>
  <h3>Product quantities</h3>
  <Table headers={['Product','Pick quantity (PCS)','Box equivalent','Loose PCS','Description']}>
   {productRows.map(row=><tr key={row.product}><td>{row.product}</td><td>{row.qty}</td><td>{row.boxes}</td><td>{row.loose}</td><td>{row.description||'—'}</td></tr>)}
   <tr><th>Total</th><td>{productRows.reduce((sum,row)=>sum+row.qty,0)}</td><td>{productRows.reduce((sum,row)=>sum+row.boxes,0)}</td><td>{productRows.reduce((sum,row)=>sum+row.loose,0)}</td><td/></tr>
  </Table>
  {picks.length>0&&<><div className="outbound-signatures"><div>Receiving supervisor signature</div><div>Delivery person signature</div></div>
  <h3>Pickup barcode details</h3>
  <Table headers={['#','Product','Pallet / bin','Warehouse','Master carton','Product barcode']}>
   {picks.map((pick,index)=><tr key={pick.id}><td>{index+1}</td><td>{pick.sku}</td><td>{pick.bin_code||pick.location_name}</td><td>{order.warehouse.code}</td><td>{pick.master_barcode||'—'}</td><td>{pick.serial}</td></tr>)}
  </Table></>}
 </article>;
}

export function OutboundWork({data,call,refresh,open,id,shipOut}){
 const [selected,setSelected]=useState(null);
 const [search,setSearch]=useState('');
 const [page,setPage]=useState(1);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [print,setPrint]=useState(false);
 const write=canWrite(data)&&data.locations.some(location=>location.id===selected?.source_location_id);
 useEffect(()=>{
  if(!id)return;
  let current=true;
  call('/outbound/'+id).then(order=>{if(current)setSelected(order)}).catch(err=>{if(current)setError(err.message)});
  return ()=>{current=false};
 },[id,call]);
 const filtered=data.transfers.filter(row=>row.outbound&&(!shipOut||['PICKED','IN_TRANSIT','RECEIVED'].includes(row.status))&&[row.code,row.destination_name,row.outbound.order_no].some(value=>String(value||'').toLowerCase().includes(search.toLowerCase())));
 const pages=Math.max(1,Math.ceil(filtered.length/10));
 const current=Math.min(page,pages);
 async function change(action,body={}){
  setBusy(true);setError('');
  try{setSelected(await call(`/outbound/${id}/${action}`,body));await refresh()}catch(err){setError(err.message)}finally{setBusy(false)}
 }
 return <>
  <Intro title={shipOut?'Gate ship-out':'FIFO pick lists'}><Button onClick={()=>open('transfers')}>Transfers</Button><Button onClick={()=>open(shipOut?'pick-lists':'gate-ship-out')}>{shipOut?'Pick lists':'Gate ship-out'}</Button></Intro>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {selected&&<section className="panel outbound-form">
   <h2>{selected.code} · {stateLabel(selected.status)}</h2>
   <p>{selected.outbound.warehouse.name} → {selected.destination_name}</p>
   {write&&selected.status==='DRAFT'&&!shipOut&&<Button disabled={busy} onClick={()=>change('pick-list')}>Generate FIFO pick list</Button>}
   {selected.outbound.picks?.length>0&&<Button onClick={()=>setPrint(true)}>{shipOut&&selected.outbound.gate?'Ship-out print':'Print pick list / carton details'}</Button>}
   {!shipOut&&selected.status==='RESERVED'&&write&&<form className="outbound-step" onSubmit={event=>{
    event.preventDefault();
    const serials=String(new FormData(event.currentTarget).get('serials')).trim().split(/[\s,;]+/).filter(Boolean);
    change('picked',{serials});
   }}><Field label="Scan picked serials"><textarea name="serials" rows={4} required placeholder="Scan one product serial per line"/></Field><button className="btn primary" disabled={busy}>Confirm picked stock</button></form>}
   {!shipOut&&selected.status==='PICKED'&&<Button onClick={()=>open('gate-ship-out',id)}>Open gate ship-out</Button>}
   {shipOut&&selected.status==='PICKED'&&write&&<form className="outbound-step" onSubmit={event=>{event.preventDefault();change('ship-out',Object.fromEntries(new FormData(event.currentTarget)))}}>
    <div className="asn-fields">
     <Field label="Mode of transport"><select name="mode" required>{['Road','Courier','Rail','Air','Sea','Hand carry'].map(mode=><option key={mode}>{mode}</option>)}</select></Field>
     <Field label="Ship-out date"><input type="date" name="date" defaultValue={today()} required/></Field>
     <Field label="Transporter name"><input name="transporter" maxLength={180} required/></Field>
     <Field label="Vehicle number"><input name="vehicle" maxLength={60}/></Field>
    </div><button className="btn primary" disabled={busy}>Confirm gate ship-out</button>
   </form>}
   {!shipOut&&write&&['DRAFT','RESERVED','PICKED'].includes(selected.status)&&<div className="outbound-step"><Button disabled={busy} onClick={()=>{if(window.confirm('Cancel this transfer and release its reserved stock?'))change('cancel')}}>Cancel transfer</Button></div>}
   <PickDocument transfer={selected} shipOut={shipOut} products={data.products}/>
  </section>}
  <section className="panel outbound-form">
   <Field label="Search by STN, order or destination"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></Field>
   <Table headers={['STN no.','Transfer type','Destination','Date','Status','Actions']}>
    {filtered.slice((current-1)*10,current*10).map(row=><tr key={row.id}><td><b>{row.code}</b></td><td>{types[row.outbound.type]}</td><td>{row.destination_name}</td><td>{row.outbound.gate?.date||row.outbound.order_date}</td><td>{stateLabel(row.status)}</td><td><Button disabled={busy} onClick={()=>open(shipOut?'gate-ship-out':'pick-lists',row.id)}>{shipOut?'View ship-out':'View pick list'}</Button></td></tr>)}
    {!filtered.length&&<tr><td colSpan={6} className="inbound-empty">No matching orders.</td></tr>}
   </Table>
   <nav className="inline-actions" aria-label="Outbound history pagination"><Button disabled={current===1} onClick={()=>setPage(current-1)}>Previous</Button><span>Page {current} of {pages}</span><Button disabled={current===pages} onClick={()=>setPage(current+1)}>Next</Button></nav>
  </section>
  {print&&selected&&createPortal(<div className="modal-overlay outbound-print"><section className="inbound-dialog" role="dialog" aria-label="Print preview"><div className="modal-header"><h2>Print preview</h2><div className="inline-actions"><Button onClick={()=>window.print()}>Print</Button><Button onClick={()=>setPrint(false)}>Close</Button></div></div><div className="inbound-dialog-body"><PickDocument transfer={selected} shipOut={shipOut} products={data.products}/></div></section></div>,document.body)}
 </>;
}
