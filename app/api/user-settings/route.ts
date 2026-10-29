import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { financeDb } from '@/db/finance';
import { readPayload, safeFailure } from '@/lib/shared/errors';
import { validateSettings } from '@/lib/preferences/themes';
import { readUserSettings, writeUserSettings } from '@/lib/preferences/storage';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:NextRequest) {
  try {
    const viewer=identify(await allRecords(),request.headers);
    return NextResponse.json(await readUserSettings(financeDb(),viewer),{headers});
  } catch(error) {const failure=safeFailure(error,'user_settings.read');return NextResponse.json(failure.body,{status:failure.status,headers});}
}
export async function POST(request:NextRequest) {
  try {
    const viewer=identify(await allRecords(),request.headers);
    const {theme,version}=validateSettings(await readPayload(request));
    return NextResponse.json(await writeUserSettings(financeDb(),viewer,theme,version),{headers});
  } catch(error) {const failure=safeFailure(error,'user_settings.save');return NextResponse.json(failure.body,{status:failure.status,headers});}
}
