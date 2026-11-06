import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './engineer-map.css';

function coordinates(latitude,longitude){
 if(latitude==null||longitude==null||latitude===''||longitude==='')return null;
 const lat=Number(latitude),lng=Number(longitude);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?[lat,lng]:null;
}

export default function EngineerMap({engineers,orders,selectedId,onSelect}){
 const container=useRef(null);
 const map=useRef(null);
 const [tilesUnavailable,setTilesUnavailable]=useState(false);
 const points=React.useMemo(()=>engineers.map(engineer=>{
  const job=orders.find(order=>order.engineer_id===engineer.id
   &&!['CLOSED','COMPLETED','CANCELLED'].includes(order.status)&&coordinates(order.latitude,order.longitude));
  const checkIn=coordinates(engineer.check_in_latitude,engineer.check_in_longitude);
  const position=checkIn||(job&&coordinates(job.latitude,job.longitude));
  const area=!checkIn&&job?[job.city,job.site_name].filter(Boolean).join(' · '):engineer.region;
  return {engineer,position,area:area||'Area unavailable',source:checkIn?'Last GPS check-in':job?'Assigned site':'No recorded location'};
 }),[engineers,orders]);
 const selected=points.find(point=>point.engineer.id===selectedId);

 useEffect(()=>{
  const instance=L.map(container.current,{scrollWheelZoom:false}).setView([22,79],4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).on('tileerror',()=>setTilesUnavailable(true)).on('tileload',()=>setTilesUnavailable(false)).addTo(instance);
  map.current=instance;
  return ()=>{instance.remove();map.current=null};
 },[]);

 useEffect(()=>{
  const instance=map.current;
  const layer=L.layerGroup().addTo(instance);
  const visible=points.filter(point=>point.position);
  for(const point of visible){
   const marker=L.marker(point.position,{
    title:point.engineer.name,alt:point.engineer.name,
    icon:L.divIcon({className:'engineer-map-pin',html:'<span></span>',iconSize:[20,20],iconAnchor:[10,10]}),
   }).addTo(layer);
   const label=document.createElement('span');
   label.textContent=point.engineer.name;
   marker.bindTooltip(label,{direction:'top',offset:[0,-10]});
   marker.on('click',()=>onSelect(point.engineer.id));
   if(point.engineer.id===selectedId)marker.openTooltip();
  }
  if(selected?.position)instance.setView(selected.position,13);
  else if(visible.length===1)instance.setView(visible[0].position,12);
  else if(visible.length>1)instance.fitBounds(visible.map(point=>point.position),{padding:[35,35],maxZoom:12});
  return ()=>layer.remove();
 },[points,selected,selectedId,onSelect]);

 return <section className="panel engineer-map-panel">
  <div className="section-head"><div><h2>Field engineer locations</h2>
   <p>Select an engineer or a map pin to see their area.</p></div>
   {selected&&<button className="btn secondary" onClick={()=>onSelect(null)}>Show all engineers</button>}
  </div>
  {selected&&<div className="engineer-map-summary" aria-live="polite">
   <strong>{selected.engineer.name}</strong> · {selected.area} · {selected.source}
   {selected.source==='Last GPS check-in'&&selected.engineer.location_recorded_at&&
    <small>Recorded {new Date(selected.engineer.location_recorded_at.replace(' ','T')+'Z').toLocaleString()}</small>}
   {selected.position&&<small>{selected.position.map(value=>value.toFixed(5)).join(', ')}</small>}
  </div>}
  {tilesUnavailable&&<p className="info-banner">The map background needs an internet connection. Engineer details remain available above.</p>}
  {!points.some(point=>point.position)&&<p className="info-banner">No GPS check-ins or assigned sites with coordinates are available yet.</p>}
  <div ref={container} className="engineer-map" aria-label="Map of field engineer locations"/>
 </section>;
}
