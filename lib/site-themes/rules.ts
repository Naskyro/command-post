import {allThemes,isPermanentTheme,defaultTheme,type UserSettings} from '../preferences/themes.ts';
import {canAccess} from '../finance/access.ts';
import type {FinRecord,Viewer} from '../finance/model.ts';
import {AppError,ConflictError,ForbiddenError} from '../shared/errors.ts';
import type {SiteTheme,SiteThemeStatus,SiteThemesData} from './model.ts';
const statuses:SiteThemeStatus[]=['Available','Scheduled','Hidden','Archived'];
export const themeRecordId=(id:string)=>`site-theme:${id}`;
export function themePermissions(viewer:Viewer){return {canManage:canAccess(viewer,'Admin','site-themes',true),canViewAdmin:canAccess(viewer,'Admin','site-themes')};}
export function availableAt(theme:Pick<SiteTheme,'seasonal'|'status'|'startsAt'|'endsAt'>,now:number){
 if(!theme.seasonal)return true;
 if(!['Available','Scheduled'].includes(theme.status))return false;
 if(theme.status==='Scheduled'&&!theme.startsAt)return false;
 const start=theme.startsAt?Date.parse(theme.startsAt):-Infinity,end=theme.endsAt?Date.parse(theme.endsAt):Infinity;
 return start<=now&&now<end;
}
export function themeCatalog(records:FinRecord[],now=new Date()):SiteTheme[]{
 return allThemes.map(def=>{
  const row=records.find(r=>r.kind==='siteTheme'&&r.id===themeRecordId(def.id));
  const status:SiteThemeStatus=!def.seasonal?'Available':row&&statuses.includes(row.status as SiteThemeStatus)?row.status as SiteThemeStatus:def.personalOnly?'Available':'Hidden';
  const theme:SiteTheme={...def,version:def.seasonal?row?.version||0:0,status,available:false};
  if(def.seasonal&&row){for(const key of ['startsAt','endsAt','updatedAt','updatedBy','reason'] as const){if(typeof row[key]==='string'&&row[key])theme[key]=row[key] as string;}}
  theme.available=availableAt(theme,now.getTime());return theme;
 });
}
export function nextAvailabilityChange(themes:SiteTheme[],now=new Date()):string|undefined{
 const dates=themes.filter(t=>t.seasonal&&['Available','Scheduled'].includes(t.status)).flatMap(t=>[t.startsAt,t.endsAt]).filter((d):d is string=>!!d&&Date.parse(d)>now.getTime()).sort((a,b)=>Date.parse(a)-Date.parse(b));
 return dates[0];
}
export function siteThemeData(records:FinRecord[],viewer:Viewer,admin=false,now=new Date()):SiteThemesData{
 const permissions=themePermissions(viewer);if(admin&&!permissions.canViewAdmin)throw new ForbiddenError();
 const all=themeCatalog(records,now);
 const themes=admin?all:all.filter(t=>t.available&&!t.personalOnly).map(t=>{const {updatedBy,updatedAt,reason,...publicTheme}=t;void updatedBy;void updatedAt;void reason;return publicTheme;});
 return {themes,...permissions,serverNow:now.toISOString(),nextChangeAt:nextAvailabilityChange(all,now)};
}
function timestamp(value:unknown,label:string):string|undefined{
 if(value===null||value===undefined||value==='')return undefined;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new AppError(`${label} must include a valid date, time, and timezone.`);
 return new Date(value).toISOString();
}
export function prepareThemeChange(records:FinRecord[],viewer:Viewer,body:Record<string,unknown>,now=new Date()){
 if(!themePermissions(viewer).canManage)throw new ForbiddenError('You need Edit access to Admin Site Themes.');
 if(Object.keys(body).some(k=>!['action','id','version','status','startsAt','endsAt','reason'].includes(k)))throw new AppError('Only theme availability can be changed here.');
 const def=allThemes.find(t=>t.id===body.id);if(!def)throw new AppError('Select a theme from the design library.');
 if(def.personalOnly&&!['archive','restore'].includes(String(body.action)))throw new AppError('Birthday designs use each employee’s birthday. They can only be archived or restored here.');
 if(!def.seasonal)throw new AppError('Everyday themes are always available and cannot be changed or archived.');
 const old=records.find(r=>r.id===themeRecordId(def.id));
 if(old&&old.kind!=='siteTheme')throw new ConflictError();
 if(!Number.isSafeInteger(body.version)||body.version!==(old?.version||0))throw new ConflictError();
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(reason.length<3||reason.length>1500)throw new AppError('Add a reason between 3 and 1,500 characters for the change history.');
 let status:SiteThemeStatus,startsAt:string|undefined,endsAt:string|undefined;
 if(body.action==='archive'){
  if(old?.status==='Archived')throw new AppError('This theme is already archived.');
  status='Archived';startsAt=old?.startsAt as string|undefined;endsAt=old?.endsAt as string|undefined;
 }else if(body.action==='restore'){
  if(old?.status!=='Archived')throw new AppError('Only an archived theme can be restored.');
  // Restoring does not silently release a previous schedule to employees.
  status=def.personalOnly?'Available':'Hidden';
 }else if(body.action==='save'){
  if(old?.status==='Archived')throw new AppError('Restore this theme before changing its availability.');
  if(!['Available','Scheduled','Hidden'].includes(String(body.status)))throw new AppError('Choose Available, Scheduled, or Hidden.');
  status=body.status as SiteThemeStatus;startsAt=timestamp(body.startsAt,'Start');endsAt=timestamp(body.endsAt,'End');
  if(status==='Scheduled'&&!startsAt)throw new AppError('Choose the date and time this theme becomes available.');
  if(status==='Scheduled'&&Date.parse(startsAt!)<=now.getTime())throw new AppError('Choose a future start time, or publish the theme now.');
  if(status==='Available'){
   // Every fresh publication starts a new opt-in window; old expired selections do not reappear.
   startsAt=startsAt||(old?.status==='Available'&&availableAt({seasonal:true,status:'Available',startsAt:old.startsAt as string|undefined,endsAt:old.endsAt as string|undefined},now.getTime())?String(old.startsAt||now.toISOString()):now.toISOString());
   if(Date.parse(startsAt)>now.getTime())throw new AppError('Use Scheduled for a future start time.');
  }
  if(endsAt&&Date.parse(endsAt)<=now.getTime())throw new AppError('Choose a future end time, or hide the theme now.');
  if(startsAt&&endsAt&&Date.parse(endsAt)<=Date.parse(startsAt))throw new AppError('The end must be after the start.');
  if(status==='Hidden'){startsAt=undefined;endsAt=undefined;}
 }else throw new AppError('Choose a supported theme action.');
 const next:FinRecord={id:themeRecordId(def.id),kind:'siteTheme',version:old?.version||0,themeId:def.id,name:def.name,status,startsAt:startsAt||'',endsAt:endsAt||'',reason};
 return {old,next,reason:`Site Theme — ${def.name} — ${status}: ${reason}`};
}
/** Availability is enforced on the server; hidden or expired themes cannot be selected by a forged request. */
export function assertThemeSelectable(id:string,records:FinRecord[],now=new Date()):SiteTheme{
 const theme=themeCatalog(records,now).find(t=>t.id===id);if(!theme?.available||theme.personalOnly)throw new AppError('That theme is no longer available. Choose another theme.');return theme;
}
export function effectiveUserSettings(settings:UserSettings,records:FinRecord[],now=new Date()):UserSettings{
 const catalog=themeCatalog(records,now),selected=catalog.find(t=>t.id===settings.theme);
 const fallback=isPermanentTheme(settings.fallbackTheme||'')?settings.fallbackTheme!:defaultTheme;
 const selectedAt=settings.seasonalSelectedAt?Date.parse(settings.seasonalSelectedAt):0;
 const expiredSelection=!!settings.seasonalExpiresAt&&Date.parse(settings.seasonalExpiresAt)<=now.getTime();
 const newerPublication=selected?.seasonal&&!!selected.startsAt&&Date.parse(selected.startsAt)>selectedAt;
 const unavailable=!selected||(selected.seasonal&&(!selected.available||expiredSelection||newerPublication));
 return {...settings,theme:unavailable?fallback:settings.theme,selectedTheme:settings.theme,
  ...(unavailable?{notice:`${selected?.name||'This theme'} is no longer available. Your ${allThemes.find(t=>t.id===fallback)?.name||'everyday'} theme has been restored.`}:{}),
  availableThemes:catalog.filter(t=>t.available&&!t.personalOnly).map(({id,name,mood,colors,tokens,category,seasonal,decoration,federalHoliday,observanceNote})=>({id,name,mood,colors,tokens,category,seasonal,decoration,federalHoliday,observanceNote})),
  nextChangeAt:[nextAvailabilityChange(catalog,now),settings.seasonalExpiresAt].filter((x):x is string=>!!x&&Date.parse(x)>now.getTime()).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]};
}
