import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {financeDb} from '@/db/finance';
import {canAccess} from '@/lib/finance/access';
import type {Viewer} from '@/lib/finance/model';
import {docketAccess} from '@/lib/ccr/docket-model';
import {propertyCourtScope} from '@/lib/ccr/property-court-server';
import {baselineCourtDirectory,changeCourtDirectory,type CourtDirectory} from '@/lib/ccr/court-directory';
import {AppError,ConflictError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const response=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const canManage=(v:Viewer)=>docketAccess(v,true)&&(v.owner||canAccess(v,'Compliance, Claims & Recovery','court-directory',true));
async function directory(){const row=await financeDb().prepare('SELECT payload FROM ccr_court_directory ORDER BY version DESC LIMIT 1').first<{payload:string}>();return row?JSON.parse(row.payload) as CourtDirectory:baselineCourtDirectory();}
export async function GET(req:NextRequest){try{const v=await requestViewer(req.headers);if(!docketAccess(v))await propertyCourtScope(v,req.nextUrl.searchParams.get('accountId'));return response({...await directory(),canManage:canManage(v)});}catch(e){const r=safeFailure(e,'ccr.directory.read');return response(r.body,r.status);}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const v=await requestViewer(req.headers);if(!canManage(v))throw new ForbiddenError();const b=await readPayload(req),prev=await directory(),id=crypto.randomUUID(),next=changeCourtDirectory(prev,b,id);
 if(next.choices.length>3500)throw new AppError('The directory has reached its capacity.',413);
 const result=await financeDb().prepare('INSERT OR IGNORE INTO ccr_court_directory(version,payload,actor,actor_id,changed_at,action,entry_id,reason) VALUES(?,?,?,?,?,?,?,?)').bind(next.version,JSON.stringify(next),v.name,v.id,new Date().toISOString(),b.action,b.action==='add'?id:b.id,String(b.reason).trim()).run();if(result.meta.changes!==1)throw new ConflictError('The directory was updated elsewhere. Refresh the directory before trying again.');
 return response({...next,canManage:true});
 }catch(e){const r=safeFailure(e,'ccr.directory.edit');return response(r.body,r.status);}}
