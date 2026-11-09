import type {Viewer,FinRecord} from '../finance/model';
import type {UserSettings} from './themes';
import {financeDb} from '@/db/finance';
import {decode} from '@/lib/hr/server';
import {personalDetailsRecordId} from '@/lib/people/details';
import {birthdayWindow,projectBirthdayAppearance,type BirthdayWindow} from './birthday';
import {effectiveUserSettings} from '../site-themes/rules';
/** Query exactly one authenticated employee's encrypted HR row. Neither caller
 * parameters nor Admin scope can switch the subject of this personal feature. */
export async function ownBirthdayWindow(viewer:Pick<Viewer,'person'>,now=new Date()):Promise<BirthdayWindow>{
 try{
  const row=await financeDb().prepare("SELECT payload FROM hr_records WHERE id=? AND person_id=? AND kind='personal' LIMIT 1").bind(personalDetailsRecordId(viewer.person),viewer.person).first<{payload:string}>();
  if(!row)return birthdayWindow(undefined,now);
  const record=await decode(row.payload);
  if(record.kind!=='personal'||record.personId!==viewer.person||record.id!==personalDetailsRecordId(viewer.person)||record.data?.deletedAt)return birthdayWindow(undefined,now);
  return birthdayWindow(record.data?.dateOfBirth,now);
 }catch{
  // Private HR storage being unavailable must not break unrelated appearance
  // settings. Missing/unreadable dates never create a guessed celebration.
  return birthdayWindow(undefined,now);
 }
}
export async function personalAppearance(settings:UserSettings,records:FinRecord[],viewer:Pick<Viewer,'person'>,now=new Date(),window?:BirthdayWindow):Promise<UserSettings>{
 return projectBirthdayAppearance(effectiveUserSettings(settings,records,now),settings,window||await ownBirthdayWindow(viewer,now),viewer.person,records,now);
}
