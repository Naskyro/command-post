'use client';
import {ArrowUpRight,CheckCircle2,Handshake,Scale} from 'lucide-react';
import {additionalOutcomes,outcomeLabels,primaryOutcomes,validOutcomeFilter,type OutcomeFilter,type courtOutcomeCounts} from '@/lib/ccr/court-outcomes';
import {directoryPath} from '@/lib/ccr/navigation';
import './court-outcomes.css';
const icons={won:CheckCircle2,lost:Scale,settled:Handshake};
const descriptions={won:'Rulings in favor of PTE',lost:'Rulings against PTE',settled:'Documented settlements'};
type Props={counts:ReturnType<typeof courtOutcomeCounts>|null;value?:OutcomeFilter;onSelect:(s:OutcomeFilter)=>void;compact?:boolean};
export default function CourtOutcomeDirectory({counts,value='all',onSelect,compact=false}:Props){
 const follow=(e:React.MouseEvent<HTMLAnchorElement>,s:OutcomeFilter)=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;e.preventDefault();onSelect(s)};
 return <section className={'court-results'+(compact?' court-results-compact':'')} aria-label="Court Outcomes"><header><div><h2>Court Outcomes</h2><p>Case results for Parking &amp; Towing Enforcement.</p></div><a className="court-results-all" href={directoryPath('hearings')} onClick={e=>follow(e,'all')} aria-current={!compact&&value==='all'?'page':undefined}>All Cases{counts&&<b>{counts.all}</b>}<ArrowUpRight size={13}/></a></header>
 <div className="court-result-tiles">{primaryOutcomes.map(s=>{const Icon=icons[s];return <a key={s} className={'court-result-tile crt-'+s} aria-current={!compact&&value===s?'page':undefined} href={directoryPath('hearings',s)} onClick={e=>follow(e,s)}><span className="court-result-name"><Icon size={17}/>{outcomeLabels[s]}</span><strong aria-label={counts?counts[s]+' cases':'Count unavailable'}>{counts?counts[s]:'—'}</strong><small>{descriptions[s]}</small></a>})}</div>
 {!compact&&<label className="court-results-other">More Case Groups <select aria-label="More Case Groups" value={(additionalOutcomes as readonly string[]).includes(value)?value:''} onChange={e=>onSelect(validOutcomeFilter(e.target.value))}><option value="">Select a Group…</option>{additionalOutcomes.map(s=><option key={s} value={s}>{outcomeLabels[s]}{counts?' ('+counts[s]+')':''}</option>)}</select></label>}</section>;
}
