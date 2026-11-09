import {context,fileBytes,writeMany} from '@/lib/accounts/server';
import {canEdit} from '@/lib/accounts/policy';
import type {Row} from '@/lib/accounts/model';
import {salesAccess} from '@/lib/sales/server';
import {isSalesSample} from '@/lib/sales/handoff-relationships';
import {leadExterior,photoAccount,propertyFiles,propertyPhotoFields} from '@/lib/sales/property-photo';
import {financeFiles} from '@/db/finance';
import {AppError,ConflictError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {prepareProfilePhoto,profilePhotoLimit} from '@/lib/people/photos';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Vary':'Cookie'};
const out=(v:unknown,status=200)=>Response.json(v,{status,headers});
type Ctx=Awaited<ReturnType<typeof context>>;
function find(ctx:Ctx,id:unknown,write=false){
 const lead=ctx.all.find(r=>r.id===id&&r.kind==='opportunity');
 if(!lead||isSalesSample(lead)||!salesAccess(ctx.viewer,write)||write&&!canEdit(ctx.viewer,lead,ctx.all,ctx.staff))throw new ForbiddenError('Exterior photo unavailable for this lead.');
 return lead;
}
function mutation(r:Request){if(r.headers.get('origin')!==new URL(r.url).origin||r.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();}
function version(value:unknown){
 if(typeof value!=='number'&&typeof value!=='string'||!/^\d{1,12}$/.test(String(value)))throw new AppError('Refresh the lead before changing its photo.');
 return Number(value);
}
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
function current(lead:Row,all:Row[]){return {...propertyPhotoFields(lead,all),version:lead.version};}
export async function GET(r:Request){try{
 const u=new URL(r.url),ctx=await context(r),lead=find(ctx,u.searchParams.get('leadId')),f=propertyFiles(lead,ctx.all)[0];
 if(!f||u.searchParams.has('v')&&u.searchParams.get('v')!==f.id||!['image/jpeg','image/png','image/webp'].includes(String(f.mimeType)))throw new AppError('Exterior photo unavailable.',404);
 const {body,mime}=await fileBytes(f);return new Response(body,{headers:{...headers,'Content-Type':mime,'Content-Disposition':'inline'}});
 }catch(e){const f=safeFailure(e,'sales.property-photo.read');return out(f.body,f.status);}}
type Edit={old?:Row;next:Row};
async function edit(r:Request,remove:boolean){
 let staged='';try{
  mutation(r);const ctx=await context(r);if(!salesAccess(ctx.viewer,true))throw new ForbiddenError();
  let input:Record<string,unknown>,file:File|undefined;
  if(remove)input=await readPayload(r);else{
   const type=r.headers.get('content-type')||'';if(!r.body||!type.startsWith('multipart/form-data;'))throw new AppError('Upload a property photo as a file.');
   const max=profilePhotoLimit+65536;if(Number(r.headers.get('content-length')||0)>max)throw new AppError('Choose a photo up to 5 MB.',413);let length=0;
   const bounded=r.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,c){length+=chunk.byteLength;if(length>max)throw new AppError('Choose a photo up to 5 MB.',413);c.enqueue(chunk);}}));
   const form=await new Response(bounded,{headers:{'Content-Type':type}}).formData();input=Object.fromEntries(form);if(form.get('file') instanceof File)file=form.get('file') as File;
  }
  const lead=find(ctx,input.leadId,true),account=photoAccount(lead,ctx.all,true),op=input.requestId,v=version(input.version),prior=propertyFiles(lead,ctx.all,account);
  if(!uuid(op))throw new AppError('A valid photo submission ID is required.');
  const method=remove?'remove':'upload';
  if(lead.exteriorOp===op&&lead.exteriorActor===ctx.viewer.person&&lead.exteriorMethod===method)return out(current(lead,ctx.all));
  if(remove&&!prior.length||input.photoId!==undefined&&input.photoId!==(prior[0]?.id||'')||lead.version!==v)throw new ConflictError('The lead or photo changed. Refresh before trying again.');
  const fid='sales-exterior-'+op;
  if(ctx.all.some(row=>row.id===fid))throw new ConflictError('This photo submission has already been used.');
  const changes:Edit[]=prior.map(old=>({old,next:{...old,status:'Archived'}}));
  if(account)changes.push({old:account,next:{...account}}); // also serialize with regular Account photo replacements
  if(!remove){
   if(!file||!file.size||file.size>profilePhotoLimit||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new AppError('Choose a JPG, PNG, or WebP exterior photo up to 5 MB.');
   const image=prepareProfilePhoto(new Uint8Array(await file.arrayBuffer()),file.type);
   // A unique staging key per HTTP attempt means a racing retry cannot delete
   // the winner's bytes. The durable file record and operation ID are stable.
   staged='accounts/property-exteriors/'+crypto.randomUUID();
   await financeFiles().put(staged,image.bytes,{httpMetadata:{contentType:image.mimeType}});
   const next:Row={id:fid,kind:'file',version:0,name:'Property Exterior.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.mimeType]||'jpg'),category:account?'Account photo':leadExterior,status:'Current',opportunityId:lead.id,...(account?{accountId:account.id,sourceOpportunityId:lead.id}:{}),date:new Date().toISOString().slice(0,10),size:image.bytes.byteLength,width:image.width,height:image.height,mimeType:image.mimeType,storageKey:staged};
   changes.push({next});
  }
  changes.push({old:lead,next:{...lead,exteriorOp:op,exteriorActor:ctx.viewer.person,exteriorMethod:method}});
  const result=await writeMany(changes,ctx.viewer,remove?'Removed Sales Property Exterior Photo':'Uploaded Sales Property Exterior Photo');
  staged='';const combined=[...ctx.all.filter(a=>!result.some(b=>a.id===b.id)),...result];
  return out(current(result.find(x=>x.id===lead.id)!,combined));
 }catch(e){
  if(staged)await financeFiles().delete(staged).catch(()=>{});
  const f=safeFailure(e,'sales.property-photo.write');return out(f.body,f.status);
 }
}
export const POST=(r:Request)=>edit(r,false);
export const DELETE=(r:Request)=>edit(r,true);
