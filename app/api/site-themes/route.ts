import {NextResponse} from 'next/server';
import {allRecords,identify,persist} from '@/lib/finance/server';
import {readPayload,safeFailure,ForbiddenError,ConflictError} from '@/lib/shared/errors';
import {siteThemeData,prepareThemeChange} from '@/lib/site-themes/rules';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(request:Request){try{const rows=await allRecords(),viewer=identify(rows,request.headers);return json(siteThemeData(rows,viewer,new URL(request.url).searchParams.get('admin')==='1'));}catch(error){const f=safeFailure(error,'site_themes.read');return json(f.body,f.status);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new ForbiddenError();
 const rows=await allRecords(),viewer=identify(rows,request.headers),body=await readPayload(request),prepared=prepareThemeChange(rows,viewer,body);
 let saved;try{saved=await persist(prepared.old,prepared.next,viewer,prepared.reason);}catch(error){if(error instanceof Error&&/Someone changed this record/.test(error.message))throw new ConflictError();throw error;}
 return json(siteThemeData([...rows.filter(r=>r.id!==saved.id),saved],viewer,true));
}catch(error){const f=safeFailure(error,'site_themes.write');return json(f.body,f.status);}}
