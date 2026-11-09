import { AppError, ConflictError } from '../shared/errors.ts';
import { defaultTheme, validateTheme, isPermanentTheme, themeById, type ThemeId, type UserSettings } from './themes.ts';
import { retiredThemeIds } from '../site-themes/catalog.ts';
type Statement = {bind(...values:(string|number)[]):Statement;first<T>():Promise<T|null>;run():Promise<{meta:{changes?:number}}>};
export type SettingsDatabase = {prepare(query:string):Statement};
type Owner = {person:string;id:string};
type Row = {theme:string;version:number;updated_at:string};
export type SeasonalSelection={fallbackTheme:string;endsAt?:string};
export type BirthdayPreferences={birthdayDismissedDay?:string;birthdayThemeId?:string};
const validDay=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
function birthdayPreferences(input:Record<string,unknown>):BirthdayPreferences{
 const p:BirthdayPreferences={};
 if(input.birthdayDismissedDay!==undefined){if(!validDay(input.birthdayDismissedDay))throw new Error('Invalid birthday preference');p.birthdayDismissedDay=input.birthdayDismissedDay;}
 if(input.birthdayThemeId!==undefined){if(typeof input.birthdayThemeId!=='string'||!themeById(input.birthdayThemeId).personalOnly)throw new Error('Invalid birthday preference');p.birthdayThemeId=input.birthdayThemeId;}
 return p;
}
export async function readUserSettings(db:SettingsDatabase, owner:Owner):Promise<UserSettings> {
 const row=await db.prepare('SELECT theme, version, updated_at FROM user_settings WHERE person_id = ?').bind(owner.person).first<Row>();
 if (!row) return {theme:defaultTheme,version:0,updatedAt:null};
 try {
  // Appearance preferences share one atomic envelope; the saved base theme is
  // never overwritten by the temporary birthday display.
  if(row.theme.startsWith('{')){
   const selected=JSON.parse(row.theme) as Record<string,unknown>,personal=birthdayPreferences(selected);
   if(typeof selected.theme==='string'&&retiredThemeIds.has(selected.theme)){
    const fallback=typeof selected.fallback==='string'&&isPermanentTheme(selected.fallback)?selected.fallback:defaultTheme;
    return {theme:fallback,version:row.version,updatedAt:row.updated_at,...personal,notice:'This seasonal design has been removed. Your saved everyday theme has been restored.'};
   }
   const theme=validateTheme(selected.theme);
   if(themeById(theme).personalOnly)throw new Error('A birthday cannot be the saved base theme');
   if(isPermanentTheme(theme))return {theme,version:row.version,updatedAt:row.updated_at,...personal};
   if(typeof selected.fallback!=='string'||!isPermanentTheme(selected.fallback)||typeof selected.selectedAt!=='string'||!Number.isFinite(Date.parse(selected.selectedAt))||(selected.expiresAt!==undefined&&(typeof selected.expiresAt!=='string'||!Number.isFinite(Date.parse(selected.expiresAt)))))throw new Error('Invalid selection');
   return {theme,version:row.version,updatedAt:row.updated_at,fallbackTheme:selected.fallback,seasonalSelectedAt:selected.selectedAt,seasonalExpiresAt:selected.expiresAt as string|undefined,...personal};
  }
  if(retiredThemeIds.has(row.theme))return {theme:defaultTheme,version:row.version,updatedAt:row.updated_at,notice:'This seasonal design has been removed. Your default theme has been restored.'};
  const theme=validateTheme(row.theme);if(themeById(theme).personalOnly)throw new Error('Invalid selection');
  return {theme,version:row.version,updatedAt:row.updated_at};
 }catch {throw new AppError('Your appearance settings could not be read.',503);}
}
function storedSettings(settings:UserSettings){
 const personal=birthdayPreferences(settings as unknown as Record<string,unknown>),seasonal=!isPermanentTheme(settings.theme);
 if(!seasonal&&!Object.keys(personal).length)return settings.theme;
 return JSON.stringify({theme:settings.theme,...(seasonal?{fallback:settings.fallbackTheme,selectedAt:settings.seasonalSelectedAt,...(settings.seasonalExpiresAt?{expiresAt:settings.seasonalExpiresAt}:{})}:{}),...personal});
}
async function commit(db:SettingsDatabase,owner:Owner,settings:UserSettings,version:number):Promise<UserSettings>{
 const at=new Date().toISOString(),stored=storedSettings(settings);
 const result=version===0
  ?await db.prepare('INSERT INTO user_settings (person_id, theme, version, updated_by, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(person_id) DO NOTHING').bind(owner.person,stored,owner.id,at).run()
  :await db.prepare('UPDATE user_settings SET theme = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE person_id = ? AND version = ?').bind(stored,owner.id,at,owner.person,version).run();
 if(result.meta.changes!==1)throw new ConflictError('Your theme changed in another tab. Refresh settings and try again.');
 return {...settings,version:version+1,updatedAt:at};
}
export async function writeUserSettings(db:SettingsDatabase, owner:Owner, theme:ThemeId, version:number,seasonal?:SeasonalSelection,personal:BirthdayPreferences={}):Promise<UserSettings> {
 theme=validateTheme(theme);
 if(themeById(theme).personalOnly)throw new AppError('Birthday designs are personal celebrations, not a saved everyday theme.');
 const at=new Date().toISOString(),isSeasonal=!isPermanentTheme(theme);
 if(isSeasonal&&(!seasonal||!isPermanentTheme(seasonal.fallbackTheme)))throw new AppError('Refresh the available themes before selecting a seasonal design.');
 return commit(db,owner,{theme,version,updatedAt:at,...birthdayPreferences(personal as Record<string,unknown>),...(isSeasonal?{fallbackTheme:seasonal!.fallbackTheme,seasonalSelectedAt:at,seasonalExpiresAt:seasonal!.endsAt}:{})},version);
}
export async function writeBirthdayPreference(db:SettingsDatabase,owner:Owner,previous:UserSettings,version:number,change:{dismissedDay?:string;themeId?:string;clearDismissal?:boolean}):Promise<UserSettings>{
 if(version!==previous.version)throw new ConflictError('Your theme changed in another tab. Refresh settings and try again.');
 const next={...previous};
 // Work from the persisted selection only. Never persist projected overlay tokens.
 delete next.availableThemes;delete next.birthday;delete next.selectedTheme;delete next.nextChangeAt;delete next.notice;
 if(change.clearDismissal)delete next.birthdayDismissedDay;
 if(change.dismissedDay!==undefined)next.birthdayDismissedDay=change.dismissedDay;
 if(change.themeId!==undefined)next.birthdayThemeId=change.themeId;
 return commit(db,owner,next,version);
}
