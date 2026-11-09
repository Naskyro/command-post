'use client';
import {delegatedUrl} from '@/lib/shared/client';

import { useState, type CSSProperties } from 'react';
import type { SchoolCourse } from '@/lib/school/model';
import './course-cover.css';

export const coverDesigns = [
  {id:'command', name:'Command Road', color:'gold'},
  {id:'dispatch', name:'Dispatch Signal', color:'sky'},
  {id:'field', name:'Field Operations', color:'mint'},
  {id:'executive', name:'Executive Blueprint', color:'coral'},
] as const;
export const coverAccents = {gold:'#ffcc5e',sky:'#8ddafa',mint:'#89e4c4',coral:'#ffb292'} as const;
type Design = typeof coverDesigns[number]['id'];
type Accent = keyof typeof coverAccents;
type CoverSource = Pick<SchoolCourse,'title'|'topic'> & {coverMediaId?:string;coverStyle?:Design;coverAccent?:Accent|''};
const blend = (input:string) => {let n=0; for(const ch of input)n=(Math.imul(n,31)+ch.charCodeAt(0))|0;return Math.abs(n);};

function Drawing({design}:{design:Design}) {
  return <svg className="sh-cover-drawing" viewBox="0 0 160 130" preserveAspectRatio="xMidYMid meet" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {design==='command'?<><g opacity=".34" strokeWidth="1"><path d="m3 128 64-66 13-36 27-24m-81 126 50-62 12-37 26-26m-59 124 34-58 10-34 23-29"/><path d="m18 121 21-14m64-24 34 7m-68-44-30-9"/></g><path d="M6 130c8-24 51-16 72-42 19-23-1-38 16-58 7-8 25-12 35-28m-93 128c14-9 42-13 56-32 18-25 0-46 15-60 8-8 22-12 30-22"/><path strokeDasharray="7 8" d="M20 132c17-18 49-18 65-41 15-22-2-42 16-59 10-9 24-14 32-25"/></>:null}
    {design==='dispatch'?<><g opacity=".25" strokeWidth="1">{[20,40,60,80,100,120,140].map(x=><path key={x} d={'M'+x+' 5v119'}/>)}{[20,40,60,80,100,120].map(y=><path key={y} d={'M8 '+y+'h146'}/>)}</g><path opacity=".65" d="M72 42a39 39 0 0 1 53 0m-46 9a27 27 0 0 1 38 0m-29 8a15 15 0 0 1 20 0"/><circle cx="98" cy="69" r="4"/><path d="m99 73 11 38-12-8-12 8 11-38m-6 23h13"/><path d="M8 80h17l4-5 5 13 5-27 5 41 5-25 4 6h14"/></>:null}
    {design==='field'?<><g opacity=".28" strokeWidth="1"><path d="m6 73 24-23 17 11 30-28 23 18 19-10 34 21M1 123h150m-15-10h20"/><circle cx="119" cy="27" r="10"/></g><path d="M12 86h73l6-17h23l15 16h10l7 6v9h-12m-16 0H47m-16 0H15v-9M23 81l35-33 19 2-3 7-13-2-32 26m28-27-1 15-13 11m74 4H95l4-10h12l8 10Z"/><circle cx="38" cy="101" r="8"/><circle cx="126" cy="101" r="8"/><path opacity=".6" d="M7 114h140"/></>:null}
    {design==='executive'?<><g opacity=".25" strokeWidth="1"><path d="M9 116h143M9 98h143M9 80h143M9 62h143M20 18v99m25-99v99m25-99v99m25-99v99m25-99v99m25-99v99"/></g><path d="M15 107h18V82h19v25h10V62h20v45h10V43h21v64h11V26h13v81h9"/><path opacity=".72" d="m17 69 26-16 20 3 22-17 21 1 24-23m-10 1 12-4-2 12"/></>:null}
  </svg>;
}

/** Only internally assigned media IDs become image URLs. Keep default art underneath
 * until the image loads, and retain it if the requester cannot retrieve that image. */
export default function CourseCover({course,compact=false,onUnavailable}:{course:CoverSource;compact?:boolean;onUnavailable?:()=>void}) {
  const [loadedId,setLoadedId] = useState('');
  const mediaId=/^cover-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(course.coverMediaId||'')?course.coverMediaId!:'';
  const visible=Boolean(mediaId&&loadedId===mediaId);
  const design=coverDesigns.find(v=>v.id===course.coverStyle)||coverDesigns[0];
  const accent=course.coverAccent&&Object.hasOwn(coverAccents,course.coverAccent)?course.coverAccent:design.color;
  const detail=String(course.topic||'Course').trim();
  return <div aria-hidden="true" className={'sh-cover sh-cover-'+design.id+(compact?' compact':'')} style={{'--sh-cover-accent':coverAccents[accent], '--sh-cover-shift':(blend(course.title)%14)+'px'} as CSSProperties}>
    <Drawing design={design.id}/><div className="sh-cover-type"><span className="sh-cover-brand"><img src="/pte-road.svg" alt="" width="53" height="27" loading="lazy"/><span>School House</span></span>
      <strong>{course.title.trim()||'Course Title'}</strong><span className="sh-cover-topic">{detail}</span></div>
    {mediaId&&<img key={mediaId} className={'sh-cover-upload'+(visible?' ready':'')} src={delegatedUrl('/api/school/cover?id='+encodeURIComponent(mediaId))} alt="" loading="lazy" decoding="async" onLoad={()=>setLoadedId(mediaId)} onError={()=>{setLoadedId('');onUnavailable?.();}}/>}
  </div>;
}
