import React,{useState} from 'react';

const columns=['master_carton_barcode','product_barcode','condition','putaway_location'];
const conditions=[['GOOD','Good'],['BAD','Bad'],['DAMAGE','Damaged']];
const entryPath=id=>`/inbound/asns/${id}/entry`;

function CartonJourney({rows}){
 const [page,setPage]=useState(1);
 const pages=Math.max(1,Math.ceil(rows.length/10)),current=Math.min(page,pages);
 return <section className="panel" style={{marginTop:20}}><div className="section-head"><h2>Carton warehouse journey</h2></div>
  <div className="table-scroll"><table><thead><tr>{['Master carton','Transfer','Receiving ASN','From warehouse','To warehouse','Shipped','Put away','Condition','Bin'].map(c=><th key={c}>{c}</th>)}</tr></thead>
  <tbody>{rows.slice((current-1)*10,current*10).map(r=><tr key={r.asn_code+r.barcode}>{[r.barcode,r.transfer_code,r.asn_code,r.source_warehouse,r.destination_warehouse,r.dispatched_at,r.processed_at,r.outcome,r.putaway_location].map((value,i)=><td key={i}>{value||'—'}</td>)}</tr>)}</tbody></table></div>
  <div className="table-toolbar"><span>{rows.length} carton movements</span><button className="btn secondary" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {pages}</span><button className="btn secondary" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button></div>
 </section>;
}

function ManifestHistory({rows,onOpen,busy,mapping}){
 const [page,setPage]=useState(1);
 const [pageSize,setPageSize]=useState(10);
 const saved=rows.filter(row=>row.manifest_ready&&(!mapping||row.processed_boxes>0)).sort((a,b)=>
  String(b.entry_created_at||'').localeCompare(String(a.entry_created_at||''))||b.id-a.id);
 const pages=Math.max(1,Math.ceil(saved.length/pageSize));
 const current=Math.min(page,pages);
 const start=(current-1)*pageSize;
 return <section className="panel" style={{marginTop:20}}>
  <div className="section-head"><div><h2>{mapping?'Putaway carton mapping history':'Inbound manifest history'}</h2><p>{mapping?'Processed carton mappings by ASN and warehouse.':'Saved manifests by ASN and warehouse.'}</p></div></div>
  <div className="table-scroll"><table>
   <thead><tr>{['ASN','Warehouse','Entry created','Good boxes','Bad boxes','Damaged boxes',...(mapping?['Mapped boxes','Remaining boxes']:[]),'Action'].map(label=><th key={label}>{label}</th>)}</tr></thead>
   <tbody>{saved.slice(start,start+pageSize).map(row=>{
    const counts=typeof row.manifest_counts==='string'?JSON.parse(row.manifest_counts):row.manifest_counts;
    const totals=conditions.map(([key])=>Object.values(counts||{}).reduce((sum,line)=>sum+Number(line[key]||0),0));
    return <tr key={row.id}><td><b>{row.code}</b></td><td>{row.warehouse}</td><td>{row.entry_created_at?.slice(0,10)||'—'}</td>
     {totals.map((total,index)=><td key={conditions[index][0]}>{total}</td>)}
     {mapping&&<><td>{row.processed_boxes}</td><td>{totals.reduce((sum,total)=>sum+total,0)-row.processed_boxes}</td></>}
     <td><button className="btn secondary" disabled={busy} onClick={()=>onOpen(row.id)}>{mapping?'View mapping':'View manifest'}</button></td></tr>;
   })}
   {!saved.length&&<tr><td colSpan={mapping?9:7} className="inbound-empty">{mapping?'No carton mappings processed yet.':'No saved manifests yet.'}</td></tr>}</tbody>
  </table></div>
  <div className="table-toolbar">
   <label className="field"><span>Rows per page</span><select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}>{[5,10,25,50].map(size=><option key={size}>{size}</option>)}</select></label>
   <span aria-live="polite">{saved.length?start+1:0}–{Math.min(start+pageSize,saved.length)} of {saved.length} {mapping?'mappings':'manifests'}</span>
   <nav className="inline-actions" aria-label={mapping?'Mapping history pagination':'Manifest history pagination'}>
    <button className="btn secondary" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button>
    <span>Page {current} of {pages}</span>
    <button className="btn secondary" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button>
   </nav>
  </div>
 </section>;
}

