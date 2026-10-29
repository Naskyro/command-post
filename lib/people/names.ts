import type {FinRecord,Viewer} from '@/lib/finance/model';
import {departments} from '@/lib/finance/model';
import {canAccess,grantsFor} from '@/lib/finance/access';
import {managesPerson} from '@/lib/finance/timeclock';
import {AppError,ForbiddenError,ConflictError} from '@/lib/shared/errors';
const canManageDirectory=(v:Viewer)=>v.owner||canAccess(v,'People & HR','hiring',true)||canAccess(v,'People & HR','people',true)||canAccess(v,'Account Management','relationships',true)||canAccess(v,'Accounts','notes',true);
export const canAddStaffName=(v:Viewer)=>canManageDirectory(v);
export const canEditStaffName=(v:Viewer,p:FinRecord,all:FinRecord[])=>canManageDirectory(v)&&(v.owner||managesPerson(v,p.id,all)||canAccess(v,'Account Management','relationships',true)||canAccess(v,'Accounts','notes',true));
export function staffNameData(all:FinRecord[],v:Viewer){return {canAdd:canAddStaffName(v),departments:canManageDirectory(v)?departments:[v.department],people:all.filter(p=>p.kind==='person').map(p=>({id:p.id,version:p.version,name:String(p.name),department:String(p.department||''),title:String(p.title||''),status:String(p.status||''),hidden:p.nameHidden===true,canEdit:canEditStaffName(v,p,all)}))};}
export function prepareStaffName(body:Record<string,unknown>,all:FinRecord[],v:Viewer){
 const action=String(body.action||''),id=String(body.id||''),old=all.find(p=>p.kind==='person'&&p.id===id);
 if(!['add','edit','hide','restore'].includes(action))throw new AppError('Choose a name action.');
 if(action==='add'){if(!canAddStaffName(v))throw new ForbiddenError();if(old)throw new ConflictError();}
 else {if(!old)throw new AppError('Name not found.',404);if(!canEditStaffName(v,old,all))throw new ForbiddenError();if(body.version!==old.version)throw new ConflictError();}
 const next:FinRecord=old?{...old}:{id:crypto.randomUUID(),kind:'person',version:0,status:'Active',role:'Employee',accountStatus:'Disabled',accessMode:'Custom',access:[],payType:'Pending method',rate:0,netTarget:0,exempt:false,workerType:'Employee',supervisor:v.person};
 if(action==='hide'||action==='restore')next.nameHidden=action==='hide';
 else {
  for(const key of ['name','department','title']){const raw=body[key];if(typeof raw!=='string'||raw.length>150)throw new AppError('Enter a valid '+key+'.');next[key]=raw.trim();}
  if(!next.name)throw new AppError('Enter a name.');
  if(!departments.includes(String(next.department))||!canManageDirectory(v)&&next.department!==v.department)throw new AppError('Choose a department you manage.');
  if(all.some(p=>p.kind==='person'&&p.id!==next.id&&String(p.name).trim().toLowerCase()===String(next.name).toLowerCase()))throw new AppError('That name already exists. Restore or edit the existing entry.');
  // A job reassignment updates the directory without silently changing sign-in access.
  if(old&&old.department!==next.department){next.accessMode='Custom';next.access=grantsFor(old);}
 }
 return {old,next,reason:action==='add'?'Added staff name from a form':action==='hide'?'Removed name from dropdown lists':action==='restore'?'Restored name to dropdown lists':'Updated staff name / job assignment from a form'};
}
