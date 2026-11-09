'use client';
import {ccrArchiveTarget} from '@/lib/year-history/register-events';
import ResponsiveSearchInput from '@/components/shared/ResponsiveSearchInput';

import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Download, Filter, Search, Upload } from 'lucide-react';
import { auditStamp } from '@/lib/shared/audit-format';
import './year-archive.css';

type ArchiveModule = 'Finance' | 'Compliance, Claims & Recovery' | 'Work Orders' | 'Account Management';
type View = 'activity' | 'archive' | 'open-at-close' | 'undated';
type YearEntry = {
  id: string; module: string; kind: string; title: string; status: string; activityDate?: string;
  openedDate?: string; closedDate?: string; terminal: boolean; amountCents?: number; property?: string; category?: string;
};
type Result = {
  years: number[]; year: number; closed: boolean; asOf?: string; basis?: string; view: string; kinds: string[];
  items: YearEntry[]; total: number; page: number; pageSize: number;
  metrics: {label: string; value: number; format?: 'number'|'usd'}[]; undated: number;
};
const tabs: [View,string][] = [['activity','Year Activity'],['archive','Archived Records'],['open-at-close','Open at Year-End']];
const dollars = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
const numbers = new Intl.NumberFormat('en-US');
const currentAustinYear = () => Number(new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'America/Chicago'}).format(new Date()));
const words = (value: string) => value.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[-_]+/g,' ').replace(/^\w/,s=>s.toUpperCase());
const date = (value?: string) => value ? auditStamp(value) || '—' : '—';
const viewLabel = (view: View) => view==='undated'?'Undated Records':tabs.find(([key])=>key===view)?.[1];

