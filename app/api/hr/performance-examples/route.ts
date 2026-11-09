import {NextRequest,NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {canAccess} from '@/lib/finance/access';
import {hrCan} from '@/lib/hr/permissions';
import {performanceExamples} from '@/lib/hr/performance-examples';
import {dismissedSampleIds,dismissSample} from '@/lib/preferences/sample-dismissals';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const moduleKey='hr-performance';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function currentPerson(req:NextRequest){
  const rows=await allRecords(),v=financeIdentity(req.headers,rows);
  const active=rows.find(r=>r.kind==='person'&&r.id===v.person);
  if(!active||active.status!=='Active'||!canAccess(v,'People & HR','performance')&&!rows.some(r=>r.kind==='person'&&(hrCan(v,'recordPerformance',r.id,rows)||hrCan(v,'issueCorrective',r.id,rows))))throw new ForbiddenError();
  return v.person;
}
export async function GET(req:NextRequest){try{
  const person=await currentPerson(req),removed=await dismissedSampleIds(person,moduleKey);
  return json({examples:performanceExamples.filter(e=>!removed.has(e.id))});
}catch(e){const f=safeFailure(e,'hr.performanceExamples.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{
  if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new ForbiddenError();
  const person=await currentPerson(req),body=await readPayload(req);
  if(body.action!=='dismiss'||!performanceExamples.some(e=>e.id===body.id))throw new AppError('Choose a training example.');
  await dismissSample(person,moduleKey,String(body.id));
  return json({ok:true});
}catch(e){const f=safeFailure(e,'hr.performanceExamples.dismiss');return json(f.body,f.status);}}
