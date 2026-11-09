import {NextRequest,NextResponse} from 'next/server';
import {requestRoster,identify} from '@/lib/finance/server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {getRegister,registerSummary,saveRegister,registerChoices} from '@/lib/ccr/register-server';
import {isRegisterSection} from '@/lib/ccr/register-model';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:NextRequest){try{const staff=await requestRoster(),v=identify(staff,req.headers),q=req.nextUrl.searchParams;if(q.get('summary')==='1')return json(await registerSummary(v,staff));const s=q.get('section');if(!isRegisterSection(s))throw new AppError('Choose a register.');if(q.get('choices')==='1')return json(await registerChoices(v,s));return json(await getRegister(v,s,staff));}catch(e){const f=safeFailure(e,'ccr.register.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();const staff=await requestRoster(),v=identify(staff,req.headers),b=await readPayload(req),s=b.section;if(!isRegisterSection(s))throw new AppError('Choose a register.');const qs=req.nextUrl.searchParams.get('section');if(qs&&qs!==s)throw new AppError('Record section mismatch.');return json(await saveRegister(v,s,b,staff));}catch(e){const f=safeFailure(e,'ccr.register.save');return json(f.body,f.status);}}
