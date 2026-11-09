import type { Viewer } from '../finance/model';
import { AppError, ConflictError, ForbiddenError } from '../shared/errors.ts';
import type { PulsePreferences } from './pulse-types';
import {mergeHomeLayout,projectHomeLayout,validateHomeLayout,type DashboardLayout,type HomeSectionId} from './dashboard-layout.ts';

type Store = Pick<D1Database, 'prepare'>;
type Row = {preferences: string; version:number};
const safeKey = (id: string) => /^[a-z][a-z0-9_:-]{0,79}$/i.test(id) && !['constructor','prototype','__proto__'].includes(id);
const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));

export function validatePulsePreferences(value:unknown, allowedIds:string[]): PulsePreferences {
  if (!object(value) || Object.keys(value).length > 200) throw new AppError('Choose valid dashboard preferences.');
  const allowed=new Set(allowedIds), result:PulsePreferences={};
  for (const [id, setting] of Object.entries(value)) {
    if (!safeKey(id) || !allowed.has(id)) throw new ForbiddenError('Access to a dashboard item has changed. Refresh Home and try again.');
    if (!object(setting) || Object.keys(setting).some(key=>!['mode','days'].includes(key)) || !['auto','hidden','pinned','scheduled'].includes(String(setting.mode))) throw new AppError('Choose a valid display setting.');
    if (setting.mode==='scheduled') {
      if (!Array.isArray(setting.days) || setting.days.length<1 || setting.days.length>7 || setting.days.some(d=>!Number.isInteger(d)||d<0||d>6) || new Set(setting.days).size!==setting.days.length)
        throw new AppError('Choose at least one weekday for each scheduled item.');
      result[id]={mode:'scheduled',days:[...setting.days].sort((a,b)=>a-b)};
    } else {
      if (setting.days!==undefined) throw new AppError('Only scheduled items can have weekdays.');
      if (setting.mode!=='auto') result[id]={mode:setting.mode as 'hidden'|'pinned'}; // absence means Automatic; applies to new sources too
    }
  }
  return result;
}
function person(v:Viewer) { if (!v?.person?.trim() || !v.id?.trim()) throw new ForbiddenError('A signed-in employee profile is required.'); return v.person; }
type Saved={preferences:PulsePreferences;layout?:DashboardLayout};
type Result={preferences:PulsePreferences;version:number};
type LayoutResult=Result&{layout:DashboardLayout};
function unpack(raw:string):Saved{
  try {
    const data:unknown=JSON.parse(raw);
    if(!object(data))throw Error();
    // The legacy record has signal IDs as keys. "$home" cannot be a valid signal ID.
    if(!Object.hasOwn(data,'$home'))return {preferences:validatePulsePreferences(data,Object.keys(data))};
    if(data.$home!==2||!object(data.preferences))throw Error();
    const preferences=validatePulsePreferences(data.preferences,Object.keys(data.preferences));
    if(data.layout===undefined)return {preferences};
    const layout=data.layout;
    if(!object(layout)||!Array.isArray(layout.order)||!Array.isArray(layout.signalOrder))throw Error();
    return {preferences,layout:validateHomeLayout(layout,layout.order,layout.signalOrder)};
  }catch{throw new AppError('Your dashboard preferences could not be read.',503);}
}
function scoped(stored:PulsePreferences,allowed:string[],include:boolean):PulsePreferences{
  const set=new Set(allowed);
  return Object.fromEntries(Object.entries(stored).filter(([id])=>set.has(id)===include));
}
const getStore=async(store?:Store)=>store??(await import('@/db/finance')).financeDb();
const rowFor=(store:Store,id:string)=>store.prepare('SELECT preferences, version FROM home_signal_preferences WHERE person_id = ?').bind(id).first<Row>();
export function readPulsePreferences(v:Viewer,allowedIds:string[],store:Store|undefined,availableSectionIds:HomeSectionId[]):Promise<LayoutResult>;
export function readPulsePreferences(v:Viewer,allowedIds:string[],store?:Store):Promise<Result>;
export async function readPulsePreferences(v:Viewer,allowedIds:string[],store?:Store,availableSectionIds?:HomeSectionId[]):Promise<Result|LayoutResult>{
  const id=person(v),row=await rowFor(await getStore(store),id),saved=row?unpack(row.preferences):undefined;
  return {preferences:saved?scoped(saved.preferences,allowedIds,true):{},version:row?.version??0,...(availableSectionIds?{layout:projectHomeLayout(saved?.layout,availableSectionIds,allowedIds)}:{})};
}
export function savePulsePreferences(v:Viewer,allowedIds:string[],preferences:unknown,version:number,store:Store|undefined,layout:unknown,availableSectionIds:HomeSectionId[]):Promise<LayoutResult>;
export function savePulsePreferences(v:Viewer,allowedIds:string[],preferences:unknown,version:number,store?:Store):Promise<Result>;
export async function savePulsePreferences(v:Viewer,allowedIds:string[],preferences:unknown,version:number,store?:Store,layout?:unknown,availableSectionIds?:HomeSectionId[]):Promise<Result|LayoutResult>{
  const id=person(v),next=validatePulsePreferences(preferences,allowedIds);
  if(!Number.isSafeInteger(version)||version<0)throw new AppError('Refresh Home before saving.');
  if(layout!==undefined&&!availableSectionIds)throw new ForbiddenError('Refresh Home before changing the layout.');
  const provided=layout!==undefined?validateHomeLayout(layout,availableSectionIds!,allowedIds):undefined;
  const db=await getStore(store),old=await rowFor(db,id),at=new Date().toISOString();
  if((old?.version??0)!==version)throw new ConflictError('Your dashboard changed in another tab. Refresh Home before saving again.');
  const previous=old?unpack(old.preferences):undefined;
  const merged={...(previous?scoped(previous.preferences,allowedIds,false):{}),...next};
  const persistedLayout=provided?mergeHomeLayout(previous?.layout,provided,availableSectionIds!,allowedIds):previous?.layout;
  const json=JSON.stringify({$home:2,preferences:merged,...(persistedLayout?{layout:persistedLayout}:{})});
  const result=old
    ? await db.prepare('UPDATE home_signal_preferences SET preferences = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE person_id = ? AND version = ?').bind(json,v.id,at,id,version).run()
    : await db.prepare('INSERT INTO home_signal_preferences (person_id, preferences, version, updated_by, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(person_id) DO NOTHING').bind(id,json,v.id,at).run();
  if(result.meta.changes!==1)throw new ConflictError('Your dashboard changed in another tab. Refresh Home before saving again.');
  return {preferences:next,version:version+1,...(availableSectionIds?{layout:projectHomeLayout(persistedLayout,availableSectionIds,allowedIds)}:{})};
}
