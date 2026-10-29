import {matchingCases} from '@/lib/safety/model';
import {safetyAccess} from '@/lib/safety/access';
import {NextRequest,NextResponse} from 'next/server';
import {context,writeMany} from '@/lib/accounts/server';
import {access,canEdit,clean} from '@/lib/accounts/policy';
import {annualRevenue} from '@/lib/accounts/profile-summary';
import {today} from '@/lib/accounts/model';
import {vehicles,results,importedPayments} from '@/lib/accounts/history';
import {vehicleMatch} from '@/lib/accounts/insights';
import {AppError,ForbiddenError,ConflictError,readPayload,safeFailure} from '@/lib/shared/errors';
import type {Row} from '@/lib/accounts/model';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{
  const {all,viewer:v,staff}=await context(req),p=req.nextUrl.searchParams;
  if(p.get('mode')==='annual') {
    if(!access(v,'performance'))throw new ForbiddenError();
    const accountId=p.get('accountId')||'', year=Number(p.get('year')||today().slice(0,4));
    if(!all.some(r=>r.kind==='account'&&r.id===accountId))throw new AppError('Choose an existing account.');
    if(!Number.isInteger(year)||year<2000||year>Number(today().slice(0,4)))throw new AppError('Choose a recorded year.');
    return json(annualRevenue(importedPayments,accountId,year));
  }
  if(p.get('mode')==='results') {
    if(!access(v,'performance'))throw new ForbiddenError();
    const data=results(all,p.get('accountId')||'',p.get('contactId')||'',p.get('from')||'',p.get('to')||'',p.get('basis')==='received');
    if(!access(v,'claims'))data.settlementsPaid=0;
    if(!access(v,'courtesy')){data.waived=0;data.unknownWaivers=0;}
    return json(data);
  }
  if(!access(v,'courtesy')&&!access(v,'claims')&&!access(v,'performance'))throw new ForbiddenError();
  const query=(p.get('q')||'').trim(),account=p.get('accountId')||'',state=p.get('state')||'',page=Math.max(0,Math.min(10000,Number(p.get('page'))||0));
  if(!query&&!account)return json({rows:[],total:0});
  const calls=vehicles(all), found=calls.filter(r=>(!account||r.accountId===account)&&(!query||vehicleMatch(r,query,state)||r.callNumber===query));
  const events=all.filter(r=>(r.kind==='courtesy'&&access(v,'courtesy')||r.kind==='claim'&&access(v,'claims'))&&(!account||r.accountId===account)&&(!query||vehicleMatch(r,query,state)));
  const rows=[...events,...found].sort((a,b)=>String(b.date||b.towDate||b.receivedDate||'').localeCompare(String(a.date||a.towDate||a.receivedDate||'')));
  return json({rows:rows.slice(page*20,page*20+20).map(r=>({...r,accountName:all.find(a=>a.id===r.accountId)?.name,safetyCases:safetyAccess(v)?matchingCases(all,r).map(c=>({id:c.id,name:c.name})):undefined,canEdit:r.kind==='vehicle'&&access(v,'performance',true)&&all.some(a=>a.id===r.accountId&&canEdit(v,a,all,staff))})),total:rows.length});
}catch(e){const f=safeFailure(e,'accounts.history');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{
 const ctx=await context(req),b=await readPayload(req),input=b.record as Row,old=vehicles(ctx.all).find(r=>r.id===input?.id);
 if(!old||!access(ctx.viewer,'performance',true)||!ctx.all.some(a=>a.id===old.accountId&&canEdit(ctx.viewer,a,ctx.all,ctx.staff)))throw new ForbiddenError();
 if(old.version!==input.version)throw new ConflictError();
 const next=clean(input,old,ctx.viewer,ctx.all,ctx.staff,true);
 if(next.kind!=='vehicle'||next.accountId!==old.accountId)throw new AppError('Keep the original call and account identity.');
 if(next.towDate!==old.towDate && (!next.dateEvidence||!next.towDate))throw new AppError('Record the confirmed tow date and its source.');
 next.towDateBasis=next.towDate===old.towDate?old.towDateBasis:'Manually verified';
 return json({records:await writeMany([{old,next}],ctx.viewer,'Corrected vehicle identification / tow date')});
}catch(e){const f=safeFailure(e,'accounts.history_write');return json(f.body,f.status);}}
