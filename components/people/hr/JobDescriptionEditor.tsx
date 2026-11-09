'use client';
import {DescriptionPaySelector} from './VacancyChoiceControls';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,Download,FileText,LockKeyhole,Plus,Save,Trash2} from 'lucide-react';
import SopPdfPages from '@/components/sop/SopPdfPages';
import {Button} from './ui';
import './job-authoring.css';

export type DescriptionFields=Record<string,string>;
export type DepartmentOption={id:string;name:string};
export type DescriptionEdition={id:string;version:number;etag:number;status:'Draft'|'Published'|'Archived';departmentId:string;departmentName:string;content:DescriptionFields;canEdit:boolean};
export type DescriptionCatalog={descriptions:DescriptionEdition[];departments:DepartmentOption[];canCreate:boolean;referenceTemplate?:DescriptionFields};
const keys=['title','flsaStatus','payBasis','reportsTo','summary','essentialFunctions','physicalDemands','workEnvironment','educationExperience','knowledgeSkills','supervises','collaboratesWith','authorityLimits','revisedBy','revisedDate'];
const duty='Other duties as assigned';
const isDefault=(v:string)=>/^(?:(?:perform\s+)?other duties as (?:needed and )?assigned)[.!]?$/i.test(v.trim().replace(/^[-•]\s*/,''));
const dutyLines=(v:string)=>String(v||'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!isDefault(s));
export function descriptionFields(input:Record<string,unknown>={}):DescriptionFields {
 const values=Object.fromEntries(keys.map(k=>[k,Array.isArray(input[k])?(input[k] as unknown[]).map(e=>String(e??'')).join('\n'):String(input[k]??'')]));
 values.essentialFunctions=[...dutyLines(values.essentialFunctions),duty].join('\n');
 return values;
}
type Step={label:string;caption:string};
export function AuthorSteps({steps,step,onChange,label,disabled=false}:{steps:Step[];step:number;onChange:(i:number)=>void;label:string;disabled?:boolean}){
 return <nav className="hja-steps" aria-label={label}>{steps.map((s,i)=><button key={s.label} type="button" disabled={disabled} onClick={()=>onChange(i)} aria-current={i===step?'step':undefined}><span className="hja-step-index">{i+1}</span><span>{s.label}</span></button>)}</nav>;
}
export function AuthorField({label,children,hint,wide=false}:{label:string;children:ReactNode;hint?:string;wide?:boolean}){
 return <label className={'hja-field'+(wide?' hja-wide':'')}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;
}
export function JobPdfPreview({content,version}:{content:Record<string,unknown>;version?:number}){
 const value=JSON.stringify(descriptionFields(content)),[attempt,setAttempt]=useState(0);
 const [state,setState]=useState<{value:string;url?:string;error?:string}>();
 useEffect(()=>{let active=true,url='';void(async()=>{try{
  const {buildTemplateJobDescription}=await import('./job-description-pdf');const doc=await buildTemplateJobDescription(JSON.parse(value));
  if(!active)return;url=URL.createObjectURL(doc.output('blob'));setState({value,url});
 }catch(e){if(active)setState({value,error:(e as Error).message||'The PDF could not be generated.'});}})();return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[value,attempt]);
 const current=state?.value===value?state:undefined,filename=(String(content.title||'Job Description').replace(/[^\p{L}\p{N} _-]/gu,'').trim()||'Job Description')+(version?' - v'+version:'')+'.pdf';
 return <section className="hja-pdf" aria-label="Job Description PDF"><div className="hja-pdf-head"><div><FileText size={19}/><b>Job Description PDF</b>{version&&<small>Version {version}</small>}</div>{current?.url&&<a className="hr2-button" download={filename} href={current.url}><Download size={16}/>Download PDF</a>}</div>
 {current?.url?<SopPdfPages url={current.url} title={String(content.title||'Job Description')}/>:current?.error?<div role="alert" className="hja-pdf-state">{current.error} <Button onClick={()=>{setState(undefined);setAttempt(a=>a+1);}}>Retry Preview</Button></div>:<p role="status" className="hja-pdf-state">Preparing PDF…</p>}</section>;
}
export function EditionPdfPreview({id,version,title}:{id:string;version:number;title:string}){
 const url='/api/hr/job-descriptions/pdf?id='+encodeURIComponent(id)+'&version='+version;
 return <section className="hja-pdf" aria-label="Vacancy Job Description"><div className="hja-pdf-head"><div><FileText size={18}/><b>{title||'Job Description'}</b><small>Version {version}</small></div><a className="hr2-button" href={url+'&download=1'} download><Download size={15}/>Download PDF</a></div><SopPdfPages url={url} title={title||'Job Description'}/></section>;
}
const sections:Step[]=[
 {label:'Role',caption:'Title, classification, and reporting line'},
 {label:'Duties',caption:'General summary and essential functions'},
 {label:'Work Setting',caption:'Physical demands and work environment'},
 {label:'Qualifications',caption:'Education, experience, knowledge, and skills'},
 {label:'Relationships',caption:'Organizational relationships and revision details'},
 {label:'Review',caption:'Review the document employees will receive'},
];
type EditorProps={initial:DescriptionFields;departments:DepartmentOption[];departmentId:string;people?:{name?:unknown;title?:unknown;status?:unknown}[];onCancel:()=>void;onSave:(content:DescriptionFields,departmentId:string,action:'save'|'publish')=>Promise<void>;context?:'library'|'vacancy';version?:number;referenceTemplate?:DescriptionFields};
function LineEditor({label,value,onChange,requiredDuty=false}:{label:string;value:string;onChange:(s:string)=>void;requiredDuty?:boolean}){
 const [rows,setRows]=useState<string[]>(()=>{const list=requiredDuty?dutyLines(value):value.split(/\r?\n/).filter(Boolean);return list.length?list:[''];});
 const inputs=useRef<(HTMLInputElement|null)[]>([]);
 function update(next:string[]){setRows(next);onChange(requiredDuty?[...next.filter(s=>s&&!isDefault(s)),duty].join('\n'):next.join('\n'));}
 return <fieldset className="hja-lines"><legend>{label}</legend><div>{rows.map((s,i)=><div className="hja-line" key={i}><span>{i+1}.</span><input ref={el=>{inputs.current[i]=el;}} aria-label={label+' '+(i+1)} value={s} onChange={e=>update(rows.map((v,j)=>i===j?e.target.value:v))} placeholder="Enter an item"/><button type="button" aria-label={'Remove '+label+' '+(i+1)} onClick={()=>update(rows.filter((_,j)=>i!==j))}><Trash2 size={15}/></button></div>)}</div>{requiredDuty&&<p className="hja-fixed"><LockKeyhole size={14}/>{duty}<small>Included in every role</small></p>}<button type="button" className="hja-text-action" onClick={()=>{update([...rows,'']);requestAnimationFrame(()=>inputs.current[rows.length]?.focus());}}><Plus size={15}/>Add {requiredDuty?'Duty':'Item'}</button></fieldset>;
}
export default function JobDescriptionEditor({initial,departments,departmentId:initialDept,people=[],onCancel,onSave,context='library',version,referenceTemplate}:EditorProps){
 const [content,setContent]=useState(()=>descriptionFields(initial)),[dept,setDept]=useState(initialDept),[step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [referenceApplied,setReferenceApplied]=useState(false),[customReporting,setCustomReporting]=useState(false);
 const heading=useRef<HTMLHeadingElement>(null),lock=useRef(false),opened=useRef(JSON.stringify(descriptionFields(initial)));
 const roleTitles=Array.from(new Set(people.filter(p=>p.status!=='Former').map(p=>String(p.title||'')).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
 function set(k:string,v:string){setError('');setContent(c=>({...c,[k]:v}));}
 function move(i:number){setStep(i);setError('');requestAnimationFrame(()=>heading.current?.focus());}
 function cancel(){if(!busy&&(JSON.stringify(content)===opened.current&&dept===initialDept||window.confirm('Leave this editor and discard unsaved changes?')))onCancel();}
 function lines(k:string,label:string,requiredDuty=false){return <LineEditor key={k} label={label} value={content[k]} onChange={v=>set(k,v)} requiredDuty={requiredDuty}/>;}
 const missing:{text:string;step:number}[]=[];
 if(!content.title.trim())missing.push({text:'Job Title',step:0});if(!dept)missing.push({text:'Department',step:0});if(!content.flsaStatus.trim())missing.push({text:'FLSA Status',step:0});if(!content.payBasis.trim())missing.push({text:'Pay Basis',step:0});if(!content.reportsTo.trim())missing.push({text:'Reports To',step:0});if(!content.summary.trim())missing.push({text:'General Summary',step:1});if(!dutyLines(content.essentialFunctions).length)missing.push({text:'A Role-Specific Duty',step:1});
 async function save(action:'save'|'publish'){if(lock.current)return;
  const first=action==='publish'?missing[0]:missing.find(f=>['Job Title','Department'].includes(f.text));if(first){move(first.step);setError('Add '+first.text+' before '+(action==='publish'?'publishing.':'saving a draft.'));return;}
  lock.current=true;setBusy(true);setError('');try{await onSave(descriptionFields(content),dept,action);}catch(e){setError((e as Error).message||'Could not save the job description.');}finally{lock.current=false;setBusy(false);}
 }
 const field=(k:string,label:string,hint?:string)=> <AuthorField label={label} hint={hint}><input value={content[k]} onChange={e=>set(k,e.target.value)}/></AuthorField>;
 const pick=(k:string,label:string,options:string[])=><AuthorField label={label}><select value={content[k]} onChange={e=>set(k,e.target.value)}><option value="">Select…</option>{Array.from(new Set([...options,content[k]].filter(Boolean))).sort().map(o=><option key={o}>{o}</option>)}</select></AuthorField>;
 return <section className="hja" aria-label="Job Description Editor"><header className="hja-head"><div><span className="hja-kicker"><FileText size={15}/>Job Description Builder</span><h2>{content.title.trim()||'New Job Description'}</h2></div><Button disabled={busy} onClick={cancel}><ArrowLeft size={15}/>{context==='vacancy'?'Back to Vacancy':'Back to Library'}</Button></header>
 <AuthorSteps steps={sections} step={step} onChange={move} label="Job Description Sections" disabled={busy}/>
 <div className="hja-sheet"><span className="hja-eyebrow">Section {step+1} of {sections.length}</span><h3 ref={heading} tabIndex={-1}>{sections[step].caption}</h3><fieldset className="hja-controls" disabled={busy}>
 {step===0&&referenceTemplate&&<div className="hja-reference"><FileText size={20}/><div><b>Director Job Description Reference</b><span>Use the supplied company document as a starting point. Review its duties and reporting lines for this role.</span></div><Button disabled={referenceApplied} onClick={()=>{
  if(JSON.stringify(content)!==opened.current&&!window.confirm('Replace your current section entries with the Director reference?'))return;
  setContent(descriptionFields({...referenceTemplate,title:initial.title||referenceTemplate.title,revisedBy:initial.revisedBy||'',revisedDate:initial.revisedDate||'',...(initial.flsaStatus?{flsaStatus:initial.flsaStatus}:{}),...(initial.payBasis?{payBasis:initial.payBasis}:{})}));setReferenceApplied(true);setError('');
 }}>{referenceApplied?'Reference Applied':'Use Director Reference'}</Button></div>}
 {step===0&&<div className="hja-grid">{field('title','Job Title')}<AuthorField label="Department"><select value={dept} onChange={e=>{setDept(e.target.value);setError('');}}><option value="">Select a department…</option>{[...departments].sort((a,b)=>a.name.localeCompare(b.name)).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></AuthorField>{pick('flsaStatus','FLSA Status',['Exempt','Nonexempt'])}<DescriptionPaySelector value={content.payBasis} onChange={s=>set('payBasis',s)}/><AuthorField label="Reports To"><select value={customReporting?'__custom':content.reportsTo} onChange={e=>{const v=e.target.value;setCustomReporting(v==='__custom');if(v!=='__custom')set('reportsTo',v);}}><option value="">Choose a reporting position…</option>{Array.from(new Set([...roleTitles,content.reportsTo].filter(Boolean))).sort((a,b)=>a.localeCompare(b)).map(v=><option key={v}>{v}</option>)}<option value="__custom">Enter Another Position…</option></select></AuthorField>{customReporting&&<AuthorField label="Reporting Position Title"><input autoFocus value={content.reportsTo} maxLength={250} onChange={e=>set('reportsTo',e.target.value)}/></AuthorField>}</div>}
 {step===1&&<div className="hja-stack"><AuthorField label="General Summary"><textarea rows={4} value={content.summary} onChange={e=>set('summary',e.target.value)} placeholder="What is this position responsible for?"/></AuthorField>{lines('essentialFunctions','Essential Functions',true)}</div>}
 {step===2&&<div className="hja-stack">{lines('physicalDemands','Physical Demands')}{lines('workEnvironment','Work Environment')}</div>}
 {step===3&&<div className="hja-stack">{lines('educationExperience','Education and Experience')}{lines('knowledgeSkills','Knowledge, Skills and Abilities')}</div>}
 {step===4&&<div className="hja-grid">{field('supervises','Supervises')}{field('collaboratesWith','Collaborates With')}{field('authorityLimits','Authority Limits')}{field('revisedBy','Current Version Revised By')}<AuthorField label="Date Written/Revised"><input type={/^\d{4}-\d\d-\d\d$/.test(content.revisedDate)||!content.revisedDate?'date':'text'} value={content.revisedDate} onChange={e=>set('revisedDate',e.target.value)}/></AuthorField></div>}
 </fieldset>
 {step===5&&<><div className={'hja-review-status'+(missing.length?' pending':'')}><CheckCircle2 size={17}/>{missing.length?'Before publishing:':'Ready to publish.'}{missing.length?missing.map(m=><button key={m.text} type="button" onClick={()=>move(m.step)}>{m.text}</button>):<span>New assignments can use this edition.</span>}</div><JobPdfPreview content={content} version={version}/></>}
 {error&&<p className="hr2-error" role="alert">{error}</p>}
 <footer className="hja-footer"><Button disabled={busy} onClick={()=>void save('save')}><Save size={15}/>{busy?'Saving…':'Save Draft'}</Button><div>{step>0&&<Button disabled={busy} onClick={()=>move(step-1)}>Back</Button>}{step<sections.length-1?<Button primary disabled={busy} onClick={()=>move(step+1)}>Continue <ArrowRight size={15}/></Button>:<Button primary disabled={busy} onClick={()=>void save('publish')}><Check size={15}/>{busy?'Saving…':'Publish Description'}</Button>}</div></footer>
 </div></section>;
}
