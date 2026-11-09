import {context} from '@/lib/school/server';
import {startSchoolMedia,putSchoolMediaPart,sealSchoolMediaGroup,finishSchoolMedia,cancelSchoolMedia} from '@/lib/school/media-stage-server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const out=(body:unknown,status=200)=>Response.json(body,{status,headers});
function sameOrigin(r:Request){if(r.headers.get('origin')!==new URL(r.url).origin||r.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();}
export async function POST(r:Request){try{sameOrigin(r);const ctx=await context(r),url=new URL(r.url);if(url.searchParams.has('part'))return out(await putSchoolMediaPart(ctx,url.searchParams.get('id')||'',Number(url.searchParams.get('part')),r));const body=await readPayload(r);if(body.action==='start')return out(await startSchoolMedia(ctx,body));if(body.action==='seal')return out(await sealSchoolMediaGroup(ctx,String(body.id||''),Number(body.group)));if(body.action==='finish')return out(await finishSchoolMedia(ctx,String(body.id||'')));throw new AppError('Choose a media upload action.');}catch(e){const f=safeFailure(e,'school.media.stage');return out(f.body,f.status);}}
export async function DELETE(r:Request){try{sameOrigin(r);return out(await cancelSchoolMedia(await context(r),new URL(r.url).searchParams.get('id')||''));}catch(e){const f=safeFailure(e,'school.media.cancel');return out(f.body,f.status);}}
