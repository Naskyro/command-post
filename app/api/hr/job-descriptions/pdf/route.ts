import {NextRequest,NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {getEdition,editionPdf} from '@/lib/hr/job-catalog-server';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const people=await allRecords(),v=financeIdentity(req.headers,people,{allowOnboarding:true}),q=req.nextUrl.searchParams;
 const e=await getEdition(q.get('id'),Number(q.get('version')),v,people),bytes=await editionPdf(e,v);
 const name=e.file?.fileName||e.content.title+' - Draft.pdf';
 return new Response(bytes.buffer as ArrayBuffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':(q.get('download')==='1'?'attachment':'inline')+'; filename="'+name.replace(/[^a-zA-Z0-9._ -]/g,'_')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(err){const f=safeFailure(err,'hr.job-descriptions.pdf');return NextResponse.json(f.body,{status:f.status,headers:{'Cache-Control':'private, no-store'}});}}
