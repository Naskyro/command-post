import {NextRequest,NextResponse} from 'next/server';
import {context,writeMany} from '@/lib/accounts/server';
import {access} from '@/lib/accounts/policy';
import {upgradeTodayLayout,validTodayLayout} from '@/lib/accounts/today-layout';
import {canAccess} from '@/lib/finance/access';
import {readPayload,safeFailure,AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function personal(req:NextRequest){const {viewer,all}=await context(req);if(viewer.onboardingOnly||!canAccess(viewer,'Account Management')||!access(viewer,'work'))throw new ForbiddenError();const id='today-layout:'+viewer.person;return {viewer,id,old:all.find(r=>r.kind==='accountView'&&r.id===id&&r.personId===viewer.person)};}
export async function GET(req:NextRequest){try{const {old}=await personal(req);const layout=old?{order:old.order,pinned:old.pinned,hidden:old.hidden}:null;return json({layout:upgradeTodayLayout(layout),version:old?.version||0});}catch(e){const f=safeFailure(e,'today.layout.read');return json(f.body,f.status)}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();const {viewer,id,old}=await personal(req),b=await readPayload(req);if((old?.version||0)!==b.version)throw new ConflictError('Your dashboard changed. Reload its layout before saving.');if(!validTodayLayout(b.layout))throw new AppError('Choose a valid dashboard layout.');const {order,pinned,hidden}=b.layout;const [saved]=await writeMany([{old,next:{id,kind:'accountView',version:old?.version||0,name:'My Account Management Today Layout',personId:viewer.person,order,pinned,hidden}}],viewer,'Customized Personal Account Management Dashboard');return json({layout:b.layout,version:saved.version});}catch(e){const f=safeFailure(e,'today.layout.write');return json(f.body,f.status)}}
