import { NextRequest, NextResponse } from 'next/server';
import { allRecords } from '@/lib/finance/server';
import { financeIdentity } from '@/lib/finance/identity';
import { canUseHr, listRecord } from '@/lib/hr/workflow';
import { readHrRecords, recordSeparation } from '@/lib/hr/server';
import { ForbiddenError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const json = (data:unknown,status=200) => NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});

export async function POST(request:NextRequest) {
 try {
  if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)throw new ForbiddenError('Cross-origin request rejected.');
  const body=await readPayload(request),finance=await allRecords(),viewer=financeIdentity(request.headers,finance);
  if(!canUseHr(viewer))throw new ForbiddenError();
  const result=await recordSeparation(body,viewer,finance,await readHrRecords());
  return json({...result,record:listRecord(result.record)},result.alreadyRecorded?200:201);
 } catch(e) {const f=safeFailure(e,'hr.separation');return json(f.body,f.status);}
}
