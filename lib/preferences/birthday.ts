import type {UserSettings} from './themes.ts';
import type {FinRecord} from '../finance/model';
import {localDate,localInstant} from '../finance/timeclock.ts';
import {themeCatalog} from '../site-themes/rules.ts';
export type BirthdayWindow={day:string;endsAt:string;matches:boolean};
/** Central midnight changes with DST. The February 29 policy is February 28 in
 * non-leap years; no age, birth year, or colleague information leaves this helper. */
export function birthdayWindow(dateOfBirth:unknown,now=new Date()):BirthdayWindow{
 const day=localDate(now),next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const endsAt=new Date(localInstant(next.toISOString().slice(0,10)+'T00:00')).toISOString();
 const valid=typeof dateOfBirth==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)&&Number.isFinite(Date.parse(dateOfBirth+'T12:00:00Z'))&&new Date(dateOfBirth+'T12:00:00Z').toISOString().slice(0,10)===dateOfBirth&&dateOfBirth<=day;
 const leap=new Date(day.slice(0,4)+'-02-29T12:00:00Z').getUTCMonth()===1;
 return {day,endsAt,matches:!!valid&&(dateOfBirth.slice(5)===day.slice(5)||dateOfBirth.slice(5)==='02-29'&&!leap&&day.slice(5)==='02-28')};
}
export function birthdayPool(records:FinRecord[],now=new Date()){
 return themeCatalog(records,now).filter(t=>t.personalOnly&&t.available);
}
export function projectBirthdayAppearance(base:UserSettings,stored:UserSettings,window:BirthdayWindow,personId:string,records:FinRecord[],now=new Date()):UserSettings{
 const {birthdayDismissedDay,birthdayThemeId,...safe}=base;void birthdayDismissedDay;void birthdayThemeId;
 const nextChangeAt=[safe.nextChangeAt,window.endsAt].filter((v):v is string=>!!v&&Date.parse(v)>now.getTime()).sort((a,b)=>Date.parse(a)-Date.parse(b))[0];
 const everyday={...safe,nextChangeAt};
 if(!window.matches)return everyday;
 const pool=birthdayPool(records,now);if(!pool.length)return everyday;
 const ordered=[...pool].sort((a,b)=>a.id.localeCompare(b.id));
 let hash=0;for(const c of personId+'|'+window.day.slice(0,4))hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
 const chosen=pool.find(t=>t.id===stored.birthdayThemeId)||ordered[hash%ordered.length],active=stored.birthdayDismissedDay!==window.day;
 const birthdayThemes=pool.map(({id,name,mood,colors,tokens,category,seasonal,personalOnly,decoration})=>({id,name,mood,colors,tokens,category,seasonal,personalOnly,decoration}));
 return {...everyday,theme:active?chosen.id:base.theme,birthday:{active,themeId:chosen.id,endsAt:window.endsAt,baseTheme:base.theme},availableThemes:[...(base.availableThemes||[]).filter(t=>!t.personalOnly),...birthdayThemes]};
}
