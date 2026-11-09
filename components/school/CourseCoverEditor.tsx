'use client';

import { useEffect, useId, useState } from 'react';
import { ImagePlus, RotateCcw } from 'lucide-react';
import type { SchoolCourse } from '@/lib/school/model';
import CourseCover,{coverDesigns,coverAccents} from './CourseCover';

export default function CourseCoverEditor({course,onEdit,busy,run}:{course:SchoolCourse;onEdit:(patch:Partial<SchoolCourse>)=>void;busy:boolean;run:(job:()=>Promise<void>)=>Promise<void>}) {
  const id=useId(),[message,setMessage]=useState(''),[uploading,setUploading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{setMessage('');setError('');},[course.version]);
  async function upload(file:File){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>5*1024*1024)throw new Error('Choose a JPEG, PNG, or WebP image up to 5 MB.');
    const form=new FormData();form.set('file',file);if(course.version>0)form.set('courseId',course.id);
    const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),40000);
    setUploading(true);setMessage('');
    try{
      const res=await fetch('/api/school/cover',{method:'POST',body:form,signal:controller.signal});
      const result=await res.json() as {id?:string;error?:string};
      if(!res.ok||!result.id)throw new Error(result.error||'The image could not be uploaded.');
      onEdit({coverMediaId:result.id});
      setMessage('Image uploaded. Save the course to apply this cover.');
    }catch(e){if(e instanceof Error&&e.name==='AbortError')throw new Error('The upload timed out. Try again.');throw e}
    finally{window.clearTimeout(timer);setUploading(false);}
  }
  return <section className="sh-cover-editor" aria-labelledby={id+'-title'}><div><h3 id={id+'-title'}>Course Cover</h3><p>Choose a title card or upload your own image. Learners see the saved cover in their course list.</p></div>
    <div className="sh-cover-editlayout"><figure><CourseCover course={course} onUnavailable={()=>setError('The saved image is unavailable. A title card is shown; upload a replacement or choose Use Default.')}/><figcaption>{course.coverMediaId?'Uploaded image':'Title card'} · Learner preview</figcaption></figure>
    <div className="sh-cover-options"><label>Title Card Design<select value={course.coverStyle||'command'} disabled={busy} onChange={e=>{onEdit({coverStyle:e.target.value as SchoolCourse['coverStyle'],coverMediaId:''});setMessage('Title card selected. Save the course to apply it.');}}>
      {coverDesigns.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Accent Color<select value={course.coverAccent||''} disabled={busy} onChange={e=>{onEdit({coverAccent:e.target.value as SchoolCourse['coverAccent'],coverMediaId:''});setMessage('Accent changed. Save the course to apply it.');}}><option value="">Design Default</option>{Object.keys(coverAccents).map(c=><option key={c} value={c}>{c[0].toUpperCase()+c.slice(1)}</option>)}</select></label>
      <div className="sh-cover-actions"><label className={'sh-cover-upload-control'+(busy?' busy':'')}><ImagePlus size={16} aria-hidden="true"/>{uploading?'Uploading…':course.coverMediaId?'Replace Image':'Upload Image'}
        <input type="file" disabled={busy} accept="image/png,image/jpeg,image/webp" aria-label="Upload Course Cover" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void run(async()=>{setError('');setMessage('');try{await upload(file);}catch(err){setError(err instanceof Error?err.message:'The image could not be uploaded.');}});}}/></label>
        {(course.coverMediaId||course.coverStyle&&course.coverStyle!=='command'||course.coverAccent)&&<button type="button" className="sha-button" disabled={busy} onClick={()=>{onEdit({coverMediaId:'',coverStyle:'command',coverAccent:''});setMessage('Default restored in the preview. Save to apply.');}}><RotateCcw size={14}/>Use Default</button>}</div>
      <small>JPG, PNG, or WebP · up to 5 MB. The preview shows the display crop.</small>
    </div></div>{error&&<p className="sha-alert error" role="alert">{error}</p>}{message&&<p className="sh-cover-message" role="status">{message}</p>}
  </section>;
}
