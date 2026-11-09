import {canAccess} from '../finance/access.ts';
import type {Viewer} from '../finance/model';
import type {HomePulse} from './pulse-types';
import {AppError,ForbiddenError} from '../shared/errors.ts';

export const homeSectionIds=['glance','chart-finance','chart-time','chart-workload','chart-orders','chart-hires','chart-tows','priority','calendar','learning','signals'] as const;
export type HomeSectionId=typeof homeSectionIds[number];
export type DashboardChartView={mode:'line'|'bar'|'scatter'|'table';range:6|12};
export type DashboardLayout={order:HomeSectionId[];hidden:HomeSectionId[];signalOrder:string[];chartViews?:Partial<Record<HomeSectionId,DashboardChartView>>};
export const isChartSection=(id:HomeSectionId)=>id.startsWith('chart-');
const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const validSignal=(id:string)=>/^[a-z][a-z0-9_:-]{0,79}$/i.test(id)&&!['constructor','prototype','__proto__'].includes(id);
type ProjectedPulse=Pick<HomePulse,'analytics'|'workAnalytics'|'orderAnalytics'|'businessTrends'|'learning'>;

/** List only module charts the server has projected for this viewer. An empty series is still a chart; a missing/denied source is not. */
export function availableHomeSections(v:Viewer,pulse:ProjectedPulse):HomeSectionId[]{
 if(v.onboardingOnly||!v.person||!v.id)return [];
 return homeSectionIds.filter(id=>{
  if(id==='learning')return !!pulse.learning;
  if(id==='chart-finance')return !!pulse.analytics&&canAccess(v,'Finance','Overview');
  if(id==='chart-time')return !!pulse.workAnalytics&&['Today','Timesheets','History','Schedule'].some(t=>canAccess(v,'Timeclock',t));
  if(id==='chart-orders')return !!pulse.orderAnalytics&&canAccess(v,'Work Orders','orders');
  if(id==='chart-hires')return pulse.businessTrends?.hires!=null&&canAccess(v,'People & HR','reports')&&canAccess(v,'People & HR','people');
  if(id==='chart-tows')return pulse.businessTrends?.tows!=null&&(canAccess(v,'Account Management','performance')||canAccess(v,'Account Management','accounts'));
  return true;
 });
}
export function defaultHomeLayout(available:ReadonlyArray<HomeSectionId>):DashboardLayout{
 const ids=new Set(available),chart=(['chart-finance','chart-time','chart-workload'] as const).find(id=>ids.has(id));
 const order=homeSectionIds.filter(id=>ids.has(id));return {order,hidden:order.filter(id=>isChartSection(id)&&id!==chart),signalOrder:[]};
}

function stringList<T extends string>(value:unknown,max:number,permits:(s:string)=>boolean,scope:'section'|'signal'):T[]{
 if(!Array.isArray(value)||value.length>max||value.some(s=>typeof s!=='string')||new Set(value).size!==value.length)throw new AppError('Choose each dashboard item only once.');
 if(value.some(s=>!permits(s)))throw new ForbiddenError('Access to a dashboard '+scope+' has changed. Refresh Home and try again.');
 return [...value] as T[];
}

/** Strictly reject foreign items; keep the order invariant so a hidden section can always be put back. */
export function validateHomeLayout(value:unknown,sectionIds:ReadonlyArray<HomeSectionId>,signalIds:readonly string[]):DashboardLayout{
 if(!isObject(value)||Object.keys(value).some(k=>!['order','hidden','signalOrder','chartViews'].includes(k)))throw new AppError('Choose a valid Home layout.');
 const sections=new Set<string>(sectionIds),signals=new Set(signalIds);
 const section=(s:string)=>sections.has(s)&&(homeSectionIds as readonly string[]).includes(s);
 const order=stringList<HomeSectionId>(value.order,homeSectionIds.length,section,'section');
 if(order.length!==sections.size)throw new AppError('The available dashboard sections have changed. Refresh Home before saving.',409);
 const hidden=stringList<HomeSectionId>(value.hidden,homeSectionIds.length,section,'section');
 const signalOrder=stringList<string>(value.signalOrder,200,s=>validSignal(s)&&signals.has(s),'signal');
 const chartViews:DashboardLayout['chartViews']={};
 if(value.chartViews!==undefined){
  if(!isObject(value.chartViews))throw new AppError('Choose valid chart views.');
  for(const [k,view] of Object.entries(value.chartViews)){
   if(!section(k)||!isChartSection(k as HomeSectionId))throw new ForbiddenError('Choose a chart you can access.');
   if(!isObject(view)||Object.keys(view).some(k=>!['mode','range'].includes(k))||!['line','bar','table','scatter'].includes(String(view.mode))||![6,12].includes(view.range as number)||(view.mode==='scatter'&&!['chart-finance','chart-time'].includes(k)))throw new AppError('Choose an available chart style and date range.');
   chartViews[k as HomeSectionId]={mode:view.mode as DashboardChartView['mode'],range:view.range as 6|12};
  }
 }
 return {order,hidden,signalOrder,...(Object.keys(chartViews).length?{chartViews}:{})};
}

/** Preserve inaccessible items in storage without exposing their existence, labels or chart settings to the client. */
export function projectHomeLayout(stored:DashboardLayout|undefined,available:HomeSectionId[],signalIds:string[]):DashboardLayout{
 if(!stored)return defaultHomeLayout(available);
 const sections=new Set<string>(available),signals=new Set(signalIds),known=new Set(stored.order),fresh=defaultHomeLayout(available).order.filter(id=>!known.has(id));
 const order=[...stored.order.filter(id=>sections.has(id)),...fresh],hidden=new Set([...stored.hidden,...fresh.filter(isChartSection)]);
 const views=Object.fromEntries(Object.entries(stored.chartViews||{}).filter(([id])=>sections.has(id)));
 return {order,hidden:order.filter(id=>hidden.has(id)),signalOrder:stored.signalOrder.filter(id=>signals.has(id)),...(Object.keys(views).length?{chartViews:views}:{})};
}

// Preserve the old slots for inaccessible items rather than silently pushing them to the bottom.
function weave<T extends string>(before:T[],next:T[],visible:Set<T>){let i=0;const out:T[]=[];for(const id of before){if(!visible.has(id))out.push(id);else if(i<next.length)out.push(next[i++]);}return [...out,...next.slice(i)];}
export function mergeHomeLayout(stored:DashboardLayout|undefined,next:DashboardLayout,sections:HomeSectionId[],signals:string[]):DashboardLayout{
 if(!stored)return next;const visible=new Set(sections),visibleSignals=new Set(signals);
 const order=weave(stored.order,next.order,visible),hidden=new Set([...stored.hidden.filter(id=>!visible.has(id)),...next.hidden]);
 const views={...Object.fromEntries(Object.entries(stored.chartViews||{}).filter(([id])=>!visible.has(id as HomeSectionId))),...next.chartViews};
 return {order,hidden:order.filter(id=>hidden.has(id)),signalOrder:weave(stored.signalOrder,next.signalOrder,visibleSignals),...(Object.keys(views).length?{chartViews:views}:{})};
}
