import type {FinRecord,Viewer} from '../finance/model';
import {displayPersonName} from '../people/display-name.ts';
import {grantsFor} from '../finance/access.ts';
import {managesPerson} from '../finance/timeclock.ts';
import {authorityLevelOf,authorityLevels} from '../people/policy.ts';
import {hasAdminPair} from './delegated-grants.ts';

export const delegationMinutes=15;
export const delegationCookie='__Host-command-view';
export const previewSignal='x-command-read-only';
// A non-secret restriction marker survives new tabs, native downloads and
// full-page navigation. It never authorizes access without the session cookie.
export const delegationQuery='_command_view';
// Only verified owners and individually approved branch administrators may start a review.
export function canStartDelegation(v:Viewer|undefined|null):boolean {
 if(!v||v.onboardingOnly||v.delegatedReadOnly)return false;
 return v.owner||v.customAccess===true&&v.directDelegationApproved===true&&hasAdminPair(v.access||[]);
}
const rank=(p:FinRecord)=>authorityLevels.findIndex(level=>level===authorityLevelOf(p))+1||({Owner:4,'Department Head':3,Supervisor:2,Employee:1}[String(p.role)]||0);
export function eligibleTarget(actor:Viewer,p:FinRecord,records:FinRecord[]):boolean {
 if(!canStartDelegation(actor)||p.kind!=='person'||p.id===actor.person||['jerson','jendel','jeidy'].includes(p.id)||p.role==='Owner'||p.workerType==='Owner'||p.accountStatus==='Disabled'||p.commandSignInRevoked===true||!['Active','Onboarding'].includes(String(p.status)))return false;
 if(actor.owner)return true;
 const self=records.find(r=>r.kind==='person'&&r.id===actor.person);
 return !!self&&self.status==='Active'&&self.accountStatus!=='Disabled'&&rank(p)>0&&rank(self)>rank(p)&&
   !grantsFor(p).some(g=>g.module==='Admin')&&managesPerson(actor,p.id,records);
}
export function targetSummary(p:FinRecord){
 return {person:p.id,name:displayPersonName(p),department:String(p.department||''),role:String(p.role||'Employee'),status:String(p.status||''),title:String(p.title||'')};
}
export type DelegationState={state:'active';subjectName:string;subjectId:string;actorName:string;expiresAt:string}|{state:'ended';reason:string};
export function cookieToken(headers:Headers):string|null {
 const values=(headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.split('=',1)[0]===delegationCookie);
 if(!values.length)return null;
 const raw=values[0].slice(delegationCookie.length+1);
 return values.length===1&&/^[a-f0-9]{64}$/.test(raw)?raw:'invalid';
}
// Reviewed reads use the ordinary endpoint's permission and record filtering as
// the selected employee. New routes remain closed until reviewed. In particular,
// authentication and OAuth callbacks are not reads just because they use GET.
export const delegatedReadPaths=new Set([
 '/api/home','/api/notifications','/api/announcements','/api/site-announcements','/api/site-themes',
 '/api/accounts','/api/accounts/view','/api/accounts/history','/api/accounts/files',
 '/api/accounts/court','/api/accounts/court/files','/api/accounts/google',
 '/api/accounts/dashboard','/api/accounts/dashboard/courts','/api/accounts/dashboard/layout',
 '/api/accounts/portfolio-reports',
 '/api/finance','/api/finance/files','/api/people','/api/people/names','/api/people/details','/api/people/education','/api/people/photo',
 '/api/hr','/api/hr/files','/api/hr/bank','/api/hr/concerns','/api/hr/assignments','/api/hr/assignment-catalog',
 '/api/hr/damage-claims','/api/hr/accident-reports','/api/hr/accident-reports/files','/api/hr/accident-reports/print',
 '/api/hr/hiring','/api/hr/hiring/choices','/api/hr/inventory','/api/hr/job-descriptions','/api/hr/job-descriptions/pdf',
 '/api/hr/onboarding-sop','/api/hr/pay-agreements','/api/hr/performance-examples','/api/hr/performance/sop-options','/api/hr/sop-signatures',
 '/api/ccr/overview','/api/ccr/expense','/api/ccr/damage-choices','/api/ccr/damage-intake',
 '/api/ccr/damage-intake/attachment-inventory','/api/ccr/damage-intake/correspondence','/api/ccr/damage-intake/documents',
 '/api/ccr/damage-intake/photo-previews',
 '/api/ccr/docket','/api/ccr/docket/counsel','/api/ccr/docket/directory','/api/ccr/docket/file',
 '/api/ccr/personnel','/api/ccr/personnel/files','/api/ccr/register','/api/ccr/register/correspondence',
 '/api/ccr/register/file',
 '/api/ccr/reports','/api/ccr/reports/hearings','/api/ccr/source-desk',
 '/api/drive','/api/drive/files','/api/relationships/photo','/api/reports',
 '/api/safety','/api/safety/files','/api/sales','/api/sales/email','/api/sales/property-photo','/api/sales/routes',
 '/api/school','/api/school/achievements','/api/school/certificate','/api/school/cover','/api/school/media','/api/school/personnel','/api/school/source',
 '/api/sop','/api/sop/onboarding','/api/sop/pdf','/api/source-files','/api/source-records/hr','/api/year-history',
 '/api/admin/access-templates','/api/admin/activity','/api/admin/users',
]);
export function delegateRequestAction(req:Request):'normal'|'control'|'project'|'read'|'shell'|'asset'|'deny' {
 const u=new URL(req.url),path=u.pathname;
 if(path==='/api/delegated-access'&&!u.search)return 'control';
 if(cookieToken(req.headers)===null&&!req.headers.has(previewSignal)&&!u.searchParams.has(delegationQuery))return 'normal';
 if(req.method!=='GET'&&req.method!=='HEAD')return 'deny';
 if(req.headers.has('next-action')||req.headers.has('x-vinext-action')||req.headers.has('x-rsc-action'))return 'deny';
 if(req.method==='GET'&&['/api/session','/api/user-settings','/api/delegated-access/workspace'].includes(path))return 'project';
 if(delegatedReadPaths.has(path))return 'read';
 if(['/', '/.rsc', '/people/accident-followups', '/people/accident-followups.rsc'].includes(path))return 'shell';
 // Only known application bundles, branding and theme art are required to render
 // this shell. Never forward auth headers on these requests or send them to a route.
 if(/^\/(assets|_next\/static|theme-art|theme-photography|images)\/[\w.\/-]+$/.test(path)||/^\/vendor\/sop-pdfjs\/5\.6\.205\/[\w.\/-]+$/.test(path)||['/favicon.svg','/pte-road.svg'].includes(path))return 'asset';
 return 'deny';
}
export function restricted(text='Delegated Access is for inspecting this employee’s screens. Return to Admin to make changes or use an account action.',status=403){
 return Response.json({error:text,readOnly:true},{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
}
export function delegatedReadResponse(req:Request,res:Response){
 const h=new Headers(res.headers);h.set('Cache-Control','private, no-store');h.set('X-Command-Read-Only','1');h.delete('Set-Cookie');
 const vary=(h.get('Vary')||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!vary.some(s=>s.toLowerCase()==='cookie'))vary.push('Cookie');h.set('Vary',vary.join(', '));
 const location=h.get('Location');
 if(location){
  const target=new URL(location,req.url);
  if(target.origin===new URL(req.url).origin){target.searchParams.set(delegationQuery,'1');h.set('Location',target.toString());}
 }
 return new Response(req.method==='HEAD'?null:res.body,{status:res.status,headers:h});
}
