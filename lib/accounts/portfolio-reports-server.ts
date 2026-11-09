import {context} from './server';
import {financeDb} from '@/db/finance';
import {access,head} from './policy';
import {vehicles} from './vehicle-rows';
import {importedPayments} from './history';
import {canAccess} from '../finance/access';
import type {Viewer} from '../finance/model';
import type {Row} from './model';
import {publicPersonIdentity} from '../people/display-name';
import {businessToday} from '../year-history/model';
import {inPortfolio} from './today-brief';
import {ForbiddenError,AppError} from '../shared/errors';
import {definitions} from './portfolio-reports-catalog';
import {buildPortfolioReport,operational,reportDay} from './portfolio-reports-engine';
import type {PortfolioCatalog,PortfolioReportResult} from './portfolio-reports-types';
const core=(v:Viewer)=>!v.onboardingOnly&&Boolean(v.person)&&canAccess(v,'Account Management','accounts')&&canAccess(v,'Account Management','performance');
function allowed(v:Viewer,area:string){
 const am=(tab:string)=>canAccess(v,'Account Management',tab);
 if(area==='opportunities')return am('opportunities')||canAccess(v,'Sales CRM','opportunities');
 if(area==='relationships')return am('relationships');
 if(area==='activity')return am('activity')||am('interactions');
 if(area==='claims')return am('claims')||canAccess(v,'Compliance, Claims & Recovery','damage');
 if(area==='courtesy')return am('courtesy')||canAccess(v,'Accounts','courtesy');
 if(area==='workOrders')return am('work')||canAccess(v,'Work Orders','orders');
 return access(v,area);
}
// At 06:00 UTC it is either midnight or 1am in Austin. Back up the observed hour to local midnight.
const localHour=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',hourCycle:'h23'});
function boundary(day:string){const ref=new Date(day+'T06:00:00Z');return new Date(+ref-Number(localHour.format(ref))*3600000).toISOString();}
export async function propertyUpdateCounts(ids:string[],from:string,to:string){
 const counts:Record<string,number>={};if(!ids.length)return counts;
 const lo=boundary(from),hi=boundary(new Date(Date.parse(to+'T12:00Z')+86400000).toISOString().slice(0,10)),db=financeDb();
 // No audit payloads, editor identities, or field values are read or exported.
 for(let i=0;i<ids.length;i+=75){const batch=ids.slice(i,i+75),sql='SELECT account_id, COUNT(*) AS n FROM account_audit WHERE record_id=account_id AND before IS NOT NULL AND at>=? AND at<? AND account_id IN ('+batch.map(()=>'?').join(',')+') GROUP BY account_id';
 const res=await db.prepare(sql).bind(lo,hi,...batch).all<{account_id:string;n:number}>();for(const r of res.results)counts[r.account_id]=r.n;}
 return counts;
}
export async function loadPortfolioReport(req:Request,q:URLSearchParams,onViewer?:(v:Viewer)=>void):Promise<PortfolioCatalog|PortfolioReportResult>{
 const {all,staff,viewer:v}=await context(req);
 if(!core(v))throw new ForbiddenError('Property reports require Accounts and Property Results access.');
 const leadership=head(v,staff),requested=q.has('scope')?String(q.get('scope')):leadership?'':v.person,day=businessToday();
 const defs=definitions.filter(d=>d.areas.every(a=>allowed(v,a)));
 const allAccounts=all.filter(a=>a.kind==='account'&&operational(a));
 const repIds=new Set(allAccounts.map(a=>a.assignee).concat(allAccounts.filter(a=>reportDay(a.backupUntil)>=day).map(a=>a.backup)));
 const scopes=leadership?[{id:'',name:'Department Portfolio'},...staff.filter(s=>s.kind==='person'&&(repIds.has(s.id)||s.id===v.person||s.status==='Active'&&s.department==='Account Managers')).map(s=>({id:s.id,name:publicPersonIdentity(s).name})).sort((a,b)=>a.name.localeCompare(b.name))]:[{id:v.person,name:v.name}];
 const scope=scopes.find(s=>s.id===requested);if(!scope)throw new ForbiddenError('This portfolio is outside your assigned scope.');
 const portfolio=allAccounts.filter(a=>inPortfolio(a,requested,day)),propertyId=q.get('account')||'',id=q.get('id')||'';
 if(propertyId&&!portfolio.some(a=>a.id===propertyId))throw new ForbiddenError('This property is outside your assigned scope.');
 const accounts=portfolio.filter(a=>!propertyId||a.id===propertyId),ids=new Set(accounts.map(a=>a.id)),payments=importedPayments.filter(p=>ids.has(p.accountId));
 const latestPayment=payments.reduce((max,p)=>!p.void&&reportDay(p.paymentDate)&&p.paymentDate<=day&&p.paymentDate>max?p.paymentDate:max,'');
 const defaultTo=day,defaultFrom=day.slice(0,4)+'-01-01';
 if(!id)return {catalog:defs.map(({areas,...d})=>d),scopes,defaultScope:requested,properties:portfolio.map(a=>({id:a.id,name:a.name})).sort((a,b)=>a.name.localeCompare(b.name)),today:day,defaultFrom,defaultTo,latestPayment};
 const d=definitions.find(d=>d.id===id);if(!d)throw new AppError('Unknown portfolio report.',404);if(!defs.includes(d))throw new ForbiddenError('You do not have access to one or more sources in this report.');
 const from=q.get('from')||defaultFrom,to=q.get('to')||defaultTo,days=Number(q.get('days')||'30'),term=(q.get('term')||'').trim();
 if(d.mode==='period'&&(!reportDay(from)||!reportDay(to)||from>to||to>day||from<'1900-01-01'||Date.parse(to)-Date.parse(from)>366*30*86400000))throw new AppError('Choose a valid date range of up to 30 years ending today or earlier.');
 if(d.mode==='recency'&&(!Number.isInteger(days)||days<1||days>3650))throw new AppError('Use a lookback of 1 to 3,650 days.');
 if(term.length>80)throw new AppError('Search terms must be 80 characters or fewer.');
 // Source collections are limited before computing any rows, coverage dates, record counts or export.
 const kinds=new Set<string>(['financial']);if(d.areas.includes('workOrders'))kinds.add('workOrder');if(d.areas.includes('activity'))kinds.add('activity');
 if(d.areas.includes('claims'))kinds.add('claim');if(d.areas.includes('courtesy'))kinds.add('courtesy');if(d.areas.includes('safety'))kinds.add('trespass');
 let records=all.filter(r=>kinds.has(r.kind)&&ids.has(String(r.accountId))&&operational(r));
 if(d.areas.includes('relationships')){
  const affiliations=all.filter(r=>r.kind==='affiliation'&&ids.has(String(r.accountId))&&operational(r));
  const people=new Set(affiliations.map(a=>a.contactId)),companies=new Set(accounts.map(a=>a.companyId));
  records=records.concat(affiliations,all.filter(r=>r.kind==='contact'&&people.has(r.id)||r.kind==='company'&&companies.has(r.id)).filter(operational));
 }
 if(d.areas.includes('opportunities'))records=records.concat(all.filter(r=>r.kind==='opportunity'&&ids.has(String(r.onboardingAccountId))&&operational(r)));
 const profileEdits=['activity-return','effort-review'].includes(d.id)?await propertyUpdateCounts([...ids],from,to):undefined;
 onViewer?.(v);
 return buildPortfolioReport({definition:d,accounts,records,vehicles:vehicles(all).filter(v=>ids.has(String(v.accountId))),payments,from,to,asOf:day,days,scope:scope.name+(propertyId?' · '+accounts[0].name:''),generatedAt:new Date().toISOString(),term,profileEdits});
}
