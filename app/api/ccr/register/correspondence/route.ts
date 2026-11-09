import {NextRequest,NextResponse} from 'next/server';
import {requestRoster,identify} from '@/lib/finance/server';
import {requireSourceAccess} from '@/lib/source-files/authorization';
import {safeFailure,readPayload,ForbiddenError} from '@/lib/shared/errors';
import {ingestRegulatoryMail} from '@/lib/ccr/regulatory-mail-server';
import {reviewableTdlr} from '@/lib/ccr/register-server';
export const dynamic='force-dynamic';
const reply=(d:unknown,s=200)=>NextResponse.json(d,{status:s,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(r:NextRequest){try{const staff=await requestRoster(),v=identify(staff,r.headers);await requireSourceAccess(v,'tdlr');const record=await reviewableTdlr(v,staff,r.nextUrl.searchParams.get('id')||'');return reply({events:record.regulatoryMail||[],sourceFiles:record.files.filter(f=>f.sourceReceipt)});}catch(e){const f=safeFailure(e,'ccr.tdlr.mail.read');return reply(f.body,f.status);}}
export async function POST(r:NextRequest){try{if(r.headers.get('origin')!==r.nextUrl.origin)throw new ForbiddenError();const staff=await requestRoster(),v=identify(staff,r.headers),b=await readPayload(r);return reply(await ingestRegulatoryMail(v,staff,b.packet,String(b.action)));}catch(e){const f=safeFailure(e,'ccr.tdlr.mail.file');return reply(f.body,f.status);}}
