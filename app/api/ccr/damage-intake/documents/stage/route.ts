import {validateDamageSourceBytes} from '@/lib/ccr/damage-source-image';
import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {ForbiddenError,safeFailure} from '@/lib/shared/errors';
import {assertDamageIntakeAccess} from '@/lib/ccr/damage-intake-server';
import {attachDamageIntakeOriginal,authorizeDamageIntakeOriginal,intakeFileLimit} from '@/lib/ccr/damage-intake-documents';
import {handleDocumentStage} from '@/lib/ccr/document-stage-server';

export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){
 try{
  if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();
  const viewer=await requestViewer(req.headers);
  await assertDamageIntakeAccess(viewer,true);
  return json(await handleDocumentStage(req,viewer,'ccr-damage-intake',{
   maxBytes:intakeFileLimit,allowResume:true,validate:(bytes,name,limit)=>validateDamageSourceBytes(bytes,name,limit),
   authorize:async fields=>{await authorizeDamageIntakeOriginal(viewer,fields);},
   attach:(document,fields)=>attachDamageIntakeOriginal(viewer,fields,document),
  }));
 }catch(e){const f=safeFailure(e,'ccr.damage-intake.document.stage');return json(f.body,f.status);}
}