export default function InboundEntry({data,call,refresh,navigate,mapping=false}){
 const [detail,setDetail]=useState(null);
 const [draft,setDraft]=useState({});
 const [file,setFile]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const canWrite=data.user?.permissions?.some(p=>p==='*'||p==='warehouse.write');
 const asn=detail?.asn;
 const rows=data.asns.filter(a=>a.warehouse_id&&(!mapping||a.manifest_ready));
 async function run(action){
  setBusy(true);setError('');setNotice('');
  try{await action()}catch(err){setError(err.message)}finally{setBusy(false)}
 }
 function select(id){
  setDetail(null);setFile(null);
  if(!id)return;
  run(async()=>{
   const next=await call(entryPath(id));
   setDetail(next);
   setDraft(Object.fromEntries(next.asn.lines.map(l=>[l.id,next.manifest?.[l.id]||{GOOD:0,BAD:0,DAMAGE:0}])));
  });
 }
 async function submit(event){
  event.preventDefault();
  run(async()=>{
   if(mapping){
    if(!file||file.size>5*1024*1024)throw new Error('Select a CSV or Excel (.xlsx) file up to 5 MB.');
    let payload;
    if(/\.xlsx$/i.test(file.name)){
     const {readSheet}=await import('read-excel-file/browser');
     const [headers,...cells]=await readSheet(file);
     const keys=columns;
     const indexes=keys.map(column=>headers?.indexOf(column)??-1);
     if(indexes.slice(0,3).some(index=>index<0))throw new Error('Use the column names from the mapping template.');
     payload={rows:cells.filter(row=>row.some(value=>value!=null)).map(row=>Object.fromEntries(keys.map((key,i)=>[key,row[indexes[i]]])))};
    }else if(/\.csv$/i.test(file.name)){payload={csv:await file.text()};}
    else throw new Error('Choose a CSV or Excel (.xlsx) file.');
    setDetail(await call(entryPath(asn.id)+'/putaway-mapping',payload));
    setFile(null);
    setNotice(asn.transfer?'Transfer cartons received at the uploaded bin locations.':'Cartons mapped. Cartons without an uploaded bin are ready to confirm in Carton putaway.');
   }else{
    const lines=asn.lines.map(line=>({id:line.id,...draft[line.id]}));
    setDetail(await call(entryPath(asn.id)+'/manifest',{lines}));
    setNotice('Manifest counts saved. Open putaway mapping when the cartons are ready.');
   }
   await refresh();
  });
 }
 function template(){
  run(async()=>{
   const result=await call(entryPath(asn.id)+'/mapping-template');
   if(!result.rows.length)throw new Error('This ASN has no master cartons to download.');
   const csv=[result.columns.join(','),...result.rows.map(row=>result.columns.map(key=>'"'+String(row[key]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');
   const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
   const link=document.createElement('a');
   link.href=url;link.download=asn.code+'-putaway-mapping.csv';document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   setNotice('CSV downloaded: '+link.download+'. Fill the destination location before uploading.');
  });
 }
 const locked=asn?.received_qty>0;
 return <>
  <div className="page-intro">
   <div><div className="eyebrow">WAREHOUSE MANAGEMENT</div><h1>{mapping?'Putaway carton mapping':'Inbound manifest'}</h1>
    <p>{mapping?'Map product barcodes directly to master cartons for a saved manifest.':'Record good, bad, and damaged master box counts for each ASN product.'}</p></div>
   <button className="btn secondary" onClick={()=>navigate(mapping?'putaway':'putaway-mapping')}>{mapping?'Open putaway tasks':'Open putaway mapping'}</button>
  </div>
  <section className="panel">
   <div className="table-toolbar"><label className="field"><span>ASN</span>
    <select id="manifest-asn" disabled={busy} value={asn?.id||''} onChange={event=>select(event.target.value)}>
     <option value="">Select an ASN</option>{rows.map(a=><option key={a.id} value={a.id}>{a.code} · {a.warehouse}</option>)}
    </select></label></div>
   {error&&<div className="form-error" role="alert">{error}</div>}
   {notice&&<div className="info-banner" role="status">{notice}</div>}
   {asn?.transfer&&<div className="info-banner">Warehouse transfer: {asn.transfer.source_warehouse} → {asn.transfer.destination_warehouse}. Keep the existing master carton and product_barcode values. Enter the destination bin in putaway_location. Use one row per product.</div>}
   {asn&&<form className="grn-inspection" onSubmit={submit}>
    <div className="table-scroll"><table><thead><tr>{['Product','Expected PCS','Expected boxes',...conditions.map(([,label])=>label+' boxes'),'Balance'].map(label=><th key={label}>{label}</th>)}</tr></thead>
     <tbody>{asn.lines.map(line=>{
      const counts=mapping?detail.manifest?.[line.id]:draft[line.id];
      const total=conditions.reduce((sum,[key])=>sum+(counts?.[key]||0),0);
      const processed=asn.cartons.filter(c=>c.type==='MASTER_CARTON'&&c.asn_line_id===line.id&&c.status!=='EXPECTED').length;
      return <tr key={line.id}><td>{line.sku} · {line.product_name}</td><td>{line.expected_qty}</td><td>{line.expected_boxes}</td>
       {conditions.map(([key,label])=><td key={key}>{mapping||locked||!canWrite?counts?.[key]??0:<input aria-label={line.sku+' '+label+' boxes'} type="number" min={0} max={line.expected_boxes} step={1} required value={counts?.[key]??0} onChange={e=>setDraft(prev=>({...prev,[line.id]:{...prev[line.id],[key]:Number(e.target.value)}}))}/>}</td>)}
       <td>{mapping?line.expected_boxes-processed:line.expected_boxes-total}</td></tr>;
     })}</tbody></table></div>
    {mapping&&canWrite&&<div className="table-toolbar">
     <p>Use one row per product_barcode. Repeat the master_carton_barcode for products in the same box. Enter barcodes as text in Excel.</p>
     <button className="btn secondary" type="button" onClick={template} disabled={busy||!asn.cartons.some(c=>c.type==='MASTER_CARTON')}>Download CSV template</button>
     <label className="field"><span>Carton mapping CSV or Excel</span><input key={file?'selected':'empty'} type="file" accept=".csv,.xlsx" required={!file} onChange={e=>setFile(e.target.files[0]||null)}/>{file&&<small>{file.name}</small>}</label>
    </div>}
    {canWrite&&(mapping||!locked)&&<div className="table-toolbar"><button className="btn primary" disabled={busy||(mapping&&!file)}>{mapping?'Upload and process cartons':'Save box counts'}</button></div>}
   </form>}
  </section>
  {!!detail?.journey?.length&&<CartonJourney key={asn.id} rows={detail.journey}/>}
  <ManifestHistory rows={rows} mapping={mapping} busy={busy} onOpen={id=>{
   select(id);
   document.getElementById('manifest-asn')?.focus();
  }}/>
 </>;
}
