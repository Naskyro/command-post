import {NextRequest,NextResponse} from 'next/server';
import {requestRoster,identify} from '@/lib/finance/server';
import {ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {importGoDaddyDisputes} from '@/lib/ccr/godaddy-import-server';

export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();
 const staff=await requestRoster(),viewer=identify(staff,req.headers);
 return json(await importGoDaddyDisputes(viewer,staff,await readPayload(req)));
}catch(error){const failure=safeFailure(error,'ccr.godaddy.import');return json(failure.body,failure.status);}}
