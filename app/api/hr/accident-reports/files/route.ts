import {NextRequest,NextResponse} from 'next/server';
import {requestRoster} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {readMedicalPaper,attachMedicalPaper} from '@/lib/hr/accident-reports-server';
import {readDocumentForm,validatedDocumentFile} from '@/lib/ccr/document-input';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function GET(req:NextRequest){try{
 if(req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const people=await requestRoster(),viewer=financeIdentity(req.headers,people),q=req.nextUrl.searchParams;
 const {file,bytes}=await readMedicalPaper(viewer,people,q.get('caseId'),q.get('reportId'));return new Response(bytes as BodyInit,{headers:{...headers,'Content-Type':file.type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'Content-Security-Policy':"sandbox; default-src 'none'"}});
}catch(e){const f=safeFailure(e,'hr.accident-reports.file.read');return NextResponse.json(f.body,{status:f.status,headers});}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const people=await requestRoster(),viewer=financeIdentity(req.headers,people),form=await readDocumentForm(req,8*1024*1024),fields:Record<string,string>={};
 let file:File|undefined;for(const [key,value] of form.entries()){
  if(key==='file'){if(file||!(value instanceof File))throw new AppError('Choose one signed report.');file=value;continue;}
  if(!['caseId','version','reportId','reportHash','signatureName','signedOn','confirmed'].includes(key)||key in fields||typeof value!=='string')throw new AppError('Choose a valid signed-report destination.');fields[key]=value;
 }
 if(!file)throw new AppError('Upload the driver’s actual signed copy.');const document=await validatedDocumentFile(file,8*1024*1024);return NextResponse.json(await attachMedicalPaper(viewer,people,fields,document),{headers});
}catch(e){const f=safeFailure(e,'hr.accident-reports.file.write');return NextResponse.json(f.body,{status:f.status,headers});}}
