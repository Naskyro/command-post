import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {docketAccess} from '@/lib/ccr/docket-model';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
import {importCourtCase} from '@/lib/ccr/docket-import-server';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError('Use the import form in Command.');
 const v=await requestViewer(req.headers);if(!v.person||v.id.startsWith('preview:')||!docketAccess(v,true))throw new ForbiddenError();
 const mime=req.headers.get('content-type'),limit=512*1024;if(!mime?.toLowerCase().startsWith('multipart/form-data;')||!req.body)throw new AppError('Choose a verified court case and its original files.');
 if(Number(req.headers.get('content-length'))>limit)throw new AppError('Use the current Court Docket uploader to stage the original documents before submitting the case.',413);
 let n=0,tooLarge=false;const body=req.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(bytes,c){n+=bytes.length;if(n>limit){tooLarge=true;throw new Error('Limit');}c.enqueue(bytes);}}));
 let form:FormData;try{form=await new Response(body,{headers:{'Content-Type':mime}}).formData();}catch{throw new AppError(tooLarge?'Use the current Court Docket uploader to stage the original documents before submitting the case.':'The case upload is incomplete or malformed.',tooLarge?413:400);}
 if(form.getAll('record').length!==1)throw new AppError('Include one manifest per case.');const raw=form.get('record');if(typeof raw!=='string'||raw.length>120000)throw new AppError('Choose a valid case manifest.');let manifest:unknown;try{manifest=JSON.parse(raw);}catch{throw new AppError('The court manifest is not valid JSON.');}
 return json(await importCourtCase(v,manifest,form.getAll('file')));
 }catch(e){const err=safeFailure(e,'ccr.court.import');return json(err.body,err.status);}}
