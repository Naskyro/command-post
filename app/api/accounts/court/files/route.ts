import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {safeFailure} from '@/lib/shared/errors';
import {addPropertyFile,authorizePropertyFile,readPropertyFile} from '@/lib/ccr/property-court-server';
import {handleDocumentStage} from '@/lib/ccr/document-stage-server';
import {ccrCourtFileBytes} from '@/lib/ccr/document-input';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'},json=(d:unknown,status=200)=>NextResponse.json(d,{status,headers});
export async function GET(req:NextRequest){try{const q=req.nextUrl.searchParams,{doc,bytes}=await readPropertyFile(await requestViewer(req.headers),q.get('accountId'),q.get('matterId'),q.get('file'));return new Response(bytes as BodyInit,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(doc.name)}});}catch(e){const f=safeFailure(e,'account.court.file.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{const v=await requestViewer(req.headers);return json(await handleDocumentStage(req,v,'account-court-file',{maxBytes:ccrCourtFileBytes,authorize:async f=>{await authorizePropertyFile(v,f);},attach:(d,f)=>addPropertyFile(v,d,f)}));}catch(e){const f=safeFailure(e,'account.court.file.write');return json(f.body,f.status);}}
