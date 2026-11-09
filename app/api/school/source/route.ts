import {NextResponse} from 'next/server';
import {context,getCourse} from '@/lib/school/server';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
import assetData from '@/lib/school/private/served-source-assets.json';
export const dynamic='force-dynamic';
type Asset={name:string;mime:string;base64:string;instructorOnly?:boolean};
export async function GET(r:Request){try{const ctx=await context(r),url=new URL(r.url),cid=url.searchParams.get('courseId')||'',key=url.searchParams.get('asset')||'',c=await getCourse(ctx,cid),a=(assetData as Record<string,Record<string,Asset>>)[cid]?.[key];if(!a)throw new AppError('Source file unavailable.',404);if(a.instructorOnly&&!ctx.all&&!(ctx.creator&&(c.createdBy===ctx.v.person||c.departmentIds.includes(ctx.departmentId))))throw new ForbiddenError();return new Response(Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':a.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="'+a.name.replace(/["\r\n]/g,'_')+'"'}});}catch(e){const f=safeFailure(e,'school.source');return NextResponse.json(f.body,{status:f.status});}}
