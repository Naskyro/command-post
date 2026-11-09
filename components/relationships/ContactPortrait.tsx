'use client';
import {delegatedUrl} from '@/lib/shared/client';
import {useEffect,useState} from 'react';
import {Camera} from 'lucide-react';
import ProfilePhotoEditor from '@/components/people/ProfilePhotoEditor';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
export const samplePortraits:Record<string,string>={
 'sales-example:jordan':'/sample-portraits/jordan.webp','sales-example:taylor':'/sample-portraits/taylor.webp','sales-example:casey':'/sample-portraits/casey.webp'
};
export type PortraitProps={id:string;name:string;surface:'accounts'|'sales';relationId?:string;size?:number;version?:number;legacy?:boolean;onEdit?:()=>void};
export function portraitEndpoint(id:string,surface:string,relationId?:string){return '/api/relationships/photo?'+new URLSearchParams({contactId:id,surface,...(relationId?{relationId}:{})});}
export function ContactPortrait({id,name,surface,relationId,size=42,version=0,legacy=false}:PortraitProps){
 const [latest,setLatest]=useState<number|null>(null),[broken,setBroken]=useState('');
 useEffect(()=>{setLatest(null);setBroken('');const update=(e:Event)=>{const a=(e as CustomEvent).detail;if(a?.contactId===id){setBroken('');setLatest(a.hasPhoto?Number(a.version)||1:0);}};window.addEventListener('contact-portrait-updated',update);return()=>window.removeEventListener('contact-portrait-updated',update);},[id]);
 const v=latest??version,src=samplePortraits[id]||((v>0||legacy&&latest===null)?portraitEndpoint(id,surface,relationId)+'&v='+v:'');
 return <span className="crm-portrait" style={{width:size,height:size,flex:'0 0 '+size+'px',display:'inline-grid',placeItems:'center',overflow:'hidden',borderRadius:'50%',background:'#e3efec',color:'#234f48',fontSize:Math.max(12,size*.31),fontWeight:700,lineHeight:1}} aria-hidden="true">{src&&broken!==src?<img src={delegatedUrl(src)} alt="" loading="lazy" onError={()=>setBroken(src)} style={{display:'block',width:'100%',height:'100%',objectFit:'cover'}}/>:name.split(/\s+/).filter(Boolean).map(x=>x[0]).filter((_,i,a)=>i===0||i===a.length-1).join('').toUpperCase()}</span>;
}
export function EditContactPortrait({id,name,surface,relationId,refresh,label='Edit Photo'}:PortraitProps&{refresh?:()=>void|Promise<void>;label?:string}){
 const [open,setOpen]=useState(false);
 if(!id||id.startsWith('sales-example:'))return null;
 return <><button type="button" className="crm-photo-action" onClick={()=>setOpen(true)} title={'Change profile photo for '+name}><Camera size={15} aria-hidden="true"/>{label}</button>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>Contact Profile Photo</DialogTitle></DialogHeader>
 {open&&<ProfilePhotoEditor personId={id} name={name} contact={{surface,relationId}} onSaved={refresh} onClose={()=>setOpen(false)}/>}</DialogContent></Dialog></>;
}
