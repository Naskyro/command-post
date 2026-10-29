import { AppError, ConflictError } from '../shared/errors.ts';
import { defaultTheme, validateTheme, type ThemeId, type UserSettings } from './themes.ts';
type Statement = {bind(...values:(string|number)[]):Statement;first<T>():Promise<T|null>;run():Promise<{meta:{changes?:number}}>};
export type SettingsDatabase = {prepare(query:string):Statement};
type Owner = {person:string;id:string};
type Row = {theme:string;version:number;updated_at:string};

export async function readUserSettings(db:SettingsDatabase, owner:Owner):Promise<UserSettings> {
  const row=await db.prepare('SELECT theme, version, updated_at FROM user_settings WHERE person_id = ?').bind(owner.person).first<Row>();
  if (!row) return {theme:defaultTheme,version:0,updatedAt:null};
  try {return {theme:validateTheme(row.theme),version:row.version,updatedAt:row.updated_at};}
  catch {throw new AppError('Your appearance settings could not be read.',503);}
}
export async function writeUserSettings(db:SettingsDatabase, owner:Owner, theme:ThemeId, version:number):Promise<UserSettings> {
  const at=new Date().toISOString();
  const result=version===0
    ? await db.prepare('INSERT INTO user_settings (person_id, theme, version, updated_by, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(person_id) DO NOTHING').bind(owner.person,theme,owner.id,at).run()
    : await db.prepare('UPDATE user_settings SET theme = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE person_id = ? AND version = ?').bind(theme,owner.id,at,owner.person,version).run();
  if (result.meta.changes!==1) throw new ConflictError('Your theme changed in another tab. Refresh settings and try again.');
  return {theme,version:version+1,updatedAt:at};
}
