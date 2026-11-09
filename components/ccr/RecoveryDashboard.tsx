'use client';
import {useId,useMemo} from 'react';
import {ArrowRight,ArrowUpRight,Banknote,CalendarClock,Check,ChevronRight,CircleHelp,FileSearch,FolderCheck,HandCoins,Inbox,Layers3,Mail,Scale,Send,ShieldQuestion,TrendingDown,type LucideIcon} from 'lucide-react';
import type {RegisterRecord} from '@/lib/ccr/register-model';
import {recoveryDashboardStats,type RecoveryFilter,type RecoveryMetric,type RecoveryQueueFilter} from '@/lib/ccr/recovery-dashboard';
import {recoveryTimeZones} from '@/lib/ccr/recovery-activity';
import {auditDay} from '@/lib/shared/audit-format';
import './recovery-dashboard.css';

export type RecoveryDashboardProps={rows:RegisterRecord[];today:string;filter:RecoveryFilter;onFilter:(filter:RecoveryFilter)=>void;onPick:(record:RegisterRecord)=>void;resultsId:string};
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const cases=(count:number)=>count+' '+(count===1?'case':'cases');
function clock(time:string){const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);if(!match)return 'Time not recorded';const hour=Number(match[1]);return (hour%12||12)+':'+match[2]+(hour>=12?' PM':' AM');}
function zone(value:string){return recoveryTimeZones[value as keyof typeof recoveryTimeZones]||value||'Time zone not recorded';}

type MetricProps={title:string;value:RecoveryMetric;description:string;icon:LucideIcon;view:RecoveryFilter;selected:boolean;onFilter:(filter:RecoveryFilter)=>void;resultsId:string;tone?:'featured'|'positive';compact?:boolean};
function Metric({title,value,description,icon:Icon,view,selected,onFilter,resultsId,tone,compact=false}:MetricProps){
 const allUnknown=value.count>0&&value.count===value.unknownCount;
 return <button type="button" className={'recovery-metric'+(compact?' recovery-metric-compact':'')} data-tone={tone} aria-pressed={selected} aria-controls={resultsId} aria-label={title+' — '+(allUnknown?'Amount not recorded':money(value.cents))+'; '+cases(value.count)+(value.unknownCount?'; '+value.unknownCount+' amounts missing':'')+'. View matching cases.'} onClick={()=>onFilter(view)}>
  <span className="recovery-metric-top"><Icon size={16} aria-hidden="true"/><span>{title}</span>{selected?<Check size={15} aria-hidden="true"/>:<ArrowUpRight size={15} aria-hidden="true"/>}</span>
  <strong className={'recovery-metric-amount'+(allUnknown?' recovery-amount-unknown':'')}>{allUnknown?'Amount not recorded':money(value.cents)}{!allUnknown&&value.unknownCount>0&&<small>known</small>}</strong>
  <span className="recovery-metric-count"><b>{cases(value.count)}</b><span>{selected?'Viewing cases':'View cases'}<ArrowRight size={12} aria-hidden="true"/></span></span>
  <span className="recovery-metric-help">{description}</span>
  {value.unknownCount>0&&<span className="recovery-metric-missing">{value.unknownCount} {value.unknownCount===1?'amount':'amounts'} missing</span>}
 </button>;
}

const queueItems:{view:Exclude<RecoveryQueueFilter,'All'>;title:string;description:string;icon:LucideIcon}[]=[
 {view:'Find Release',title:'Find release records',description:'Match payments to Towbook and confirm the customer.',icon:FileSearch},
 {view:'Prepare Demand',title:'Prepare certified demands',description:'Review the release, address, and demand letter.',icon:Send},
 {view:'Awaiting Delivery / Payment',title:'Track delivery & payment',description:'Check tracking, follow up, and record replies.',icon:Mail},
 {view:'Appointments',title:'Payment appointments',description:'Manage scheduled payments and confirm attendance.',icon:CalendarClock},
 {view:'Court Review',title:'Court review',description:'Work cases selected for court review or filing.',icon:Scale},
 {view:'Final Loss',title:'Final losses',description:'Review balances with recovery efforts closed.',icon:FolderCheck},
];

