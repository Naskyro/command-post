import {NextRequest,NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {can,selfService,canUseHr,validateSave} from '@/lib/hr/workflow';
import {bankInputFields,bankSummary,currentBankRecord,bankBinding,BANK_AUTHORIZATION_TEXT,BANK_AUTHORIZATION_VERSION,bankHasElectronicAuthorization,bankHasPaperAuthorization,validateBankFields} from '@/lib/hr/banking';
import {lookupRouting} from '@/lib/hr/routing';
import {readHrRecords,createRecord,writeHrRecord,auditHrAccess,secureStorageAvailable,recordId} from '@/lib/hr/server';
import {AppError,ForbiddenError,ConflictError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function GET(request:NextRequest){try{
 const finance=await allRecords(),viewer=financeIdentity(request.headers,finance,{allowOnboarding:true}),personId=recordId(request.nextUrl.searchParams.get('personId'));
 const canReview=can(viewer,'manageTaxBank',personId,finance),self=viewer.person===personId&&selfService(viewer,'bank');
 if(!canUseHr(viewer)||!finance.some(p=>p.kind==='person'&&p.id===personId)||!(self||canReview))throw new ForbiddenError('Payment details are private to the employee and assigned payroll staff.');
 const records=await readHrRecords(),banks=records.filter(r=>r.kind==='bank'&&r.personId===personId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
 const chosen=request.nextUrl.searchParams.get('recordId');let record;
 if(chosen){record=banks.find(r=>r.id===chosen);if(!record)throw new AppError('Payment setup not found.',404);await auditHrAccess(record,viewer,'Viewed Direct Deposit Details');}
 const current=currentBankRecord(banks,localDay());
 return json({canReview,self,secureStorageAvailable:secureStorageAvailable(),currentId:current?.id||null,records:banks.map(bankSummary),record,documents:records.filter(r=>r.kind==='document'&&r.personId===personId&&r.data.category==='Bank Authorization').map(r=>({id:r.id,version:r.version,data:{fileName:r.data.fileName,signatureStatus:r.data.signatureStatus,signatureDate:r.data.signatureDate},createdAt:r.createdAt})),authorizationText:BANK_AUTHORIZATION_TEXT});
 }catch(e){const f=safeFailure(e,'hr.bank.read');return json(f.body,f.status);}}
export async function POST(request:NextRequest){try{
 if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)throw new ForbiddenError();
 const body=await readPayload(request),finance=await allRecords(),viewer=financeIdentity(request.headers,finance,{allowOnboarding:true}),personId=recordId(body.personId);
 const canReview=can(viewer,'manageTaxBank',personId,finance),self=viewer.person===personId&&selfService(viewer,'bank');
 if(!canUseHr(viewer)||!finance.some(p=>p.kind==='person'&&p.id===personId)||!(self||canReview))throw new ForbiddenError('Payment details are private to the employee and assigned payroll staff.');
 const records=await readHrRecords(),id=body.id?recordId(body.id):'hrbank:'+crypto.randomUUID(),old=records.find(r=>r.id===id);
 if(old&&(old.kind!=='bank'||old.personId!==personId))throw new ForbiddenError();
 if(old&&Number(body.version)!==old.version)throw new ConflictError();
 const action=String(body.action||''),input=body.data&&typeof body.data==='object'&&!Array.isArray(body.data)?body.data as Record<string,unknown>:{};
 if(!['saveDraft','submit','verify'].includes(action))throw new AppError('Choose a valid payment setup action.');
 if(old?.data.status==='Verified')throw new AppError('Approved payment instructions are preserved. Add a replacement account to make a change.');
 if(action==='verify'&&(!canReview||!old||old.data.status!=='Submitted'))throw new ForbiddenError('Submit the payment details before an assigned payroll reviewer approves them.');
 const fields=action==='verify'?{...old!.data,signedDocumentId:String(input.signedDocumentId||old!.data.signedDocumentId||'')}:{...Object.fromEntries(bankInputFields.filter(k=>k!=='status'&&input[k]!==undefined).map(k=>[k,String(input[k]).trim()]))};
 const status=action==='verify'?'Verified':action==='submit'?'Submitted':'Draft';
 const next=createRecord({id,kind:'bank',personId,version:old?.version||0,data:{...fields,status}},old,viewer);
 validateBankFields(next.data,action!=='saveDraft');
 if(action==='submit'&&String(input.accountNumberConfirmation||'')!==String(next.data.accountNumber||''))throw new AppError('The account numbers do not match. Re-enter the account number.');
 if(action==='verify'){
  if(input.expectedBinding!==bankBinding(old!.data))throw new ConflictError('The displayed payment details changed. Save and submit the changes before approval.');
  if(input.reviewConfirmed!==true)throw new AppError('Confirm that the payment instructions and employee authorization match.');
  if(!bankHasElectronicAuthorization(old!.data,personId)&&!bankHasPaperAuthorization(next.data,personId,records))throw new AppError('The employee must authorize these details, or you must upload and verify their signed bank authorization.');
 }
 // Generic validation strips submitted audit claims and only carries genuine authorization when the account is unchanged.
 validateSave(old,next,viewer,finance,records);
 const at=new Date().toISOString();
 if(action==='submit'&&self){
  if(input.authorizationAccepted!==true||String(input.authorizationName||'').trim().length<2)throw new AppError('Enter your full name and authorize these direct deposit instructions.');
  next.data={...next.data,authorizationAccepted:true,authorizationName:String(input.authorizationName).trim().slice(0,160),authorizationAt:at,authorizationBy:personId,authorizationIdentity:viewer.id,authorizationVersion:BANK_AUTHORIZATION_VERSION,authorizationText:BANK_AUTHORIZATION_TEXT,authorizationBinding:bankBinding(next.data)};
 }
 if(next.data.routingNumber){
  const lookup=await lookupRouting(String(next.data.routingNumber));
  next.data={...next.data,institutionLookupStatus:lookup.status,institutionLookupSource:lookup.source,institutionLookupAt:lookup.checkedAt,institutionLookupRouting:lookup.routingNumber,institutionCity:lookup.city||'',institutionState:lookup.state||'',...(lookup.status==='Found'?{bankName:lookup.bankName}:{})};
  if(action==='verify'&&lookup.status!=='Found'&&String(input.reviewNote||'').trim().length<5)throw new AppError('Bank lookup could not confirm the institution. Record how you checked the ACH routing number and bank name before approving.');
 }
 if(action==='verify')next.data={...next.data,reviewConfirmation:true,reviewNote:String(input.reviewNote||'').trim().slice(0,1000)};
 await writeHrRecord(old,next,viewer,action==='verify'?'Approved Direct Deposit Instructions':action==='submit'?'Submitted Direct Deposit Instructions':'Saved Direct Deposit Draft');
 return json({record:bankSummary(next)},old?200:201);
 }catch(e){const f=safeFailure(e,'hr.bank.write');return json(f.body,f.status);}}
