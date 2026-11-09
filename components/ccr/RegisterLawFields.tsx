'use client';
import {useState} from 'react';
import {BadgeCheck,Plus,Trash2} from 'lucide-react';
import {blankLawReference,lawKeys,type LawReference} from '@/lib/ccr/law-references';
const labels:Record<keyof LawReference,string>={agency:'Law Enforcement Agency',reportNumber:'Police Report Number',officer:'Officer Name',badge:'Badge Number'};
export function RegisterLawFields({rows,onChange}:{rows:LawReference[];onChange:(rows:LawReference[])=>void}){
 const [open,setOpen]=useState(false);
 return <section className="ccrr-formsection ccrr-law"><button className="ccrr-law-toggle" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}><BadgeCheck size={16}/><strong>Law Enforcement References</strong><span>{rows.length||'Optional'}</span><i aria-hidden="true">{open?'▾':'▸'}</i></button>
 {open&&<div>{rows.map((r,i)=><fieldset key={i}><legend>Reference {i+1}</legend><div className="ccrr-fields">{lawKeys.map(k=><label key={k}>{labels[k]}<input maxLength={k==='badge'?50:160} value={r[k]} onChange={e=>onChange(rows.map((p,n)=>n===i?{...p,[k]:e.target.value}:p))}/></label>)}</div><button className="ccrr-law-remove" type="button" onClick={()=>onChange(rows.filter((_,n)=>n!==i))}><Trash2 size={14}/>Remove Reference {i+1}</button></fieldset>)}
 {rows.length<12&&<button className="ccrr-button" type="button" onClick={()=>onChange([...rows,blankLawReference()])}><Plus size={14}/>Add Agency or Officer</button>}</div>}</section>;
}
export function RegisterLawReadout({rows}:{rows?:LawReference[]}){return rows?.length?<section className="ccrr-law-read"><h3><BadgeCheck size={16}/>Law Enforcement References</h3>{rows.map((r,i)=><dl key={i} className="ccrr-meta">{lawKeys.filter(k=>r[k]).map(k=><div key={k}><dt>{labels[k]}</dt><dd>{r[k]}</dd></div>)}</dl>)}</section>:null;}