export default function RecoveryDashboard({rows,today,filter,onFilter,onPick,resultsId}:RecoveryDashboardProps){
 const id=useId(),stats=useMemo(()=>recoveryDashboardStats(rows,today),[rows,today]),appointments=stats.appointments.slice(0,4);
 const metricProps={onFilter,resultsId};
 return <div className="recovery-dashboard">
  <section className="recovery-overview" aria-labelledby={id+'-title'}>
   <header className="recovery-dashboard-heading"><div><h2 id={id+'-title'} tabIndex={-1}>Recovery overview</h2><p>{cases(stats.caseCount)} · Choose a total to see its cases</p></div><span className="recovery-period">All time <i aria-hidden="true"/> USD</span></header>
   <div className="recovery-metrics" role="group" aria-label="Recovery financial views">
    <Metric {...metricProps} title="Active recovery balance" value={stats.activeRecovery} description="Outstanding principal and selected fees being pursued." icon={HandCoins} view="Active Recovery" selected={filter==='Active Recovery'} tone="featured"/>
    <Metric {...metricProps} title="Net recovery recorded" value={stats.netRecovery} description="Payments and posted credits, less refunds." icon={Banknote} view="Recovered" selected={filter==='Recovered'} tone="positive"/>
    <Metric {...metricProps} title="Bank losses" value={stats.bankLosses} description="Original principal lost, including later recoveries." icon={TrendingDown} view="Bank Losses" selected={filter==='Bank Losses'}/>
    <Metric {...metricProps} title="Final losses" value={stats.finalLosses} description="Unpaid balances after recovery efforts ended." icon={FolderCheck} view="Final Loss" selected={filter==='Final Loss'}/>
   </div>
   <div className="recovery-status-rail" role="group" aria-label="Recovery review views">
    <Metric {...metricProps} compact title="Pending bank review" value={stats.pendingBankReview} description="Bank outcome pending" icon={Inbox} view="Pending Bank Review" selected={filter==='Pending Bank Review'}/>
    <Metric {...metricProps} compact title="Bank credits to verify" value={stats.bankWinsAwaitingCredit} description="Won; credit still to record" icon={Banknote} view="Bank Credits To Verify" selected={filter==='Bank Credits To Verify'}/>
    <Metric {...metricProps} compact title="Court review" value={stats.courtReview} description="Included in active recovery" icon={Scale} view="Court Review" selected={filter==='Court Review'}/>
    <Metric {...metricProps} compact title="Unverified cases" value={stats.unverified} description="Separate from active recovery" icon={ShieldQuestion} view="Unverified" selected={filter==='Unverified'}/>
   </div>
   <details className="recovery-recorded-note"><summary><CircleHelp size={14} aria-hidden="true"/> How these totals work<ChevronRight size={13} aria-hidden="true"/></summary><div><p><strong>Recorded payments:</strong> {money(stats.customerPaymentsCents)} from customers + {money(stats.postedProcessorCreditsCents)} in processor credits − {money(stats.recoveryRefundsCents)} in refunds.</p><p>{stats.noReceiptsCount?cases(stats.noReceiptsCount)+' have no receipts recorded. ':''}Agreements and appointment amounts are not payments. Bank losses retain the original principal even after recovery. Unverified cases are excluded from active recovery. These views overlap and should not be added together.</p></div></details>
  </section>
  {!!stats.unclassifiedClosed.count&&<div className="recovery-review-note"><p><strong>{cases(stats.unclassifiedClosed.count)} need an outcome review.</strong> They are closed with a remaining or unknown balance, but have no recorded recovery or final loss disposition.</p><button type="button" onClick={()=>onPick(stats.closedBalanceCases[0])}>Review case <ArrowUpRight size={14} aria-hidden="true"/></button></div>}
  <section className="recovery-work-panel" aria-labelledby={id+'-queues'}>
   <header className="recovery-queue-heading"><div><h2 id={id+'-queues'}><Layers3 size={18} aria-hidden="true"/> Work queues</h2><p>Pick the next action. Open a case and keep it moving.</p></div><button type="button" className="recovery-all-cases" aria-pressed={filter==='All'} aria-controls={resultsId} onClick={()=>onFilter('All')}>All recovery cases <b>{stats.queueCounts.All}</b><ArrowRight size={14} aria-hidden="true"/></button></header>
   <div className="recovery-queue-list" role="group" aria-labelledby={id+'-queues'}>{queueItems.map(({view,title,description,icon:Icon})=><button className="recovery-queue" type="button" key={view} aria-pressed={filter===view} aria-controls={resultsId} onClick={()=>onFilter(view)} aria-label={title+' — '+cases(stats.queueCounts[view])+'. View queue.'}>
    <span className="recovery-queue-icon"><Icon size={18} aria-hidden="true"/></span><span className="recovery-queue-copy"><strong>{title}</strong><small>{description}</small></span><span className="recovery-queue-count" data-empty={!stats.queueCounts[view]||undefined}>{stats.queueCounts[view]}</span>{filter===view?<Check size={16} aria-hidden="true"/>:<ChevronRight size={16} aria-hidden="true"/>}
   </button>)}</div>
  </section>
  {!!appointments.length&&<section className="recovery-appointments" aria-labelledby={id+'-appointments'}>
   <header><h3 id={id+'-appointments'}><CalendarClock size={17} aria-hidden="true"/> Payment appointments</h3><button type="button" aria-controls={resultsId} onClick={()=>onFilter('Appointments')}>View appointment cases <ChevronRight size={14} aria-hidden="true"/></button></header>
   <p className="recovery-appointment-note">Dates and times are shown as recorded. Confirm attendance for past dates; record any payment in the case ledger.</p>
   <div className="recovery-appointment-list">{appointments.map(({record,appointment:a,timing})=><button className="recovery-appointment" type="button" key={record.id+'-'+a.id} onClick={()=>onPick(record)} aria-label={'Open '+record.title+' — appointment '+(auditDay(a.day)||'needs a date')}>
    <span className="recovery-appointment-date"><strong>{auditDay(a.day)||'Date needed'}</strong><span>{clock(a.time)}</span><small>{zone(a.zone)}</small></span>
    <span className="recovery-appointment-case"><strong>{record.title}</strong><span>{[a.person,a.location].filter(Boolean).join(' · ')||a.contact||'Appointment details in case'}</span>{a.expectedAmountCents!==null&&<small>{money(a.expectedAmountCents)} expected · Payment not implied</small>}</span>
    <span className="recovery-appointment-status"><b>{a.status}</b><small>{timing==='Past Date'?'Past recorded date — confirm attendance':timing==='Today'?'Recorded for today':timing==='Date Needed'?'Choose a date':'Upcoming'}</small></span><ChevronRight size={15} aria-hidden="true"/>
   </button>)}</div>
   {stats.appointments.length>appointments.length&&<p className="recovery-appointment-note">Showing {appointments.length} of {stats.appointments.length} open appointments. Use the appointment queue to review every case.</p>}
  </section>}
 </div>;
}
