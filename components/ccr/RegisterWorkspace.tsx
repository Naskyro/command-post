'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownUp,ArrowUp,CheckCircle2,Download,CalendarX2,ChevronRight,Filter,FolderOpen,ListFilter,LockKeyhole,Plus,RefreshCw,Search,Upload,X} from 'lucide-react';
import {registerConfig,type RegisterRecord,type RegisterSection} from '@/lib/ccr/register-model';
import {businessToday} from '@/lib/year-history/model';
import {requestJson} from '@/lib/shared/client';
import {auditDay} from '@/lib/shared/audit-format';
import ResponsiveSearchInput from '@/components/shared/ResponsiveSearchInput';
import {exportEvidenceIndex} from './register-download';
import RegisterEditor,{type EditorMode,type RegisterOwner} from './RegisterEditor';
import RegisterDetail,{RegisterGuide} from './RegisterDetail';
import RegisterCalendar from './RegisterCalendar';
import RecoveryDashboard from './RecoveryDashboard';
import {filterRecoveryRecords,recoveryFilterMeta,type RecoveryFilter} from '@/lib/ccr/recovery-dashboard';
import {chargebackFinancialSummary,chargebackRecoveryQueue,recoveryTotals} from '@/lib/ccr/chargeback';
import RegisterUploadPicker from './RegisterUploadPicker';
import {caseDue,directoryRows,registerCopy,type ListScope,type ListSort} from './register-copy';
import './register-workspace.css';
export type RegisterWorkspaceProps={tab:RegisterSection;initialId?:string;uploadOnOpen?:boolean;createOnOpen?:boolean;onChange?:()=>void};
type RegisterData={rows:RegisterRecord[];canEdit:boolean;canResolve:boolean;owners:RegisterOwner[]};
type EditState={mode:EditorMode;record?:RegisterRecord};
const recoveryResultsId='ccrr-recovery-results';
const formatMoney=(cents:number|null)=>cents===null?'Amount not recorded':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
function RecoveryListInfo({record,view}:{record:RegisterRecord;view:RecoveryFilter}){
 const c=record.chargeback;if(record.category!=='Chargeback'||!c)return null;
 const d=c.details,f=chargebackFinancialSummary(c,record.amountCents,record.status),queue=chargebackRecoveryQueue(c,record.amountCents,record.status),totals=recoveryTotals(c,record.amountCents);
 const stage=c.disposition==='Final Loss'?'Final loss':c.disposition==='Recovered'?'Recovered':queue?.stage|| (f.pendingBankReview?'Bank review':f.bankWinAwaitingCredit?'Verify bank credit':f.unverified?'Unverified':c.disposition);
 let amount=totals.remaining,label='Balance remaining';
 if(view==='Recovered'){amount=f.netRecoveryCents;label='Net recovery recorded';}
 else if(view==='Bank Losses'){amount=record.amountCents;label='Original bank loss';}
 else if(f.pendingBankReview){amount=record.amountCents;label='Under bank review';}
 else if(f.bankWinAwaitingCredit){amount=record.amountCents===null?null:Math.max(0,record.amountCents-f.postedProcessorCreditsCents);label='Credit to verify';}
 else if(f.unverified)label='Unverified balance';
 else if(f.finalLoss)label='Final loss';
 const processor=c.processor==='Other'?c.other:c.processor,card=d?.cardLast4?[d.cardBrand,'ending '+d.cardLast4].filter(Boolean).join(' '):'';
 return <span className="recovery-row-detail"><span className="recovery-row-facts">{[processor,card,d?.accountName||'Account not linked'].filter(Boolean).join(' · ')}</span><span className="recovery-row-state"><em>{stage}</em>{d?.stockNumber&&<em>Stock {d.stockNumber}</em>}</span><span className="recovery-row-next">{record.nextAction||queue?.reason||'Open the case to review its next action.'}</span><span className="recovery-row-money"><span>{label}</span><b>{formatMoney(amount)}</b></span></span>;
}
export default function RegisterWorkspace(props:RegisterWorkspaceProps){return <RegisterPage key={props.tab+'|'+String(props.initialId||'')+'|'+String(!!props.createOnOpen)+'|'+String(!!props.uploadOnOpen)} {...props}/>;}
function RegisterPage({tab,initialId,createOnOpen,uploadOnOpen,onChange}:RegisterWorkspaceProps){
 const [data,setData]=useState<RegisterData|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState(''),[exporting,setExporting]=useState(false),[query,setQuery]=useState(''),[scope,setScope]=useState<ListScope>('All Records'),[category,setCategory]=useState(''),[filters,setFilters]=useState(false),[sort,setSort]=useState<ListSort>('Due Date'),[chosen,setChosen]=useState(initialId||''),[detailOpen,setOpen]=useState(!!initialId),[date,setDate]=useState(''),[editor,setEditor]=useState<EditState|null>(null);const launched=useRef(false),epoch=useRef(0),region=useRef<HTMLElement>(null);
 const [uploadPicker,setUploadPicker]=useState(false),[uploadTarget,setUploadTarget]=useState({id:'',serial:0}),needsDocumentAfterCreate=useRef(false);
 const [recoveryFilter,setRecoveryFilter]=useState<RecoveryFilter>('All');
 const [viewNavigation,setViewNavigation]=useState(0),resultsHeading=useRef<HTMLHeadingElement>(null);
 const copy=registerCopy[tab],cfg=registerConfig[tab],Icon=copy.icon,today=businessToday();
 const refresh=useCallback(async()=>{const turn=++epoch.current;setLoading(true);setLoadError('');try{const newData=await requestJson<RegisterData>('/api/ccr/register?section='+tab);if(turn!==epoch.current)return;setData(newData);
  if(!launched.current){launched.current=true;const target=initialId&&newData.rows.find(r=>r.id===initialId);
   if(initialId&&!target){setNotice('The requested record is unavailable in this register.');setChosen('');setOpen(false);}
   else if(uploadOnOpen&&newData.canEdit){if(target){setChosen(target.id);setOpen(true);setUploadTarget(t=>({id:target.id,serial:t.serial+1}));}else setUploadPicker(true);}
   else if(createOnOpen&&newData.canEdit)setEditor({mode:'new'});
  }
 }catch(e){if(turn===epoch.current){setData(null);setEditor(null);setLoadError((e as Error).message);}}finally{if(turn===epoch.current)setLoading(false);}},[tab,initialId,createOnOpen,uploadOnOpen]);
 useEffect(()=>{void refresh();return()=>{++epoch.current;};},[refresh]);
 useEffect(()=>{if(!viewNavigation)return;const heading=resultsHeading.current;if(!heading)return;heading.focus({preventScroll:true});heading.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});},[viewNavigation]);
 const viewRows=useMemo(()=>tab==='recovery'?filterRecoveryRecords(data?.rows||[],recoveryFilter):data?.rows||[],[data,tab,recoveryFilter]);
 const selectedRows=useMemo(()=>directoryRows(viewRows,query,scope,category,sort,today),[viewRows,query,scope,category,sort,today]),rows=date?selectedRows.filter(r=>r.dueOn===date&&r.status!=='Closed'):selectedRows,selected=rows.find(r=>r.id===chosen)||rows[0],secondaryFiltered=!!query||scope!=='All Records'||!!category||!!date,filtered=secondaryFiltered||recoveryFilter!=='All',extra=Number(!!category)+Number(scope!=='All Records');
 async function downloadIndex(){if(exporting||!rows.length)return;setExporting(true);setNotice('');try{await exportEvidenceIndex(rows.map(r=>r.id));setNotice('The confidential evidence index was downloaded.');}catch(e){setNotice((e as Error).message);}finally{setExporting(false);}}
 function reset(){setQuery('');setCategory('');setScope('All Records');setDate('');setRecoveryFilter('All');setOpen(false);}
 function showRecoveryView(filter:RecoveryFilter){reset();setFilters(false);setChosen('');setRecoveryFilter(filter);setNotice('');setViewNavigation(v=>v+1);}
 function showRecoveryCase(record:RegisterRecord){reset();pick(record);setViewNavigation(v=>v+1);}
 function showRecoveryOverview(){const heading=region.current?.querySelector<HTMLElement>('.recovery-dashboard-heading h2');heading?.focus({preventScroll:true});heading?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
 function newRecord(){if(data?.canEdit)setEditor({mode:'new'});}
 function store(r:RegisterRecord){setData(old=>old?{...old,rows:[r,...old.rows.filter(x=>x.id!==r.id)]}:old);setChosen(r.id);onChange?.();}
 function save(r:RegisterRecord){store(r);reset();setOpen(true);setEditor(null);if(needsDocumentAfterCreate.current){needsDocumentAfterCreate.current=false;setUploadTarget(t=>({id:r.id,serial:t.serial+1}));setNotice('Record saved. Choose the document type and file below.');}else setNotice('Record saved.');}
 function uploadTo(r:RegisterRecord){reset();setUploadPicker(false);setChosen(r.id);setOpen(true);setUploadTarget(t=>({id:r.id,serial:t.serial+1}));setNotice('');}
 function pick(r:RegisterRecord){setChosen(r.id);setOpen(true);setNotice('');if(tab==='recovery'&&region.current&&region.current.clientWidth<=530)setViewNavigation(v=>v+1);}
 const total=data?.rows.length||0,overdue=(tab==='recovery'?directoryRows(viewRows,query,'All Records',category,sort,today):data?.rows||[]).filter(r=>r.status!=='Closed'&&caseDue(r)&&caseDue(r)<=today).length;
 return <section ref={region} className={'ccrr-space'+(tab==='recovery'?' ccrr-recovery':'')+(detailOpen?' ccrr-showdetail':'')} aria-label={copy.title+' Workspace'}>
 <div className="ccrr-sectionhead"><div><span className="ccrr-overline"><i/> Compliance, Claims & Recovery</span><h1>{copy.title}</h1></div><div className="ccrr-headtools"><button className="ccrr-iconbutton" disabled={loading} title="Refresh Records" aria-label={'Refresh '+copy.title} onClick={()=>void refresh()}><RefreshCw size={16}/></button>{tab==='evidence'&&!!data&&<button type="button" className="ccrr-button" disabled={exporting||!rows.length} title="Export Confidential CSV of the Filtered Records" onClick={()=>void downloadIndex()}><Download size={15}/>{exporting?'Exporting…':'Export Evidence Index'}</button>}{data?.canEdit&&<button className="ccrr-button" type="button" onClick={()=>setUploadPicker(true)}><Upload size={15}/> Upload Document</button>}{data?.canEdit&&<button className="ccrr-primary" type="button" onClick={newRecord}><Plus size={16}/> New {copy.singular}</button>}</div></div>
 {loadError?<div className="ccrr-problem" role="alert"><LockKeyhole size={22}/><div><strong>Register Unavailable</strong><p>{loadError}</p></div><button className="ccrr-button" onClick={()=>void refresh()}>Retry</button></div>:!data?<div className="ccrr-wait" role="status">Loading {copy.directory.toLowerCase()}…</div>:<>
 {notice&&<p className="ccrr-notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss Message" title="Dismiss Message"><X size={14}/></button></p>}
 {tab==='calendar'&&<RegisterCalendar rows={data.rows} today={today} chosen={date} onPick={d=>{reset();setDate(d);}}/>}
 {tab==='recovery'&&<RecoveryDashboard rows={data.rows} today={today} filter={recoveryFilter} onFilter={showRecoveryView} onPick={showRecoveryCase} resultsId={recoveryResultsId}/>}
 <div id={tab==='recovery'?recoveryResultsId:undefined} className={tab==='recovery'?'recovery-results':undefined} role={tab==='recovery'?'region':undefined} aria-label={tab==='recovery'?'Recovery case results':undefined}>
 {tab==='recovery'&&<header className="recovery-results-header"><div><span className="recovery-results-label"><ListFilter size={13} aria-hidden="true"/> Selected view</span><h2 ref={resultsHeading} tabIndex={-1}>{recoveryFilterMeta[recoveryFilter].label}<span>{rows.length}</span></h2><p>{recoveryFilterMeta[recoveryFilter].description}{secondaryFiltered?' Showing '+rows.length+' of '+viewRows.length+' cases in this view.':''}</p></div><div className="recovery-results-tools">{filtered&&<button className="ccrr-button" type="button" onClick={()=>showRecoveryView('All')}><X size={13}/>All cases</button>}<button className="ccrr-button" type="button" onClick={showRecoveryOverview}><ArrowUp size={13}/>Overview & queues</button></div></header>}
 <div className="ccrr-columns"><aside className="ccrr-directory" aria-label={copy.directory}><header><div className="ccrr-dirheading"><Icon size={19}/><h2>{copy.directory}</h2><span>{tab==='recovery'?rows.length:total}</span></div><div className="ccrr-searchrow"><label className="ccrr-search"><Search size={16}/><ResponsiveSearchInput type="search" placeholder={tab==='recovery'?'Search Name, Vehicle, Card, or Reference':'Search Titles, Owners, or References'} compactPlaceholder="Search Records" value={query} onChange={e=>{setQuery(e.target.value);setOpen(false);}} aria-label={'Search '+copy.directory}/></label><button className="ccrr-iconbutton" type="button" aria-label="Filter Records" title="Filter Records" aria-expanded={filters} aria-controls={'ccrr-filters-'+tab} onClick={()=>setFilters(!filters)} data-on={filters||extra||undefined}><Filter size={16}/>{!!extra&&<b>{extra}</b>}</button></div>
 {filters&&<div className="ccrr-filterform" id={'ccrr-filters-'+tab}><label>Show<select value={scope} onChange={e=>{setScope(e.target.value as ListScope);setOpen(false);}}>{['All Records','Open','Due or Overdue','Closed'].map(s=><option key={s}>{s}</option>)}</select></label><label>Category<select value={category} onChange={e=>{setCategory(e.target.value);setOpen(false);}}><option value="">All Categories</option>{[...cfg.categories].sort().map(c=><option key={c}>{c}</option>)}</select></label><label>Sort By<select value={sort} onChange={e=>setSort(e.target.value as ListSort)}>{['Due Date','Last Updated','Title'].map(s=><option key={s}>{s}</option>)}</select></label>{filtered&&<button type="button" className="ccrr-link" onClick={reset}>Clear Filters</button>}</div>}</header>
 <div className="ccrr-count"><span aria-live="polite">{rows.length} {rows.length===1?'Record':'Records'}</span><span><ArrowDownUp size={12}/>{sort}</span></div>
 {!!overdue&&<button className={'ccrr-duefilter'+(scope==='Due or Overdue'?' on':'')} aria-pressed={scope==='Due or Overdue'} onClick={()=>{setScope(scope==='Due or Overdue'?'All Records':'Due or Overdue');setDate('');setOpen(false);}}><CalendarX2 size={14}/>{overdue} Due or Overdue</button>}
 {rows.length?<div className="ccrr-rowlist">{rows.map(r=><button type="button" className="ccrr-row" key={r.id} aria-pressed={selected?.id===r.id} onClick={()=>pick(r)}><span className="ccrr-rowicon"><Icon size={17}/></span><span><strong>{r.title}</strong><small>{r.category}{r.ownerName?' · '+r.ownerName:''}</small><span className="ccrr-rowmeta"><i/>{r.status}{caseDue(r)&&<><b>·</b>{auditDay(caseDue(r))}</>}</span>{tab==='recovery'&&<RecoveryListInfo record={r} view={recoveryFilter}/>}</span><ChevronRight size={14}/></button>)}</div>:<div className="ccrr-empty"><FolderOpen size={25}/><strong>{filtered?'No Matching Records':'No Records Yet'}</strong><p>{tab==='recovery'&&recoveryFilter!=='All'&&!secondaryFiltered?'No cases are currently in this view.':filtered?'Adjust your search or filters.':'No records have been added to '+copy.title+'.'}</p>{filtered&&<button className="ccrr-link" onClick={tab==='recovery'?()=>showRecoveryView('All'):reset}>{tab==='recovery'?'View all cases':'Clear Filters'}</button>}</div>}</aside>
 {selected?<RegisterDetail key={selected.id+'|'+(uploadTarget.id===selected.id?uploadTarget.serial:0)} initialUpload={uploadTarget.id===selected.id} record={selected} canEdit={data.canEdit} canEditFields={data.canEdit&&(selected.status!=='Closed'||data.canResolve)} today={today} onBack={()=>{setOpen(false);if(tab==='recovery')setViewNavigation(v=>v+1);}} onEditor={mode=>setEditor({mode,record:selected})} onFile={r=>{store(r);setNotice('Evidence uploaded.');}}/>:tab==='recovery'&&filtered?<div className="recovery-empty-detail"><span><CheckCircle2 size={25} aria-hidden="true"/></span><h3>{secondaryFiltered?'No matching cases':'No cases in this view'}</h3><p>{secondaryFiltered?'Try a different search or clear the filters to see the other recovery cases.':'There are no cases in '+recoveryFilterMeta[recoveryFilter].label.toLowerCase()+'. Choose another view to continue working.'}</p><button className="ccrr-button" type="button" onClick={()=>showRecoveryView('All')}>View all cases</button></div>:<RegisterGuide tab={tab} canEdit={data.canEdit} onCreate={newRecord}/>}</div>
 </div>
 {uploadPicker&&data.canEdit&&<RegisterUploadPicker section={tab} rows={data.rows} onPick={uploadTo} onClose={()=>setUploadPicker(false)} onNew={()=>{setUploadPicker(false);needsDocumentAfterCreate.current=true;newRecord();}}/>}
 {editor&&<RegisterEditor key={editor.mode+(editor.record?.id||'')} mode={editor.mode} record={editor.record} section={tab} owners={data.owners} canResolve={data.canResolve} onSaved={save} onClose={()=>{needsDocumentAfterCreate.current=false;setEditor(null);}}/>}</>}
 </section>;
}
