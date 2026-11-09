import type { HomeTarget } from './widgets';
export type PulseTone='critical'|'warning'|'info'|'neutral';
export type PulseItem={id:string;title:string;detail?:string;at?:string;due?:string;target?:HomeTarget;severity?:PulseTone;calendar?:boolean};
export type PulseSignal={id:string;title:string;module:string;description:string;count:number;unit:string;target:HomeTarget;items:PulseItem[];tone:PulseTone;score:number;dateLabel?:string;displayValue?:string};
export type PulsePreferences=Record<string,{mode:'auto'|'pinned'|'scheduled'|'hidden';days?:number[]}>;
export type HomePulse={learning?:import('./learning-types').HomeLearning|null;orderAnalytics?:import('./order-analytics-types').HomeOrderAnalytics|null;businessTrends?:import('./module-trends-types').HomeBusinessTrends|null;analytics?:import('../reports/finance-home-types').HomeFinancialAnalytics|null;workAnalytics?:import('./work-analytics').HomeWorkAnalytics|null;signals:PulseSignal[];unavailable:string[];asOf:string;today:string};
const severity:Record<PulseTone,number>={critical:3,warning:2,info:1,neutral:0};
// Scoring within severity lets providers promote a looming deadline without masking a live safety incident.
export function rankSignals(a:PulseSignal,b:PulseSignal){return Number(b.count>0)-Number(a.count>0)||severity[b.tone]-severity[a.tone]||b.score-a.score||a.title.localeCompare(b.title)||a.id.localeCompare(b.id);}
export function inPersonalOrder(signals:PulseSignal[],signalOrder:readonly string[]){
 if(!signalOrder.length)return signals;
 const rank=new Map(signalOrder.map((id,i)=>[id,i]));
 return [...signals].sort((a,b)=>(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity));
}
export function selectDashboardSignals(signals:PulseSignal[],prefs:PulsePreferences,today:string,signalOrder:readonly string[]=[]){
 const weekday=new Date(today+'T12:00:00Z').getUTCDay();
 const ordered=[...signals].sort(rankSignals),mode=(s:PulseSignal)=>prefs[s.id]?.mode||'auto';
 const personal=inPersonalOrder(ordered,signalOrder);
 const pinned=personal.filter(s=>mode(s)==='pinned');
 const scheduled=personal.filter(s=>mode(s)==='scheduled'&&prefs[s.id]?.days?.includes(weekday));
 const automatic=personal.filter(s=>mode(s)==='auto');
 // A quiet week should still communicate what was checked; never pad with invented incidents.
 const automaticLimit=6, own=automatic.find(s=>s.id==='my_shifts');
 const hot=automatic.slice(0,automaticLimit);
 if(own&&own.count>0&&!hot.includes(own))hot.push(own);
 const visible=inPersonalOrder([...pinned,...scheduled,...hot],signalOrder);
 const priorities=ordered.filter(s=>s.count>0&&(s.tone==='critical'||((s.tone==='warning'||s.tone==='info'&&s.score>=65)&&(mode(s)!=='hidden')&&(mode(s)!=='scheduled'||scheduled.includes(s)))));
 return {visible,priorities,pinned,scheduled};
}
