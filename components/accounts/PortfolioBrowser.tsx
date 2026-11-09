'use client';
import {useState} from 'react';
import {ArrowLeft,ArrowUpRight,Building2,CalendarClock,ChevronRight,ContactRound,ListChecks,MapPin,Phone,ShieldCheck} from 'lucide-react';
import {current,lastContact,type Row} from '@/lib/accounts/model';
import {hasDetail,phoneLink} from '@/lib/accounts/display';
import {profilePhoto} from '@/lib/accounts/contact-details';
import {actionDate,isFinished} from '@/lib/accounts/work';
import {auditDay} from '@/lib/shared/audit-format';
const text=(v:unknown)=>hasDetail(v)?String(v):'';
type Props={all:Row[];rows:Row[];total:number;staff:{id:string;name:string}[];onOpen:(id:string)=>void;onCompany:(id:string)=>void;canView:(area:string)=>boolean;onContact?:(id:string)=>void;page:number;onPage:(p:number)=>void};
export default function PortfolioBrowser({all,rows,total,staff,onOpen,onCompany,canView,onContact,page,onPage}:Props){
 const [selected,setSelected]=useState(''),[show,setShow]=useState(false);
 const account=rows.find(r=>r.id===selected)||rows[0],lookup=(id:unknown)=>all.find(r=>r.id===id),picture=account&&profilePhoto(all,account);
 const assignee=staff.find(s=>s.id===account?.assignee)?.name,company=lookup(account?.companyId),people=account?all.filter(a=>a.kind==='affiliation'&&a.accountId===account.id&&current(a)):[],
 manager=people.find(a=>String(a.role).toLowerCase()==='property manager'),contact=lookup(manager?.contactId||account?.primaryContactId),
 tasks=account&&canView('work')?all.filter(r=>r.kind==='task'&&r.accountId===account.id&&!isFinished(r)).sort((a,b)=>(actionDate(a)||'9999').localeCompare(actionDate(b)||'9999')||a.name.localeCompare(b.name)):[],
 officePhone=(canView('relationships')?manager?.workPhone:'')||account?.phone,call=phoneLink(officePhone),last=account&&canView('activity')?lastContact(all,account.id):'';
 if(!account)return <section className="ap-no-results"><Building2 size={27}/><strong>No Matching Properties</strong><span>Try another property name or clear a filter.</span></section>;
 return <div className={'ap-browse'+(show?' ap-show-record':'')}><aside className="ap-rail" aria-label="Property Directory"><div className="ap-rail-label"><Building2 size={16}/><b>Property Directory</b><span>{total}</span></div><div className="ap-rail-meta"><span>Properties</span><span>Name A–Z</span></div>
 <div className="ap-rail-items">{rows.map(a=>{const p=profilePhoto(all,a);return <button key={a.id} type="button" aria-pressed={account.id===a.id} onClick={()=>{setSelected(a.id);setShow(true);}}><span className="ap-thumb">{p?<img src={p} alt="" loading="lazy"/>:<Building2 size={19}/>}</span><span><strong>{a.name}</strong><small>{text(a.service)||text(a.propertyType)||text(a.address)}</small></span><ChevronRight size={14}/></button>;})}</div>
 {total>20&&<div className="ap-page"><button type="button" disabled={page<=0} onClick={()=>onPage(page-1)}>Previous</button><span>{page+1} / {Math.ceil(total/20)}</span><button type="button" disabled={(page+1)*20>=total} onClick={()=>onPage(page+1)}>Next</button></div>}</aside>
 <article className="ap-selection" aria-label={'Property Summary: '+account.name}><button type="button" className="ap-mobile-back" onClick={()=>setShow(false)}><ArrowLeft size={15}/> Property Directory</button><header className="ap-property-hero">
 <span className="ap-property-image">{picture?<img src={picture} alt={account.name+' exterior'}/>:<Building2 size={38}/>}</span><div className="ap-hero-copy"><span className="ap-kicker">PROPERTY PROFILE</span><h2>{account.name}</h2>{text(account.address)&&<p><MapPin size={14}/>{String(account.address)}</p>}<div className="ap-hero-tags">{[account.status,account.service].map(text).filter(Boolean).map((v,i)=><span key={i}>{v}</span>)}</div></div></header>
 <div className="ap-action-band"><span>{text(account.propertyType)||'Property Account'}</span><button type="button" onClick={()=>onOpen(account.id)}>Open Property Profile <ArrowUpRight size={15}/></button></div>
 <section className="ap-summary-section"><div className="ap-section-title"><ContactRound/><h3>Account Team</h3></div><dl className="ap-facts">
 {canView('relationships')&&contact&&<div><dt>{manager?'Property Manager':'Primary Contact'}</dt><dd>{onContact?<button type="button" onClick={()=>onContact(contact.id)}>{contact.name}<ArrowUpRight size={13}/></button>:contact.name}</dd></div>}
 {company&&<div><dt>Management Company</dt><dd>{canView('relationships')?<button type="button" onClick={()=>onCompany(company.id)}>{company.name}<ArrowUpRight size={13}/></button>:company.name}</dd></div>}
 {assignee&&<div><dt>Account Manager</dt><dd>{assignee}</dd></div>}{call&&<div><dt>Office Phone</dt><dd><a href={call}><Phone size={13}/>{String(officePhone)}</a></dd></div>}
 {!assignee&&!company&&!call&&(!contact||!canView('relationships'))&&<div><dd>No account team recorded.</dd></div>}
 </dl></section>
 {(canView('work')||canView('activity'))&&<section className="ap-summary-section"><div className="ap-section-title"><CalendarClock/><h3>Follow-Up</h3></div>{tasks[0]?<div className="ap-next"><ListChecks size={21}/><div><span>Next Open Task</span><strong>{tasks[0].name}</strong><small>{actionDate(tasks[0])?auditDay(actionDate(tasks[0])):'Not Scheduled'}</small></div></div>:canView('work')?<p className="ap-muted">No open follow-up tasks for this property.</p>:null}{last&&<p className="ap-last"><ShieldCheck size={14}/> Last Contact <b>{auditDay(last)}</b></p>}</section>}
 </article></div>;
}
