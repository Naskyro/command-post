import {NextRequest,NextResponse} from 'next/server';
import {allRecords,persist} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {canUseHiring,canCreateVacancyInDepartment} from '@/lib/hr/hiring';
import {positionCatalog} from '@/lib/hr/job-catalog';
import {canManageDepartments,departmentFor} from '@/lib/people/departments';
import {readHrRecords,mutateHr} from '@/lib/hr/server';
import {getPayCatalog,revisePayChoice,vacancyCatalogId} from '@/lib/hr/vacancy-choices';
import {ConflictError,AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
async function context(req:NextRequest){
 const rows=await allRecords(),viewer=financeIdentity(req.headers,rows);
 if(viewer.onboardingOnly||(!canUseHiring(viewer)&&!positionCatalog(viewer,rows)))throw new ForbiddenError();
 const positions=positionCatalog(viewer,rows,true),department=canManageDepartments(viewer,rows);
 const pay=positions||canUseHiring(viewer,true)&&(viewer.owner||viewer.hrResponsibilities?.some(r=>r.action==='manageOnboarding'&&r.scope==='Company'));
 return {rows,viewer,positions,department,pay:!!pay};
}
export async function GET(req:NextRequest){try{
 const c=await context(req),r=c.rows.find(v=>v.id===vacancyCatalogId);
 return json({choices:getPayCatalog(c.rows),version:r?.version||0,canEdit:c.pay,canManagePositions:c.positions,canManageDepartments:c.department,
  positions:c.positions?(await readHrRecords()).filter(r=>r.kind==='position').map(r=>({id:r.id,label:r.data.title,active:r.data.status==='Active',version:r.version,department:String(departmentFor(c.rows,r.data.department)?.name||r.data.department||'')})):[],
  departments:c.department?c.rows.filter(r=>r.kind==='department').map(r=>({id:r.id,label:r.name,active:r.status!=='Retired',selectable:canCreateVacancyInDepartment(c.viewer,r),version:r.version})):[]
 });
 }catch(e){const f=safeFailure(e,'hiring.choices.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('sec-fetch-site')==='cross-site'||(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin))throw new ForbiddenError();
 const c=await context(req),b=await readPayload(req);
 if(b.kind==='position'){if(!c.positions)throw new ForbiddenError();const hr=await readHrRecords(),original=hr.filter(r=>r.kind==='position'),
  old=original.find(r=>r.id===b.id),action=String(b.action||'');
  if(!['add','rename','retire','restore'].includes(action))throw new AppError('Choose a position action.');
  if(action!=='add'&&!old)throw new AppError('Choose a position.');
  if((action==='add'?0:old!.version)!==b.version)throw new ConflictError();
  const title=action==='add'||action==='rename'?String(b.label||'').trim():String(old?.data.title||'');
  if(!title||title.length>150)throw new AppError('Enter a position name of 1–150 characters.');
  const department=c.rows.find(r=>r.kind==='department'&&r.id===b.departmentId&&r.status!=='Retired');
  if(action==='add'&&!department)throw new AppError('Select an active department for this position.');
  const deptName=department?.name||old?.data.department;
  if((action==='add'||action==='rename')&&original.some(r=>r.id!==old?.id&&r.data.department===deptName&&String(r.data.title).toLowerCase()===title.toLowerCase()))throw new AppError('This department already has a position with that name.');
  const rec=await mutateHr({action:'save',kind:'position',version:b.version,id:action==='add'?crypto.randomUUID():old!.id,data:{...old?.data,title,department:action==='add'?deptName:old?.data.department,status:action==='retire'?'Retired':action==='restore'||action==='add'?'Active':old?.data.status}},c.viewer,c.rows,hr);
  return json({id:rec.id});}
 if(b.kind!=='pay'||!c.pay)throw new ForbiddenError();
 const old=c.rows.find(r=>r.id===vacancyCatalogId);if(b.version!==(old?.version||0))throw new ConflictError('These choices changed. Reload choices before saving.');
 const id=b.action==='add'?crypto.randomUUID():String(b.id||''),choices=revisePayChoice(getPayCatalog(c.rows),b,id);
 const saved=await persist(old,{id:vacancyCatalogId,kind:'hrVacancyChoices',version:old?.version||0,choices},c.viewer,'Vacancy pay choice: '+String(b.action));
 return json({id,choices,version:saved.version});
 }catch(e){const f=safeFailure(e,'hiring.choices.write');return json(f.body,f.status);}}