export default function YearArchive({module,onReturnToWork,onOpenRecord,canAttachToRecord,onAttachToRecord}:{module:ArchiveModule;onReturnToWork:()=>void;onOpenRecord?:(tab:string,id:string)=>void;canAttachToRecord?:(tab:string)=>boolean;onAttachToRecord?:(tab:string,id:string)=>void}) {
  const [year,setYear] = useState(currentAustinYear);
  const [view,setView] = useState<View>('activity');
  const [kind,setKind] = useState(''), [rawSearch,setRawSearch] = useState(''), [query,setQuery] = useState('');
  const [filters,setFilters] = useState(false), [page,setPage] = useState(1), [refresh,setRefresh] = useState(0);
  const [yearChoices,setYearChoices] = useState<number[]>([currentAustinYear()]);
  const [kindChoices,setKindChoices] = useState<string[]>([]);
  const [response,setResponse] = useState<{key:string;result?:Result;error?:string}|null>(null);
  const [exporting,setExporting] = useState(false),[exportError,setExportError] = useState('');
  const exportPending = useRef(false);
  const search = new URLSearchParams({module,year:String(year),view});
  if(kind)search.set('kind',kind);
  if(query)search.set('q',query);
  const slice = search.toString(), key = slice + '&page=' + page;
  const data = response?.key===key ? response.result : undefined;
  function uploadTarget(id:string){const dest=module==='Compliance, Claims & Recovery'&&onAttachToRecord?ccrArchiveTarget(id):null;return dest&&canAttachToRecord?.(dest.tab)?dest:null;}
  const allowUploads=data?.items.some(i=>!!uploadTarget(i.id));
  const error = response?.key===key ? response.error : undefined;

  useEffect(()=>{const timer=window.setTimeout(()=>{setQuery(rawSearch.trim());setPage(1);},280);return()=>window.clearTimeout(timer);},[rawSearch]);
  useEffect(()=>{
    let live=true;
    const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),20000);
    setExportError('');
    void fetch('/api/year-history?'+key,{cache:'no-store',signal:controller.signal})
      .then(async res=>{
        const body=await res.json() as Result&{error?:string};
        if(!res.ok)throw new Error(body.error||'Year history is unavailable.');
        if(!Array.isArray(body.items)||!Array.isArray(body.years)||!Array.isArray(body.metrics)||!Array.isArray(body.kinds))throw new Error('The year history response was incomplete.');
        if(!live)return;
        setResponse({key,result:body});
        setYearChoices([...new Set([year,...body.years])].sort((a,b)=>b-a));
        setKindChoices([...new Set([...(kind?[kind]:[]),...body.kinds])].sort((a,b)=>words(a).localeCompare(words(b))));
      }).catch(e=>{if(live)setResponse({key,error:e.name==='AbortError'?'Loading year history timed out. Try again.':e.message||'Could not load year history.'});})
      .finally(()=>window.clearTimeout(timer));
    return()=>{live=false;controller.abort();window.clearTimeout(timer);};
  },[key,refresh,year,kind]);

  const selectView=(value:View)=>{setPage(1);setView(value);};
  const clearFilters=()=>{setRawSearch('');setQuery('');setPage(1);setKind('');};
  async function exportCsv(){
    if(exportPending.current||!data?.total)return;
    exportPending.current=true;setExporting(true);setExportError('');
    const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),30000);
    try{
      const res=await fetch('/api/year-history?'+slice+'&format=csv',{cache:'no-store',signal:controller.signal});
      if(!res.ok||!res.headers.get('content-type')?.toLowerCase().includes('text/csv')){
        let message='Could not export these records.';try{const body=await res.json() as {error?:string};message=body.error||message;}catch{}
        throw new Error(message);
      }
      const file=URL.createObjectURL(await res.blob()),link=document.createElement('a');
      link.href=file;link.download='Command-'+module.replace(/[^a-z0-9]+/gi,'-')+'-'+(view==='undated'?'Undated':year)+'-'+view+'.csv';
      document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(file),1500);
    }catch(e){setExportError(e instanceof Error&&e.name==='AbortError'?'The export timed out. Narrow the filters and try again.':e instanceof Error?e.message:'Could not export.');}
    finally{window.clearTimeout(timer);exportPending.current=false;setExporting(false);}
  }
  const prior = year<currentAustinYear();
  const basis = view==='activity'?'Records with activity in the selected calendar year, using Austin time.'
    :view==='archive'?'Completed records assigned to the selected year’s archive. Unfinished work stays in its active queue.'
    :view==='undated'?'These records are not assigned to a year because a reliable date is missing. Open the original record to correct its dates.'
    :'Records opened by December 31 that had not closed by that date. A record may have closed since then.';
  const pages=data?Math.max(1,Math.ceil(data.total/Math.max(1,data.pageSize))):1;
  const hasAmount=Boolean(data?.items.some(item=>typeof item.amountCents==='number'));
  const hasProperty=Boolean(data?.items.some(item=>Boolean(item.property)));
  const hasOpened=Boolean(data?.items.some(item=>Boolean(item.openedDate)));
  const hasClosed=Boolean(data?.items.some(item=>Boolean(item.closedDate)));
  const hasKind = Boolean(kind);
  const waitingForSearch = rawSearch.trim()!==query;

  return <section className="yr-history" aria-label={module+' Archive and Year in Review'}>
    <header className="yr-hero"><div className="yr-hero-title"><span className="yr-icon"><Archive size={23} aria-hidden="true"/></span><div><small>{module}</small><h2>Archive &amp; Year in Review</h2></div></div>
      <button type="button" className="yr-back" onClick={onReturnToWork}><ArrowLeft size={15} aria-hidden="true"/>Back to Active Work</button></header>
    <div className="yr-scope"><label><CalendarDays size={16} aria-hidden="true"/> Calendar Year <select value={year} onChange={e=>{setYear(Number(e.target.value));setPage(1);if(view==='undated')setView('activity');}}>{yearChoices.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
      <div role="group" aria-label="Year History View" className="yr-views">{tabs.map(([id,label])=><button key={id} type="button" aria-pressed={view===id} onClick={()=>selectView(id)}>{label}</button>)}</div></div>
    <div className="yr-period"><h3>{view==='undated'?'Undated Records':year+' · '+viewLabel(view)}</h3>
      <p>{data?.basis || basis}</p>{data?.asOf&&view!=='undated'&&<small>As of {date(data.asOf)} · Austin time</small>}{data&&!data.closed&&view!=='undated'&&(view==='activity'?<small>Year in progress · figures can change as records are entered.</small>:<small>This calendar year has not closed; there is no completed year-end snapshot yet.</small>)}</div>
    {data&&view!=='undated'&&data.metrics.length>0&&<dl className="yr-metrics">{data.metrics.map((m,i)=><div key={m.label+i}><dt>{m.label}</dt><dd>{m.format==='usd'?dollars.format(m.value):numbers.format(m.value)}</dd></div>)}</dl>}
    <div className="yr-toolbar"><label className="yr-search"><Search size={17} aria-hidden="true"/><ResponsiveSearchInput type="search" value={rawSearch} onChange={e=>setRawSearch(e.target.value)} aria-label="Search Year History" placeholder="Search records, properties, or status"/></label>
      <button type="button" className="yr-button" aria-expanded={filters} onClick={()=>setFilters(!filters)}><Filter size={15} aria-hidden="true"/>Filters{hasKind?' (1)':''}</button>
      <button type="button" className="yr-button" disabled={exporting||!data?.total||waitingForSearch} onClick={exportCsv}><Download size={15} aria-hidden="true"/>{exporting?'Exporting…':'Export CSV'}</button>
    </div>
    {filters&&<div className="yr-filters"><label>Record Type<select aria-label="Filter by Record Type" value={kind} onChange={e=>{setKind(e.target.value);setPage(1);}}><option value="">All Record Types</option>{kindChoices.map(k=><option key={k} value={k}>{words(k)}</option>)}</select></label>
      {(hasKind||rawSearch)&&<button type="button" className="yr-link" onClick={clearFilters}>Clear Filters</button>}</div>}
    {!filters&&hasKind&&<button type="button" className="yr-filter-chip" aria-label={'Remove '+words(kind)+' filter'} onClick={()=>{setKind('');setPage(1);}}>{words(kind)} ×</button>}
    {data&&data.undated>0&&view!=='undated'&&<button type="button" className="yr-link yr-undated" onClick={()=>selectView('undated')}>Review Undated Records ({numbers.format(data.undated)})<ChevronRight size={14} aria-hidden="true"/></button>}
    {exportError&&<p className="yr-error" role="alert">{exportError}</p>}
    {error?<div className="yr-empty" role="alert"><p>{error}</p><button type="button" className="yr-button" onClick={()=>{setResponse(null);setRefresh(v=>v+1);}}>Try Again</button></div>
      :!data?<p role="status" className="yr-empty">Loading year history…</p>
      :!data.items.length?<div className="yr-empty"><Archive size={22} aria-hidden="true"/><strong>{kind||query?'No matching records':view==='undated'?'No undated records':view!=='activity'&&!data.closed?'No year-end records yet':'No records for this view'}</strong><p>{kind||query?'Try another search or clear your filters.':view==='undated'?'All accessible records have dates.':view!=='activity'&&!data.closed?'Select Year Activity to see work recorded so far.':prior?'Choose another year or record type.':'Activity appears here when dated records are available.'}</p>
        {(kind||query)&&<button type="button" className="yr-link" onClick={clearFilters}>Clear Filters</button>}{view!=='activity'&&!data.closed&&<button type="button" className="yr-link" onClick={()=>selectView('activity')}>View Year Activity</button>}</div>
      :<><div className="yr-table" role="region" aria-label={viewLabel(view)+' Records'} tabIndex={0}><table><thead><tr><th scope="col">Record</th><th scope="col">Type</th>{hasProperty&&<th scope="col">Property</th>}<th scope="col">Recorded Status</th>{hasOpened&&<th scope="col">Opened</th>}<th scope="col">Latest Activity</th>{hasClosed&&<th scope="col">Closed</th>}{hasAmount&&<th scope="col" className="yr-money">Amount</th>}{allowUploads&&<th scope="col">Documents</th>}</tr></thead>
        <tbody>{data.items.map((item,i)=><tr key={[item.id,item.kind,i].join(':')}><td>{module==='Compliance, Claims & Recovery'&&onOpenRecord&&ccrArchiveTarget(item.id)?<button className="yr-open-record" type="button" onClick={()=>{const target=ccrArchiveTarget(item.id);if(target)onOpenRecord(target.tab,target.id);}}>{item.title||item.id}</button>:<strong>{item.title||item.id}</strong>}{item.category&&!item.category.startsWith('register-')&&<small>{item.category}</small>}</td><td>{words(item.kind)}</td>{hasProperty&&<td>{item.property||'—'}</td>}<td>{item.status||'—'}</td>{hasOpened&&<td className="yr-date">{date(item.openedDate)}</td>}<td className="yr-date">{date(item.activityDate)}</td>{hasClosed&&<td className="yr-date">{date(item.closedDate)}</td>}{hasAmount&&<td className="yr-money">{typeof item.amountCents==='number'?dollars.format(item.amountCents/100):'—'}</td>}{allowUploads&&<td>{uploadTarget(item.id)&&<button className="ccru-archive-upload" type="button" aria-label={'Upload Document to '+item.title} onClick={()=>{const dest=uploadTarget(item.id);if(dest)onAttachToRecord?.(dest.tab,dest.id);}}><Upload size={13}/>Upload Document</button>}</td>}</tr>)}</tbody></table></div>
      <footer className="yr-pagination"><span aria-live="polite">{numbers.format(data.total)} {data.total===1?'record':'records'} · Page {data.page} of {pages}</span><div><button aria-label="Previous Page" type="button" onClick={()=>setPage(Math.max(1,data.page-1))} disabled={data.page<=1}><ChevronLeft size={16}/></button><button aria-label="Next Page" type="button" onClick={()=>setPage(data.page+1)} disabled={data.page>=pages}><ChevronRight size={16}/></button></div></footer></>}
  </section>;
}
