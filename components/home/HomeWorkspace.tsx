'use client';
import {useState,useEffect,useRef} from 'react';
import Link from 'next/link';
import CommandDashboard from './CommandDashboard';
import DashboardSettings from './DashboardSettings';
import {requestJson,timedFetch} from '@/lib/shared/client';
import type {HomeData,HomeTarget,HomeSelection} from '@/lib/home/widgets';
import type {HomePulse,PulsePreferences} from '@/lib/home/pulse-types';
import type {DashboardLayout,HomeSectionId} from '@/lib/home/dashboard-layout';
import '@/components/finance/finance.css';
import '@/components/ccr/accident-reports.css';
type DashboardData=Pick<HomeData,'viewer'|'title'|'timeZone'>&{pulse:HomePulse;preferences:PulsePreferences;preferenceVersion:number;availableSections:HomeSectionId[];layout:DashboardLayout};
type ChartView={mode:'line'|'bar'|'scatter'|'table';range:6|12};
type Open=(module:string,tab?:string,section?:string,selection?:HomeSelection)=>void;
// Do not fall back to the operator's own Home if delegation ends in another tab.
async function loadDashboard(readOnly:boolean){
 if(!readOnly)return requestJson<DashboardData>('/api/home',undefined,45000);
 const response=await timedFetch('/api/home',{headers:{'x-command-read-only':'1'}},45000);
 if(!response.ok)throw Error(response.status===401||response.status===403||response.status===409?'This delegated view is no longer available. Return to your own workspace.':'Home could not be loaded. Try again.');
 return await response.json() as DashboardData;
}
export default function HomeWorkspace({onOpen,readOnly=false}:{onOpen:Open;readOnly?:boolean}){
 return <DashboardSession key={readOnly?'delegated':'own'} onOpen={onOpen} readOnly={readOnly}/>;
}
function DashboardSession({onOpen,readOnly}:{onOpen:Open;readOnly:boolean}){
 const [data,setData]=useState<DashboardData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[editing,setEditing]=useState(false),[now,setNow]=useState(()=>Date.now());
 const refreshing=useRef(false),saving=useRef(false),editingRef=useRef(false),editVersion=useRef(0),latestWrite=useRef(0);editingRef.current=editing;
 async function load(){
  if(refreshing.current)return;refreshing.current=true;setLoading(true);
  try{const next=await loadDashboard(readOnly);
   // A refresh started before a successful save must not revert that save.
   if(next.preferenceVersion>=latestWrite.current){setData(next);setError('');}
  }catch(e){setData(null);setError(e instanceof Error?e.message:'Home could not be loaded.');}finally{refreshing.current=false;setLoading(false);}
 }
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible'&&!editingRef.current&&!saving.current){setNow(Date.now());void load();}};const soon=setTimeout(refresh,0),timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);return()=>{clearTimeout(soon);clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};},[]);
 async function change(next:PulsePreferences,layout?:DashboardLayout,version?:number){
  if(readOnly)throw Error('Dashboard settings cannot be changed in a delegated view.');
  if(!data||saving.current)throw Error('Another dashboard change is saving. Try again in a moment.');saving.current=true;
  try{const result=await requestJson<{preferences:PulsePreferences;version:number;layout:DashboardLayout}>('/api/home',{action:'save-dashboard',preferences:next,version:version??data.preferenceVersion,...(layout?{layout}:{})},45000);
   latestWrite.current=result.version;
   setData(cur=>cur?{...cur,preferences:result.preferences,layout:result.layout,preferenceVersion:result.version}:cur);
  }catch(e){void load();throw e;}finally{saving.current=false;}
 }
 function startEditing(){if(readOnly||!data)return;editVersion.current=data.preferenceVersion;setEditing(true);}
 const open=(t:HomeTarget)=>onOpen(t.module,t.tab,t.section,t);
 if(!data)return <div className="f-workspace f-loading"><h2>{error||'Loading Home…'}</h2>{error&&<button className="f-button" onClick={()=>void load()}>Try Again</button>}</div>;
 const setChartView=(id:HomeSectionId,next:ChartView)=>change(data.preferences,{...data.layout,chartViews:{...data.layout.chartViews,[id]:next}});
 return <><CommandDashboard readOnly={readOnly} data={data} pulse={data.pulse} preferences={data.preferences} layout={data.layout} availableSections={data.availableSections} onChartViewChange={readOnly?undefined:setChartView} onChange={p=>change(p)} onOpen={open} onRefresh={()=>void load()} onCustomize={startEditing} refreshing={loading} now={now}/><Link className="accident-home-link" href="/people/accident-followups" prefetch={false}><span><strong>Accident Follow-Ups</strong><small>Review your reports and scheduled check-ins.</small></span><span>Open Follow-Ups →</span></Link>{!readOnly&&<DashboardSettings open={editing} onClose={()=>setEditing(false)} signals={data.pulse.signals} preferences={data.preferences} layout={data.layout} availableSections={data.availableSections} onSave={(p,l)=>change(p,l,editVersion.current)}/>}</>;
}
