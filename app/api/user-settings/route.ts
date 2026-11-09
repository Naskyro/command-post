import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { financeDb } from '@/db/finance';
import { readPayload, safeFailure,ForbiddenError,AppError } from '@/lib/shared/errors';
import { validateSettings,isPermanentTheme,defaultTheme } from '@/lib/preferences/themes';
import { readUserSettings, writeUserSettings,writeBirthdayPreference } from '@/lib/preferences/storage';
import {assertThemeSelectable} from '@/lib/site-themes/rules';
import {ownBirthdayWindow,personalAppearance} from '@/lib/preferences/birthday-server';
import {birthdayPool} from '@/lib/preferences/birthday';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:NextRequest) {
 try {
  const records=await allRecords(),viewer=identify(records,request.headers);
  return NextResponse.json(await personalAppearance(await readUserSettings(financeDb(),viewer),records,viewer),{headers});
 } catch(error) {const failure=safeFailure(error,'user_settings.read');return NextResponse.json(failure.body,{status:failure.status,headers});}
}
export async function POST(request:NextRequest) {
 try {
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new ForbiddenError();
  const records=await allRecords(),viewer=identify(records,request.headers),body=await readPayload(request);
  if(body.action==='dismiss-birthday'||body.action==='birthday-theme'){
   const allowed=body.action==='dismiss-birthday'?['action','version']:['action','theme','version'];
   if(Object.keys(body).some(k=>!allowed.includes(k))||!Number.isSafeInteger(body.version)||Number(body.version)<0)throw new AppError('Refresh your personal appearance settings before saving.');
   const now=new Date(),window=await ownBirthdayWindow(viewer,now),pool=birthdayPool(records,now);
   if(!window.matches||!pool.length)throw new AppError('Birthday appearance is available only during your own birthday in Austin time.');
   if(body.action==='birthday-theme'&&!pool.some(t=>t.id===body.theme))throw new AppError('Choose an available birthday design.');
   const previous=await readUserSettings(financeDb(),viewer);
   const saved=await writeBirthdayPreference(financeDb(),viewer,previous,Number(body.version),body.action==='dismiss-birthday'?{dismissedDay:window.day}:{themeId:String(body.theme),clearDismissal:true});
   return NextResponse.json(await personalAppearance(saved,records,viewer,now,window),{headers});
  }
  const {theme,version,dismissBirthday}=validateSettings(body);
  const now=new Date(),window=dismissBirthday?await ownBirthdayWindow(viewer,now):undefined;
  if(dismissBirthday&&!window?.matches)throw new AppError('Your birthday appearance has ended. Refresh settings and choose your theme again.');
  const choice=assertThemeSelectable(theme,records),previous=await readUserSettings(financeDb(),viewer);
  const fallbackTheme=isPermanentTheme(previous.theme)?previous.theme:previous.fallbackTheme||defaultTheme;
  const saved=await writeUserSettings(financeDb(),viewer,theme,version,choice.seasonal?{fallbackTheme,endsAt:choice.endsAt}:undefined,{...(window?.matches?{birthdayDismissedDay:window.day}:previous.birthdayDismissedDay?{birthdayDismissedDay:previous.birthdayDismissedDay}:{}),...(previous.birthdayThemeId?{birthdayThemeId:previous.birthdayThemeId}:{})});
  return NextResponse.json(await personalAppearance(saved,records,viewer,now,window),{headers});
 } catch(error) {const failure=safeFailure(error,'user_settings.save');return NextResponse.json(failure.body,{status:failure.status,headers});}
}
