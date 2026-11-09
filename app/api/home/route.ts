import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';
import { buildHomePulse } from '@/lib/home/pulse';
import { readPulsePreferences,savePulsePreferences } from '@/lib/home/pulse-preferences';
import {availableHomeSections} from '@/lib/home/dashboard-layout';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  try {
    const records = await allRecords(), viewer = identify(records, request.headers);
    const pulse=await buildHomePulse(viewer,records);
    const availableSections=availableHomeSections(viewer,pulse);
    const options=await readPulsePreferences(viewer,pulse.signals.map(s=>s.id),undefined,availableSections);
    const dashboard={pulse,availableSections,layout:options.layout,preferences:options.preferences,preferenceVersion:options.version};
    return NextResponse.json({ ...dashboard, viewer, title: String(records.find(r => r.id === viewer.person)?.title || ''), timeZone: String(records.find(r => r.id === 'company')?.timezone || 'America/Chicago') }, { headers });
  } catch (error) {
    const failure = safeFailure(error, 'home.read');
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: NextRequest) {
  try {
    const body = await readPayload(request);
    if(body.action==='save-dashboard'){
      if(Object.keys(body).some(k=>!['action','preferences','version','layout'].includes(k))) throw new AppError('Only your dashboard preferences can be changed here.');
      if(!Number.isSafeInteger(body.version)||Number(body.version)<0) throw new AppError('Refresh Home before saving.');
      const records=await allRecords(),viewer=identify(records,request.headers);
      const pulse=await buildHomePulse(viewer,records);
      const availableSections=availableHomeSections(viewer,pulse);
      return NextResponse.json(await savePulsePreferences(viewer,pulse.signals.map(s=>s.id),body.preferences,Number(body.version),undefined,body.layout,availableSections),{headers});
    }
    throw new AppError('Choose a supported dashboard action.');
  } catch (error) {
    const failure = safeFailure(error, 'home.save');
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
