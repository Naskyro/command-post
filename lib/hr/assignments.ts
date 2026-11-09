import type {HrRecord} from './model';
import type {FinRecord,Viewer} from '../finance/model';
import {damageFacts,damageFactFields} from '../ccr/damage-facts.ts';
import {prepareClaimOperations,operationalChanges} from '../ccr/claim-operations.ts';
import type {Row} from '../accounts/model';
import {hrCan} from './permissions.ts';
import {canAccess} from '../finance/access.ts';
import {AppError,ForbiddenError,ConflictError} from '../shared/errors.ts';
export const softwareOptions=['Adobe','ChatGPT','Towbook','TowCentric','GoDaddy','Square','Command Post','Indeed','Azuga','AtoB','Career Plug','Dialpad','Checkr','Gmail','Microsoft Apps','Auto Data Direct','Slack','Company Social Media - Meta'].sort();
export const assetTypes=['Laptop','Phone','Debit Card','Credit Card','Drill','Ladder','Tool','Keys','Other'].sort();
export const conditions=['New','Good','Fair','Damaged','Not Inspected'];
export function assignmentAccess(v:Viewer,id:string,people:FinRecord[],edit=false){return !v.onboardingOnly&&(['managePersonnel','manageOnboarding','manageOffboarding',...(!edit?['viewPersonnel']:[])].some(a=>hrCan(v,a,id,people)));}
export function claimAccess(v:Viewer,edit=false){return !v.onboardingOnly&&(v.owner||canAccess(v,'Compliance, Claims & Recovery','damage',edit));}
const val=(d:Record<string,unknown>,key:string,max=500)=>{const s=String(d[key]??'').trim();if(s.length>max)throw new AppError(key+' is too long.');return s;};
const day=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw new AppError('Enter a valid event date.');return s;};
export function planAssignment(body:Record<string,unknown>,v:Viewer,people:FinRecord[],records:HrRecord[],at=new Date().toISOString(),catalogAssets=assetTypes,claimAccounts:Row[]=[]){
 const old=records.find(r=>r.id===body.id),personId=String(old?.personId||body.personId||''),person=people.find(p=>p.kind==='person'&&p.id===personId);if(!person)throw new AppError('Choose an employee.');
 if(old&&Number(body.version)!==old.version)throw new ConflictError();
 const action=String(body.action||'save'),d=(body.data||{}) as Record<string,unknown>;
 if(!d||typeof d!=='object'||Array.isArray(d))throw new AppError('Enter valid details.');
 const base={personId,version:(old?.version||0)+1,createdAt:old?.createdAt||at,createdBy:old?.createdBy||v.name,updatedAt:at,updatedBy:v.name};
 if(action==='claimUpdate'){
  if(!claimAccess(v,true)||old?.kind!=='assetClaim')throw new ForbiddenError();
  const statement=val(d,'statement',4000),status=val(d,'status');if(!statement||!['Open','Investigating','Resolved','Closed - No Recovery'].includes(status))throw new AppError('Choose a status and add a case update.');
  const facts=damageFacts(d,old.data,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at)));
  if(body.details!==undefined&&(!body.details||typeof body.details!=='object'||Array.isArray(body.details)))throw new AppError('Enter valid case details.');
  const operational=body.details===undefined?{}:prepareClaimOperations(body.details as Record<string,unknown>,old.data,people,claimAccounts,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at)));
  const changes=operationalChanges(old.data,operational);
  const prior=Object.fromEntries(Object.entries(old.data).filter(([k])=>!(damageFactFields as readonly string[]).includes(k)));
  return [{...old,...base,data:{...prior,...facts,...operational,status,statements:[...(old.data.statements as unknown[]||[]),{statement,status,at,by:v.name,byId:v.id,...facts,...(Object.keys(changes).length?{operationalChanges:changes}:{})}]}}];
 }
 if(action==='acknowledge'){
  if(old?.kind!=='assignment'||old.data.type!=='Asset'||v.person!==personId)throw new ForbiddenError();
  if(!['Assigned','Missing','Not Returned'].includes(String(old.data.status)))throw new AppError('This assignment has already been returned.');
  const signature=val(d,'signatureName',150),condition=val(d,'condition'),received=d.received;
  if(!signature||d.consent!==true||typeof received!=='boolean'||!conditions.includes(condition))throw new AppError('Confirm receipt status, condition, your name, and acknowledgment.');
  return [{...old,...base,data:{...old.data,acknowledgments:[...(old.data.acknowledgments as unknown[]||[]),{signatureName:signature,received,condition,notes:val(d,'notes',2000),at,by:v.name,byId:v.id,consent:true,assignmentVersion:old.version}]}}];
 }
 if(action==='reportIncident'){
  if(!assignmentAccess(v,personId,people,true))throw new ForbiddenError();
  const title=val(d,'name',150),description=val(d,'notes',4000),reportedDate=day(val(d,'date'));
  if(!title||!description)throw new AppError('Enter the asset/damage and what was discovered.');
  return [{...base,id:'hrassetclaim:'+crypto.randomUUID(),kind:'assetClaim' as const,data:{title,status:'Open',employeeName:String(person.name),description,reportedDate,reportedById:v.id,source:'Post-Employment / Personnel Incident',discoveredAfterSeparation:person.status==='Former',statements:[{statement:description,status:'Open',at,by:v.name,byId:v.id}],financialAction:'No Liability or Payroll Deduction Authorized'}}];
 }
 if(!assignmentAccess(v,personId,people,true))throw new ForbiddenError();
 if(old&&old.kind!=='assignment')throw new AppError('Choose an assignment.');
 if(action==='save'){
  if(old)throw new AppError('Assignments are preserved. Record a return/removal and create a new assignment if needed.');
  if(person.status==='Former')throw new AppError('Do not issue new assets or access to a former employee.');
  const type=val(d,'type'),name=val(d,'name',150),date=day(val(d,'date'));
  if(!['Asset','Software'].includes(type)||!name)throw new AppError('Choose a type and enter its name.');
  if(type==='Software'&&records.some(r=>r.kind==='assignment'&&r.personId===personId&&r.data.type==='Software'&&String(r.data.name).toLowerCase()===name.toLowerCase()&&!['Removed','Cancelled'].includes(String(r.data.status))))throw new AppError('This software is already assigned. Update its existing access record.');
  const data:Record<string,unknown>={type,name,date,status:type==='Asset'?'Assigned':'Requested',notes:val(d,'notes',2000)};
  for(const k of type==='Asset'?['category','make','model','color','serial','assetTag','cardLast4','issuedCondition']:['account','accessLevel'])data[k]=val(d,k,200);
  if(type==='Asset'){
   if(!catalogAssets.includes(String(data.category))||!conditions.includes(String(data.issuedCondition)))throw new AppError('Choose the asset category and issued condition.');
   if(data.cardLast4&&!/^\d{4}$/.test(String(data.cardLast4)))throw new AppError('Enter only the last four card digits.');
   if(d.cost!==undefined&&d.cost!==''){const n=Number(d.cost);if(!Number.isFinite(n)||n<0||n>1e8||Math.abs(n*100-Math.round(n*100))>1e-6)throw new AppError('Enter a valid cost with up to two decimal places.');data.cost=n;}
  }
  if(type==='Asset'&&records.some(r=>r.kind==='assignment'&&r.data.type==='Asset'&&r.data.status!=='Returned'&&['serial','assetTag'].some(k=>data[k]&&String(r.data[k]).toLowerCase()===String(data[k]).toLowerCase())))throw new AppError('This serial number or asset tag is already assigned and has not been returned.');
  data.history=[{action:'Assigned',at,by:v.name,byId:v.id,date}];
  return [{...base,id:'hrassignment:'+crypto.randomUUID(),kind:'assignment' as const,data}];
 }
 if(action!=='outcome')throw new AppError('Choose a valid assignment action.');
 if(!old)throw new AppError('Assignment not found.');
 const date=day(val(d,'date')),note=val(d,'notes',2000),status=val(d,'status');
 const allowed=old.data.type==='Asset'?['Returned','Missing','Not Returned']:['Granted','Removed','Cancelled'];
 if(!allowed.includes(status))throw new AppError('Choose a valid outcome.');
 if(old.data.type==='Software'){
  if(['Removed','Cancelled'].includes(String(old.data.status))||status==='Granted'&&old.data.status!=='Requested'||status==='Cancelled'&&old.data.status!=='Requested')throw new AppError('This access record is already closed or the transition is invalid.');
  if(status==='Granted'&&person.status==='Former')throw new AppError('Do not grant access to a former employee.');
  if(old.data.name==='Command Post'&&status==='Removed'&&person.accountStatus!=='Disabled')throw new AppError('Disable Command Post access in Admin or End Employment first.');
  if(old.data.name==='Command Post'&&status==='Granted'&&person.accountStatus!=='Enabled')throw new AppError('Complete approved onboarding/account activation before marking Command Post granted.');
  if(!note)throw new AppError('Record the access role granted, or how removal/cancellation was verified.');
 }else if(old.data.status==='Returned')throw new AppError('This asset has already been returned.');
 if(date<String(old.data.date))throw new AppError('The outcome cannot predate the assignment.');
 const condition=status==='Returned'?val(d,'condition'):undefined;
 if(status==='Returned'&&!conditions.includes(String(condition)))throw new AppError('Choose the returned condition.');
 const problem=status==='Missing'||status==='Not Returned'||condition==='Damaged';
 if(problem&&!note)throw new AppError('Describe the missing item or damage for CCR.');
 const next:HrRecord={...old,...base,data:{...old.data,status,outcomeDate:date,...(condition?{returnedCondition:condition}:{}),history:[...(old.data.history as unknown[]||[]),{action:status,condition:condition||null,notes:note,date,at,by:v.name,byId:v.id}]}};
 const result=[next];
 if(problem&&!old.data.claimId){const id='hrassetclaim:'+old.id.split(':')[1];next.data.claimId=id;result.push({...base,id,kind:'assetClaim',version:1,createdAt:at,createdBy:v.name,data:{title:String(old.data.name)+' - '+(condition==='Damaged'?'Damage':'Missing / Not Returned'),status:'Open',assignmentId:old.id,employeeName:String(person.name),assetSnapshot:{...old.data,history:undefined},reportedDate:date,reportedById:v.id,description:note,source:'HR Asset Return',statements:[{statement:note,status:'Open',at,by:v.name,byId:v.id}],financialAction:'No Liability or Payroll Deduction Authorized'}});}
 return result;
}
export function outstandingAssignments(id:string,records:HrRecord[]){return records.filter(r=>r.kind==='assignment'&&r.personId===id&&(r.data.type==='Software'?!['Removed','Cancelled'].includes(String(r.data.status)):!['Returned','Reassigned','Replaced','Deleted'].includes(String(r.data.status))&&!r.data.claimId));}
