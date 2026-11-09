import {NextRequest,NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {can,selfService,canUseHr} from '@/lib/hr/workflow';
import {validRoutingNumber} from '@/lib/hr/banking';
import {lookupRouting} from '@/lib/hr/routing';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const requests=new Map<string,{at:number;count:number}>();
export async function POST(request:NextRequest){try{
 if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)throw new ForbiddenError();
 const body=await readPayload(request),finance=await allRecords(),viewer=financeIdentity(request.headers,finance,{allowOnboarding:true}),personId=String(body.personId||'');
 if(!canUseHr(viewer)||!finance.some(p=>p.kind==='person'&&p.id===personId)||!(viewer.person===personId&&selfService(viewer,'bank')||can(viewer,'manageTaxBank',personId,finance)))throw new ForbiddenError();
 const number=String(body.routingNumber||'');if(!validRoutingNumber(number))throw new AppError('Enter a valid nine-digit ABA routing number.');
 const now=Date.now(),previous=requests.get(viewer.id),row=previous&&previous.at>now-3600000?previous:{at:now,count:0};if(row.count>=40)throw new AppError('Too many bank lookups. Try again later or enter the bank name for review.',429);row.count++;if(requests.size>500)requests.clear();requests.set(viewer.id,row);
 return json({lookup:await lookupRouting(number)});
 }catch(e){const f=safeFailure(e,'hr.routing');return json(f.body,f.status);}}
