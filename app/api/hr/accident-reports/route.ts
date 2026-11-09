import {NextRequest,NextResponse} from 'next/server';
import {requestRoster} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {medicalCaseView,medicalCaseList,mutateMedicalCase} from '@/lib/hr/accident-reports-server';
import {ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
export async function GET(req:NextRequest){try{
 if(req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const people=await requestRoster(),viewer=financeIdentity(req.headers,people),q=req.nextUrl.searchParams;
 if(q.has('claimKey')||q.has('caseId'))return json(await medicalCaseView(viewer,people,Object.fromEntries(q)));
 return json({cases:await medicalCaseList(viewer,people,q.get('driverId')||undefined)});
}catch(e){const f=safeFailure(e,'hr.accident-reports.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const people=await requestRoster(),viewer=financeIdentity(req.headers,people),body=await readPayload(req);return json(await mutateMedicalCase(viewer,people,body));
}catch(e){const f=safeFailure(e,'hr.accident-reports.write');return json(f.body,f.status);}}
