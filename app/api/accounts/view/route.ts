import {NextRequest,NextResponse} from 'next/server';
import {context,writeMany} from '@/lib/accounts/server';
import {access} from '@/lib/accounts/policy';
import {validAccountColumns,defaultAccountColumns} from '@/lib/accounts/list-view';
import {readPayload,safeFailure,AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{const {viewer:v,all}=await context(req);if(!access(v,'accounts'))throw new ForbiddenError();const r=all.find(r=>r.id==='account-view:'+v.person&&r.kind==='accountView');return json({columns:r?.columns||defaultAccountColumns(v.owner||v.role==='Department Head'),version:r?.version||0});}catch(e){const f=safeFailure(e,'account_view.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{const {viewer:v,all}=await context(req),b=await readPayload(req);if(!access(v,'accounts'))throw new ForbiddenError();if(!validAccountColumns(b.columns))throw new AppError('Choose valid columns, keeping Property first.');const id='account-view:'+v.person,old=all.find(r=>r.id===id);if((old?.version||0)!==b.version)throw new ConflictError();const [saved]=await writeMany([{old,next:{id,kind:'accountView',version:old?.version||0,name:'My Accounts view',personId:v.person,columns:b.columns}}],v,'Changed personal account columns');return json({columns:saved.columns,version:saved.version});}catch(e){const f=safeFailure(e,'account_view.save');return json(f.body,f.status);}}
