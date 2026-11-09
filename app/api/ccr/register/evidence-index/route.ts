import {NextRequest,NextResponse} from 'next/server';
import {financeDb} from '@/db/finance';
import {allRecords,identify} from '@/lib/finance/server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {getRegister} from '@/lib/ccr/register-server';
import {checkedId,sectionAccess} from '@/lib/ccr/register-model';
import {documentTypeLabel} from '@/lib/ccr/document-types';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const cell=(v:unknown)=>{let s=String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ');if(/^[\s\uFEFF]*[=+\-@]/u.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 const staff=await allRecords(),v=identify(staff,req.headers);if(!sectionAccess(v,'evidence'))throw new ForbiddenError();
 const b=await readPayload(req);
 if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>2500)throw new AppError('Choose 1 to 2,500 evidence records to export.');
 const ids=b.ids.map(checkedId);if(new Set(ids).size!==ids.length)throw new AppError('Each evidence record must appear once.');
 const {rows}=await getRegister(v,'evidence',staff),permitted=new Map(rows.map(r=>[r.id,r]));
 if(ids.some(id=>!permitted.has(id)))throw new AppError('One or more records are no longer available to you. Refresh the register.',403);
 const at=new Date().toISOString();
 const lines:unknown[][]=[['CONFIDENTIAL — PTE INTERNAL USE','Inspection & Evidence Index'],['Generated At (UTC)',at],[],['Record ID','Title','Category','Status','Record Owner','Due Date','Reference','Last Changed (UTC)','Changed By','Evidence Files','File Names','Document Types']];
 for(const id of ids){const r=permitted.get(id)!;lines.push([r.id,r.title,r.category,r.status,r.ownerName,r.dueOn,r.reference,r.updatedAt,r.updatedBy,r.files.length,r.files.map(f=>f.name).join('; '),r.files.map(documentTypeLabel).join('; ')]);}
 // The organization audit trail records who exported and when, not confidential case titles or document names.
 await financeDb().prepare('INSERT INTO finance_audit(id,record_id,actor,actor_id,at,reason,before,after) VALUES(?,?,?,?,?,?,NULL,?)').bind(crypto.randomUUID(),'report:ccr:evidence-index',v.name,v.id,at,'Exported Confidential Evidence Index',JSON.stringify({format:'csv',count:ids.length})).run();
 return new Response('\ufeff'+lines.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n',{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="Confidential-PTE-Evidence-Index-'+at.slice(0,10)+'.csv"'}});
 }catch(e){const f=safeFailure(e,'ccr.register.evidence-index');return NextResponse.json(f.body,{status:f.status,headers});}}
