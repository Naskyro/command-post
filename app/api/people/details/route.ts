import { NextRequest, NextResponse } from 'next/server';
import { allRecords } from '@/lib/finance/server';
import { financeIdentity } from '@/lib/finance/identity';
import { auditHrAccess, readHrRecord, recordId, secureStorageAvailable } from '@/lib/hr/server';
import { canReadPersonalDetails, canEditPersonalDetails, personalDetailsRecordId, preparePersonalDetails } from '@/lib/people/details';
import { personalProfileIdentity, preparePersonalProfile } from '@/lib/people/personal-profile';
import { writePersonalProfile } from '@/lib/people/personal-profile-server';
import { AppError, ForbiddenError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});

export async function GET(request:NextRequest){
 try{
  const records=await allRecords(),viewer=financeIdentity(request.headers,records,{allowOnboarding:true}),personId=recordId(request.nextUrl.searchParams.get('personId'));
  if(!canReadPersonalDetails(viewer,personId,records))throw new ForbiddenError('Personal details are available only to this employee and their assigned personnel or onboarding administrator.');
  const record=await readHrRecord(personalDetailsRecordId(personId));
  if(record&&(record.kind!=='personal'||record.personId!==personId))throw new AppError('Personal details require administrator review.',409);
  if(record)await auditHrAccess(record,viewer,'Viewed Private Personnel Details');
  const person=records.find(row=>row.kind==='person'&&row.id===personId)!;
  return json({record:record||null,identity:personalProfileIdentity(person,records),canEdit:canEditPersonalDetails(viewer,personId,records),secureStorageAvailable:secureStorageAvailable()});
 }catch(error){const failure=safeFailure(error,'people.details.read');return json(failure.body,failure.status);}
}

export async function POST(request:NextRequest){
 try{
  if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)throw new ForbiddenError('Cross-origin request rejected.');
  const records=await allRecords(),viewer=financeIdentity(request.headers,records,{allowOnboarding:true}),body=await readPayload(request),personId=recordId(body.personId);
  if(!canEditPersonalDetails(viewer,personId,records))throw new ForbiddenError('Personal details are available only to this employee and their assigned personnel or onboarding administrator.');
  const old=await readHrRecord(personalDetailsRecordId(personId)),next=preparePersonalDetails(body,old,viewer,records),profile=preparePersonalProfile(body,viewer,records,next.updatedAt);
  const saved=await writePersonalProfile({old,record:next,...profile,people:records},viewer);
  return json({record:saved.record,identity:personalProfileIdentity(saved.person,records),canEdit:true,secureStorageAvailable:secureStorageAvailable()});
 }catch(error){const failure=safeFailure(error,'people.details.write');return json(failure.body,failure.status);}
}
