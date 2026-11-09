import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify,persist} from '@/lib/finance/server';
import {canAccess,accessCatalog} from '@/lib/finance/access';
import {canEditAccess} from '@/lib/people/policy';
import {captureAuthorityOverrides} from '@/lib/people/authority';
import {savePeopleBatch} from '@/lib/people/atomic';
import type {FinRecord} from '@/lib/finance/model';
import {templateList,templateAllowed,cleanTemplate,requireTemplate,accessTemplatePlan} from '@/lib/admin/access-templates';
import {ForbiddenError,AppError,ConflictError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(v:unknown,s=200)=>NextResponse.json(v,{status:s,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail=(e:unknown)=>{const f=safeFailure(e,'admin.access-templates');return json(f.body,f.status)};
export async function GET(r:NextRequest){try{const records=await allRecords(),v=identify(records,r.headers);if(!canAccess(v,'Admin','users')&&!canAccess(v,'People & HR','hiring',true))throw new ForbiddenError();const canEdit=canAccess(v,'Admin','users',true);return json({templates:templateList(records).filter(t=>templateAllowed(t,v)),canEdit,catalog:accessCatalog,people:canEdit?records.filter(p=>p.kind==='person').map(p=>({id:p.id,name:String(p.preferredName||p.name),version:p.version,status:String(p.status),department:String(p.department||''),canEdit:p.role!=='Owner'&&canEditAccess(v,p,records),templateName:p.accessTemplateName})):[]});}catch(e){return fail(e)}}
export async function POST(r:NextRequest){try{
 if(r.headers.get('origin')!==r.nextUrl.origin)throw new ForbiddenError('Cross-origin request rejected.');const records=await allRecords(),v=identify(records,r.headers);if(!canAccess(v,'Admin','users',true))throw new ForbiddenError();const b=await readPayload(r),action=String(b.action||''),reason=String(b.reason||'').trim();if(action!=='preview-apply'&&(!reason||reason.length>1000))throw new AppError('Enter a reason for the access change (up to 1,000 characters).');
 if(action==='save'){const input=b.template as Record<string,unknown>|undefined,old=input?.id?requireTemplate(records,input.id,input.version):undefined;if(old&&!templateAllowed(old,v))throw new ForbiddenError('This permission set exceeds your own access.');const next=cleanTemplate(input,v,records,old);const record=await persist(records.find(x=>x.id===old?.id),next as unknown as FinRecord,v,'Permission Set Saved: '+reason);return json({template:record});}
 const t=requireTemplate(records,b.id,b.version);if(!templateAllowed(t,v))throw new ForbiddenError('This permission set exceeds your own access.');
 if(action==='archive'||action==='restore'){const record=await persist(records.find(x=>x.id===t.id),{...t,status:action==='archive'?'Archived':'Active',builtin:false} as unknown as FinRecord,v,'Permission Set '+(action==='archive'?'Archived':'Restored')+': '+reason);return json({template:record});}
 if(action==='clone'){const copy=cleanTemplate({...t,id:undefined,name:String(b.name||t.name+' Copy')},v,records);const record=await persist(undefined,copy as unknown as FinRecord,v,'Permission Set Copied: '+reason);return json({template:record});}
 if(!['preview-apply','apply'].includes(action))throw new AppError('Unknown permission-set action.');if(!Array.isArray(b.personIds)||!b.personIds.length||b.personIds.length>50)throw new AppError('Choose 1–50 people.');if(!['Replace','Merge'].includes(String(b.mode)))throw new AppError('Choose Replace or Merge.');const ids=[...new Set(b.personIds.map(String))],versions=b.expectedVersions as Record<string,unknown>|undefined;
 const plans=ids.map(id=>{const old=records.find(p=>p.kind==='person'&&p.id===id);if(!old)throw new AppError('An employee is no longer available.');if(action==='apply'&&versions?.[id]!==old.version)throw new ConflictError('An employee’s permissions changed. Preview the changes again.');const plan=accessTemplatePlan(t,old,v,records,b.mode as 'Replace'|'Merge');return {old,next:captureAuthorityOverrides(old,plan.next),change:plan.change};});
 if(action==='preview-apply')return json({count:plans.length,changes:plans.map(p=>p.change)});
 await savePeopleBatch(plans.map(({old,next})=>({old,next})),v,'Applied Permission Set '+t.name+' v'+t.version+' ('+b.mode+'): '+reason);return json({applied:plans.length});
 }catch(e){return fail(e)}}
