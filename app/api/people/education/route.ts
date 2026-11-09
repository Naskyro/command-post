import {NextRequest,NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {auditHrAccess,readHrRecord,recordId,secureStorageAvailable,writeHrRecord} from '@/lib/hr/server';
import type {HrRecord} from '@/lib/hr/model';
import {canReadEducation,canEditEducation,educationRecordId,prepareEducation,readEducationEntries} from '@/lib/hr/education';
import {ForbiddenError,readPayload,safeFailure,AppError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
function respond(record:HrRecord|undefined,canEdit:boolean){return json({entries:readEducationEntries(record?.data||{}),version:record?.version||0,updatedBy:record?.updatedBy||'',updatedAt:record?.updatedAt||'',canEdit,secureStorageAvailable:secureStorageAvailable()});}
export async function GET(req:NextRequest){try{
 const records=await allRecords(),v=financeIdentity(req.headers,records,{allowOnboarding:true}),person=recordId(req.nextUrl.searchParams.get('personId'));
 if(!canReadEducation(v,person,records))throw new ForbiddenError('Education is available only in your authorized personnel files.');
 const old=await readHrRecord(educationRecordId(person));if(old&&(old.personId!==person||old.kind!=='education'))throw new AppError('This personnel record requires administrator review.',409);
 if(old)await auditHrAccess(old,v,'Viewed Personnel Education');
 return respond(old,canEditEducation(v,person,records));
}catch(e){const f=safeFailure(e,'people.education.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError('Cross-origin request rejected.');
 const body=await readPayload(req),records=await allRecords(),v=financeIdentity(req.headers,records,{allowOnboarding:true}),person=recordId(body.personId);
 if(!canEditEducation(v,person,records))throw new ForbiddenError('You do not have permission to update this education record.');
 const old=await readHrRecord(educationRecordId(person)),next=prepareEducation(body,old,v,records);
 const saved=await writeHrRecord(old,next.record,v,next.action);return respond(saved,true);
}catch(e){const f=safeFailure(e,'people.education.write');return json(f.body,f.status);}}
