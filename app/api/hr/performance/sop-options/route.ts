import {NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {performanceSopOptions} from '@/lib/hr/performance-sop-links';
import {AppError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(x:unknown,status=200)=>NextResponse.json(x,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(r:Request){
 try{
  const p=new URL(r.url).searchParams,kind=p.get('kind'),personId=p.get('personId');
  if(!personId||!kind||!['note','corrective'].includes(kind))throw new AppError('Choose an employee and performance record type.');
  const staff=await allRecords(),viewer=financeIdentity(r.headers,staff);
  return json(await performanceSopOptions(viewer,staff,personId,kind,p.get('q')||'',Number(p.get('offset')||0)));
 }catch(e){const f=safeFailure(e,'hr.performance.sopOptions');return json(f.body,f.status);}
}
