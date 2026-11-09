import { NextRequest,NextResponse } from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {readHrRecords} from '@/lib/hr/server';
import {showJobLibrary} from '@/lib/hr/job-library-access';
import {assignEdition,catalogListing,saveEdition} from '@/lib/hr/job-catalog-server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function auth(req:NextRequest){
 const people=await allRecords(),v=financeIdentity(req.headers,people,{allowOnboarding:true});
 if(!showJobLibrary(v,people))throw new ForbiddenError('The job description library is not assigned to your account.');
 return {v,people};
}
export async function GET(req:NextRequest){try{
 const {v,people}=await auth(req);return json(await catalogListing(v,people,await readHrRecords()));
}catch(e){const f=safeFailure(e,'hr.job-descriptions.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 const {v,people}=await auth(req),body=await readPayload(req);
 if(body.action==='assign')return json(await assignEdition(body,v,people,await readHrRecords()));
 if(body.action==='save'||body.action==='publish')return json({description:await saveEdition(body,v,people)});
 throw new AppError('Choose a job description action.');
}catch(e){const f=safeFailure(e,'hr.job-descriptions.write');return json(f.body,f.status);}}
