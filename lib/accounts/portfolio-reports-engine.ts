import type {Row} from './model';
import {businessDate} from '../year-history/model.ts';
import type {Definition} from './portfolio-reports-catalog';
import type {PortfolioReportResult,PortfolioColumn,PortfolioReportRow} from './portfolio-reports-types';
export type ReportPayment={id?:string;accountId:string;cents:number;paymentDate:string;void?:boolean};
export type ReportInput={definition:Definition;accounts:Row[];records:Row[];vehicles:Row[];payments:ReportPayment[];from:string;to:string;asOf:string;days:number;scope:string;generatedAt:string;term?:string;profileEdits?:Record<string,number>};
const txt=(v:unknown)=>typeof v==='string'?v.trim():'';
export function reportDay(v:unknown){const s=txt(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T12:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===s?s:'';}
export const operational=(r:Row)=>!r.deletedAt&&!r.example&&!r.sample&&!r.isSample&&!r.trainingSample&&!r.isDemo&&!r.id.startsWith('sales-example:')&&r.status!=='Deleted';
const n=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const num=(v:unknown)=>n(v)??0;
const amt=(v:unknown)=>n(v)===null?null:Math.round(Number(v)*100);
const rounded=(n:number)=>Math.round(n*100)/100;
const ts=(s:string)=>Date.parse(s+'T12:00:00Z');
const daysBetween=(a:string,b:string)=>Math.round((ts(b)-ts(a))/86400000);
const active=(a:Row)=>a.status==='Active';
const category=(v:unknown)=>txt(v).replace(/\s*\(.*$/,'').trim();
const isApartment=(a:Row)=>['Residential','Mixed use','Mixed','Mixed Use'].includes(txt(a.propertyType));
const prop=(a:Row)=>({property:a.name,service:txt(a.service)||'Unconfirmed',status:txt(a.status)||'Unconfirmed'});
const row=(values:PortfolioReportRow['values'],accountId?:string):PortfolioReportRow=>({values,...(accountId?{accountId}:{})});
const C=(key:string,label:string,format:PortfolioColumn['format']='text'):PortfolioColumn=>({key,label,format});
const P=C('property','Property'),S=C('service','Current Service'),ST=C('status','Current Status'),REV=C('revenue','Net Collections','money'),PAY=C('payments','Payments','integer'),EXP=C('expense','Recorded Expenses','money'),RET=C('contribution','Recorded Contribution','money'),VEH=C('vehicles','Vehicle Calls','integer'),CONF=C('tows','Confirmed Tows','integer'),INT=C('intake','Intake Date Only','integer'),MON=C('month','Month'),VIS=C('visits','Onsite Visits','integer'),ACT=C('activities','Logged Activities','integer');
const financialNote='Net collections use nonvoid Towbook payments by payment date, including signed refunds. Manual revenue entries are not added because they may duplicate Towbook receipts.';
const contributionNote='Recorded contribution = net collections less recorded property expense, repair, signage, and sponsorship entries. It is not net profit. A blank contribution means missing cost or collection coverage. Payroll, fuel, overhead, concessions, settlements, and work-order estimates are not independently deducted. Include an incurred cost once in the account expense ledger.';
const vehicleNote='Each unique Towbook vehicle call uses its confirmed tow date. If missing, its intake/received date is counted separately. Intake and payment dates never substitute for tow dates when analyzing patrol or service.';
const ended=new Set(['Voided','Canceled','Cancelled','Deleted']);
const concessionTypes=new Set(['Full courtesy','Reduced charge','Refund','Unclassified']);
function latest(a:string,b:string){return a>b?a:b;}
export function buildPortfolioReport(input:ReportInput):PortfolioReportResult{
 const {definition:d,asOf,scope,generatedAt,days}=input,alltime=d.mode==='all-time',from=alltime?'0001-01-01':input.from,to=alltime?asOf:input.to;
 const inPeriod=(s:unknown)=>{const day=reportDay(s);return !!day&&day>=from&&day<=to;};
 const accounts=input.accounts.filter(operational),byId=new Map(accounts.map(a=>[a.id,a])),ids=new Set(byId.keys());
 const records=input.records.filter(operational),owned=records.filter(r=>ids.has(txt(r.accountId))),payments=input.payments.filter(p=>ids.has(p.accountId)&&!p.void&&Number.isSafeInteger(p.cents)&&reportDay(p.paymentDate)&&p.paymentDate<=asOf);
 const firstPay=payments.reduce((a,p)=>a<p.paymentDate?a:p.paymentDate,'9999'),lastPay=payments.reduce((a,p)=>latest(a,p.paymentDate),'');
 const moneyCoverage=!!lastPay&&from<=lastPay&&to>=firstPay;
 const stats=new Map(accounts.map(a=>[a.id,{cents:0,payments:0,tows:0,intake:0,undated:0,weekend:0,weekdays:0,expense:0,costCount:0,expenses:{Expense:0,Signage:0,Repair:0,Sponsorship:0},activities:0,profileEdits:Math.max(0,Math.trunc(num(input.profileEdits?.[a.id]))),visits:0,lastVisit:'',lastPeriodVisit:'',lastTow:'',lastIntake:''}]));
 const stat=(a:Row)=>stats.get(a.id)!;
 const time=new Map<string,{revenue:number;payments:number;tows:number;intake:number}>();
 const timeKey=(s:string)=>d.id==='seasonal'?s.slice(0,4)+' Q'+Math.ceil(Number(s.slice(5,7))/3):s.slice(0,7);
 const timeBucket=(s:string)=>{const key=timeKey(s);if(!time.has(key))time.set(key,{revenue:0,payments:0,tows:0,intake:0});return time.get(key)!;};
 for(const p of payments){if(!inPeriod(p.paymentDate))continue;const st=stats.get(p.accountId)!;st.cents+=p.cents;st.payments++;const b=timeBucket(p.paymentDate);b.revenue+=p.cents;b.payments++;}
 const calls=new Map(input.vehicles.map(r=>[r.id,r]));
 for(const v of calls.values()){const st=stats.get(txt(v.accountId));if(!st||!operational(v))continue;const tow=reportDay(v.towDate),rec=reportDay(v.receivedDate);if(tow&&tow<=asOf)st.lastTow=latest(tow,st.lastTow);if(rec&&rec<=asOf)st.lastIntake=latest(rec,st.lastIntake);if(tow&&inPeriod(tow)){st.tows++;const weekday=new Date(ts(tow)).getUTCDay();if(weekday===6||weekday===0)st.weekend++;else st.weekdays++;timeBucket(tow).tows++;}else if(!tow&&rec&&inPeriod(rec)){st.intake++;timeBucket(rec).intake++;}else if(!tow&&!rec)st.undated++;}
 for(const r of owned){const st=stats.get(String(r.accountId))!;if(r.kind==='financial'&&r.status==='Recorded'&&Object.hasOwn(st.expenses,txt(r.type))&&inPeriod(r.date)&&amt(r.amount)!==null){const cents=amt(r.amount)!;st.expense+=cents;st.expenses[r.type as keyof typeof st.expenses]+=cents;st.costCount++;}
  if(r.kind==='activity'&&reportDay(r.date)&&String(r.date)<=asOf&&!ended.has(txt(r.status))&&r.response!=='Scheduled'&&r.status!=='Scheduled'){const date=String(r.date),onsite=r.channel==='Onsite visit';if(onsite)st.lastVisit=latest(date,st.lastVisit);if(inPeriod(date)){st.activities++;if(onsite){st.visits++;st.lastPeriodVisit=latest(date,st.lastPeriodVisit);}}}
 }
 const finance=(a:Row)=>{const st=stat(a);return {revenue:moneyCoverage?st.cents/100:null,payments:st.payments,expense:st.costCount?st.expense/100:null,contribution:st.costCount&&moneyCoverage?(st.cents-st.expense)/100:null};};
 const report:PortfolioReportResult={id:d.id,title:d.title,description:d.description,category:d.category,period:alltime?'All Recorded History Through '+asOf:d.mode==='snapshot'?'Current as of '+asOf:d.mode==='recency'?days+'-Day Lookback Through '+asOf:from+' to '+to,scope,generatedAt,columns:[],rows:[],notes:[],summary:[]};
 const addNote=(s:string)=>{if(s&&!report.notes.includes(s))report.notes.push(s);};
 const fill=(cols:PortfolioColumn[],rows:PortfolioReportRow[])=>{report.columns=cols;report.rows=rows;};
 const cmp=(key:string,asc=false)=>(a:PortfolioReportRow,b:PortfolioReportRow)=>{const x=a.values[key],y=b.values[key];return x==null?y==null?String(a.values.property||'').localeCompare(String(b.values.property||'')):1:y==null?-1:typeof x==='number'&&typeof y==='number'?(asc?x-y:y-x)||String(a.values.property||a.values.group||'').localeCompare(String(b.values.property||b.values.group||'')):String(x).localeCompare(String(y));};
 const summarize=(label:string,value:string|number)=>report.summary.push({label,value:String(value)});
 const props=(as:Row[],fn:(a:Row)=>PortfolioReportRow['values'])=>as.map(a=>row({...prop(a),...fn(a)},a.id));
 const asMoney=(s:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(s);
 if(['top-revenue','revenue-ranking','full-patrol','call-in','basic-patrol','least-producing','revenue-per-unit'].includes(d.id)){
  const filter=({'full-patrol':'Full Patrol','call-in':'Call In','basic-patrol':'Basic Patrol'} as Record<string,string>)[d.id];
  const subset=accounts.filter(a=>filter?active(a)&&category(a.service)===filter:d.id==='least-producing'?active(a):d.id==='revenue-per-unit'?isApartment(a)&&num(a.units)>0:true);
  let results=props(subset,a=>({...finance(a),units:n(a.units),perUnit:moneyCoverage&&num(a.units)>0?rounded(stat(a).cents/100/num(a.units)):null}));
  if(!['least-producing','revenue-per-unit','revenue-ranking'].includes(d.id))results=results.filter(r=>num(r.values.payments)>0);
  results.sort(cmp(d.id==='revenue-per-unit'?'perUnit':'revenue',d.id==='least-producing'));if(filter)results=results.slice(0,10);
  fill([P,S,...(d.id==='revenue-per-unit'?[C('units','Current Units','integer'),C('perUnit','Collections per Unit','money')]:[ST]),REV,PAY],results);
  if(filter)addNote('Top ten active accounts using the current service classification; includes only accounts with recorded payments in this period.');
  if(d.id==='least-producing')addNote('Includes active accounts without matching payments. Zero means no recorded collections in the covered period, not proven lost revenue.');
 }else if(['vehicle-ranking','all-vehicles'].includes(d.id)){
  const a=props(accounts,a=>{const s=stat(a);return {vehicles:s.tows+s.intake+(alltime?s.undated:0),tows:s.tows,intake:s.intake,undated:s.undated}}).filter(r=>alltime?num(r.values.vehicles)>0:true).sort(cmp('vehicles'));
  fill([P,S,VEH,CONF,INT,...(alltime?[C('undated','No Event Date','integer')]:[])],a);addNote(vehicleNote);
 }else if(d.id==='unit-size'){
  fill([P,S,ST,C('units','Apartment Units','integer')],props(accounts.filter(a=>isApartment(a)&&num(a.units)>0),a=>({units:n(a.units)})).sort(cmp('units')));
  summarize('Unit Count Not Recorded',accounts.filter(a=>isApartment(a)&&num(a.units)<=0).length);addNote('Uses the current residential or mixed-use property profile. Properties without a positive unit count are excluded from the ranking.');
 }else if(d.id==='monthly-production'||d.id==='seasonal'){
  // Include empty months between selected boundaries; blank money outside observed payment coverage.
  for(let m=from.slice(0,7)+'-01';m<=to;){timeBucket(m);const dt=new Date(ts(m));dt.setUTCMonth(dt.getUTCMonth()+1);m=dt.toISOString().slice(0,10);}
  fill([C('period',d.id==='seasonal'?'Year / Quarter':'Month'),REV,PAY,CONF,INT],Array.from(time).sort(([a],[b])=>a.localeCompare(b)).map(([k,b])=>row({period:k,revenue:lastPay&&k>=timeKey(firstPay)&&k<=timeKey(lastPay)?b.revenue/100:null,payments:b.payments,tows:b.tows,intake:b.intake})));addNote(vehicleNote);addNote('The first and last buckets may be partial. A blank revenue cell falls outside the available payment history.');
 }else if(d.id==='weekend'){
  let weekendDays=0,weekDays=0;for(let day=ts(from);day<=ts(to);day+=86400000){[0,6].includes(new Date(day).getUTCDay())?weekendDays++:weekDays++;}
  const results=props(accounts.filter(a=>['Full Patrol','Basic Patrol'].includes(category(a.service))&&active(a)),a=>{const s=stat(a),w=weekendDays?s.weekend/weekendDays:null,h=weekDays?s.weekdays/weekDays:null,basis=s.tows+s.intake;
   const enough=s.tows>=10&&basis>0&&s.tows/basis>=0.8&&weekendDays>=2&&weekDays>=5;
   return {tows:s.tows,intake:s.intake,weekend:s.weekend,weekday:s.weekdays,wRate:w!==null?rounded(w):null,dRate:h!==null?rounded(h):null,gap:w!==null&&h!==null?rounded(w-h):null,coverage:basis?rounded(s.tows*100/basis):null,signal:!enough?'Insufficient Evidence':w!>h!?'Higher Weekend Rate':w!<h!?'Higher Weekday Rate':'Equal Rates'};}).sort((a,b)=>Number(b.values.signal==='Higher Weekend Rate')-Number(a.values.signal==='Higher Weekend Rate')||Number(a.values.signal==='Insufficient Evidence')-Number(b.values.signal==='Insufficient Evidence')||cmp('gap')(a,b)||cmp('tows')(a,b));
  fill([P,C('signal','Observed Pattern'),CONF,INT,C('coverage','Confirmed Date Coverage','percent'),C('weekend','Weekend Tows','integer'),C('weekday','Weekday Tows','integer'),C('wRate','Tows per Weekend Day','decimal'),C('dRate','Tows per Weekday','decimal')],results);
  addNote(vehicleNote);addNote('Saturday–Sunday vs. Monday–Friday. The chosen period contains '+weekendDays+' weekend days and '+weekDays+' weekdays. A pattern requires ≥10 confirmed tows, ≥80% dated coverage, ≥2 weekend days, and ≥5 weekdays. Rates are per calendar day, not per patrol hour. Check approved patrol windows before dispatching.');
 }else if(d.id==='completed-service'){
  let undated=0;const matches=owned.flatMap(r=>{if(r.kind!=='workOrder'||r.status!=='Completed')return [];const day=businessDate(r.completedAt);if(!day){undated++;return [];}const ago=daysBetween(day,asOf);return ago>=0&&ago<days?[row({property:byId.get(String(r.accountId))!.name,work:r.name,type:txt(r.type)||'Unclassified',done:day,days:ago},String(r.accountId))]:[];});
  fill([P,C('work','Completed Work Order'),C('type','Work Type'),C('done','Completed On','date'),C('days','Days Since','integer')],matches.sort((a,b)=>String(b.values.done).localeCompare(String(a.values.done))||String(a.values.property).localeCompare(String(b.values.property))));
  summarize('Missing Completion Date',undated);addNote('Only completed, property-linked work orders with a recorded completion timestamp in the chosen lookback are included. Dates use Austin local time. Due dates, scheduled dates, edits, and estimated costs do not count as completed work.');
 }else if(['last-service','recent-service','not-visited','recent-visits','visit-coverage','paused'].includes(d.id)){
  const visit=['not-visited','recent-visits','visit-coverage'].includes(d.id);
  if(d.id==='paused'){fill([P,S,ST,C('lastTow','Last Confirmed Tow','date'),C('lastIntake','Last Recorded Intake','date')],props(accounts.filter(a=>a.status==='Paused'),a=>({lastTow:stat(a).lastTow||null,lastIntake:stat(a).lastIntake||null})).sort(cmp('property')));addNote('Only properties with a current account status of Paused are listed. A scheduled no-towing day is not a service suspension.');}
  else if(d.id==='visit-coverage'){fill([P,S,VIS,C('last','Last Onsite Visit in Period','date')],props(accounts,a=>({visits:stat(a).visits,last:stat(a).lastPeriodVisit||null})).sort(cmp('visits')));}
  else {const recent=['recent-service','recent-visits'].includes(d.id);const out=props(accounts.filter(active),a=>{const s=stat(a),last=visit?s.lastVisit:s.lastTow;return {last:last||null,days:last?daysBetween(last,asOf):null,lastIntake:s.lastIntake||null,recency:last?'Recorded':'No Confirmed Record'};}).filter(r=>recent?r.values.days!==null&&num(r.values.days)<days:r.values.days===null||num(r.values.days)>=days).sort((a,b)=>!recent?Number(b.values.days===null)-Number(a.values.days===null)||cmp('days')(a,b):cmp('days',true)(a,b));fill([P,S,C('last',visit?'Last Onsite Visit':'Last Confirmed Tow','date'),C('days','Days Since','integer'),...(!visit?[C('lastIntake','Last Intake','date')]:[]),C('recency','Evidence')],out);addNote('Active accounts only. The '+days+'-day window includes today. Missing evidence is labeled separately from a known older date.');}
  if(visit)addNote('Only dated Onsite Visit activity counts. Scheduled visits, calls, email, and notes do not establish an onsite visit.');else addNote(vehicleNote);
 }else if(['activity-return','effort-review','contribution','expense'].includes(d.id)){
  const effort=d.id==='activity-return'||d.id==='effort-review';
  const data=props(accounts.filter(a=>d.id!=='effort-review'||active(a)&&stat(a).activities+stat(a).profileEdits>0),a=>{const s=stat(a),fin=finance(a);const touches=s.activities+s.profileEdits;return {...fin,activities:s.activities,profileEdits:s.profileEdits,touches,visits:s.visits,costCount:s.costCount,perAction:touches&&fin.contribution!==null?rounded(fin.contribution/touches):null,revAction:touches&&fin.revenue!==null?rounded(fin.revenue/touches):null,...Object.fromEntries(Object.entries(s.expenses).map(([k,v])=>[k,s.costCount?v/100:null]))};});
  fill(d.id==='expense'?[P,EXP,C('costCount','Expense Entries','integer'),...['Expense','Signage','Repair','Sponsorship'].map(s=>C(s,s,'money'))]:[P,...(effort?[ACT,C('profileEdits','Property Profile Updates','integer'),C('touches','Recorded Touches','integer'),VIS]:[]),REV,EXP,RET,...(effort?[C('revAction','Collections per Touch','money'),C('perAction','Contribution per Touch','money')]:[])],data.sort(d.id==='effort-review'?(a,b)=>cmp('perAction',true)(a,b)||cmp('revAction',true)(a,b):cmp(d.id==='expense'?'expense':d.id==='activity-return'?'touches':'contribution')));
  if(effort)addNote('Recorded touches count dated account activities plus saved updates to the property record, excluding its initial creation. An onsite visit counts once in activities. This is a frequency measure, not staff hours. Imported data has no edit history unless the property was subsequently updated in Command.');addNote(contributionNote);
 }else if(d.id.startsWith('courtesy-')||d.id.startsWith('claim-')||d.id.startsWith('trespass-')){
  const monthly=d.id.endsWith('-month'),courtesy=d.id.startsWith('courtesy-'),claim=d.id.startsWith('claim-');
  const groups=new Map<string,{id:string;month:string;count:number;full:number;reduced:number;refund:number;unknown:number;waived:number;known:number;open:number;paid:number;paidCnt:number;issued:number;pending:number;declined:number}>();
  for(const r of owned){if(ended.has(txt(r.status))||r.kind!==(courtesy?'courtesy':claim?'claim':'trespass'))continue;
   if(courtesy&&(!['Released','Imported'].includes(txt(r.status))||!concessionTypes.has(txt(r.releaseType))))continue;
   const event=courtesy||claim?r.date:r.incidentDate;if(!inPeriod(event))continue;
   const id=String(r.accountId),month=monthly?String(event).slice(0,7):'',key=id+'|'+month,st=groups.get(key)||{id,month,count:0,full:0,reduced:0,refund:0,unknown:0,waived:0,known:0,open:0,paid:0,paidCnt:0,issued:0,pending:0,declined:0};st.count++;
   if(courtesy){if(r.releaseType==='Full courtesy')st.full++;else if(r.releaseType==='Reduced charge')st.reduced++;else if(r.releaseType==='Refund')st.refund++;else st.unknown++;const waived=amt(r.amountWaived);if(waived!==null){st.waived+=waived;st.known++;}}
   else if(claim){if(!['Paid','Closed without settlement'].includes(txt(r.status)))st.open++;if(r.status==='Paid'&&amt(r.paidAmount)!==null){st.paid+=amt(r.paidAmount)!;st.paidCnt++;}}
   else{if(r.warningStatus==='Issued')st.issued++;if(r.warningStatus==='Requested')st.pending++;if(r.warningStatus==='Requested but not issued')st.declined++;}
   groups.set(key,st);
  }
  const list=[...groups.values()].map(g=>row({property:byId.get(g.id)!.name,month:g.month,count:g.count,full:g.full,reduced:g.reduced,refund:g.refund,unknown:g.unknown,waived:g.known?g.waived/100:null,unpriced:g.count-g.known,open:g.open,paid:g.paidCnt?g.paid/100:null,issued:g.issued,pending:g.pending,declined:g.declined},g.id)).sort((a,b)=>String(b.values.month).localeCompare(String(a.values.month))||cmp('count')(a,b));
  fill([...(monthly?[MON]:[]),P,C('count',courtesy?'Completed Adjustments':claim?'Claims Reported':'Cases','integer'),...(courtesy?[C('full','Full Courtesy','integer'),C('reduced','Reduced Charge','integer'),C('refund','Refunds','integer'),C('unknown','Unclassified','integer'),C('waived','Known Waived Value','money'),C('unpriced','Unknown Value','integer')]:claim?[C('open','Currently Open','integer'),C('paid','Recorded Paid Settlements','money')]:[C('issued','CTW Issued','integer'),C('pending','Requested / Pending','integer'),C('declined','Requested but Not Issued','integer')])],list);
  summarize(courtesy?'Completed Adjustments':claim?'Reported Claims':'Origin-Linked Cases',list.reduce((s,r)=>s+num(r.values.count),0));
  addNote(courtesy?'Uses the release record date. Includes Released and Imported adjustments; excludes drafts, approvals not completed, voids, and full-payment releases. Waived value is not a paid expense.':claim?'Cases are grouped by report date, not alleged incident or payment date. Open status and paid amounts reflect the current case record.':'Counts cases on PTE premises by incident date and originating property. This does not imply the incident occurred on the client property. CTW columns show selected current statuses; remaining cases may be revoked, not requested, unclassified, or not issued without a recorded request. Unlinked yard cases are outside a property portfolio.');
 }else if(['companies','visitor-section','manager-portfolio','manager-topics','competitors'].includes(d.id)){
  const entity=new Map(records.map(r=>[r.id,r])),groups=new Map<string,{label:string;accounts:Map<string,Row>;people:Set<string>}>(),term=txt(input.term).toLowerCase();
  const add=(label:string,a:Row,person?:string,canonical?:string)=>{if(!label)return;const key=canonical??label.toLocaleLowerCase('en-US'),g=groups.get(key)||{label,accounts:new Map<string,Row>(),people:new Set<string>()};g.accounts.set(a.id,a);if(person)g.people.add(person);groups.set(key,g);};
  if(d.id==='competitors'){
   for(const r of records){if(r.kind!=='opportunity'||r.stage!=='Won'||!inPeriod(r.handoffDate))continue;const a=byId.get(txt(r.onboardingAccountId));if(!a||a.sourceOpportunityId!==r.id)continue;add(txt(r.currentProvider)||'Provider Not Recorded',a);}
   fill([C('group','Previous Towing Provider'),C('properties','Won Properties','integer')],[...groups.values()].map(g=>row({group:g.label,properties:g.accounts.size})).sort(cmp('properties')));
   addNote('One distinct property per documented Won lead and linked Pending Account, by actual handoff date. Shows our recorded prior providers, not a competitor’s entire market losses.');
  }else{
   if(d.id==='companies')for(const a of accounts){const co=entity.get(txt(a.companyId));add(co?.kind==='company'?co.name:'Management Company Not Recorded',a,undefined,co?.kind==='company'?'org:'+co.id:'org:unrecorded');}
   if(d.id==='visitor-section')for(const a of accounts.filter(active))add(a.visitorSection==='Yes'?'Dedicated Visitor Parking':a.visitorSection==='No'?'No Dedicated Visitor Section':'Not Confirmed',a);
   if(d.id==='manager-portfolio'||d.id==='manager-topics')for(const r of owned){
    if(r.kind!=='affiliation'||r.role!=='Property Manager'||r.startDate&&(!reportDay(r.startDate)||String(r.startDate)>asOf)||r.endDate&&(!reportDay(r.endDate)||String(r.endDate)<=asOf))continue;
    const a=byId.get(String(r.accountId)),person=entity.get(txt(r.contactId));if(!a||!person||person.kind!=='contact')continue;
    if(d.id==='manager-portfolio'){
     const key='id:'+person.id,g=groups.get(key)||{label:person.name,accounts:new Map<string,Row>(),people:new Set<string>()};g.accounts.set(a.id,a);g.people.add(person.id);groups.set(key,g);
    }else{
     const tags=Array.isArray(person.businessTopics)?person.businessTopics.filter((x:unknown)=>typeof x==='string'&&x.trim().length>0&&x.length<=80).map((x:string)=>x.trim()):[];
     const channel=txt(person.preferredChannel);if(['Email','Phone call','Text message','Onsite visit'].includes(channel))tags.push('Prefers '+channel);
     for(const t of new Set(tags))if(!term||t.toLowerCase().includes(term))add(t,a,person.id);
    }
   }
   const grouped=[...groups.values()].map(g=>{const entries=[...g.accounts.values()],costs=entries.filter(a=>stat(a).costCount),rev=entries.reduce((s,a)=>s+stat(a).cents,0),expense=entries.reduce((s,a)=>s+stat(a).expense,0),contrib=moneyCoverage&&costs.length===entries.length?(rev-expense)/100:null;return row({group:g.label,properties:entries.length,people:g.people.size,revenue:moneyCoverage?rev/100:null,avg:moneyCoverage?rounded(rev/100/entries.length):null,expense:costs.length?expense/100:null,contribution:contrib,perProperty:contrib!==null?rounded(contrib/entries.length):null,costCoverage:rounded(costs.length*100/entries.length)});}).sort((a,b)=>cmp('contribution')(a,b)||cmp('revenue')(a,b));
   fill([C('group',d.id==='companies'?'Management Company':d.id==='visitor-section'?'Visitor Parking':d.id==='manager-portfolio'?'Current Property Manager':'Recorded Business Topic'),C('properties','Properties','integer'),...(d.id==='manager-topics'?[C('people','Managers','integer')]:[]),REV,C('avg','Collections per Property','money'),EXP,C('costCoverage','Properties with Cost Entries','percent'),RET,C('perProperty','Contribution per Property','money')],grouped);
   addNote('Grouping uses currently recorded relationships or parking settings, not historical ownership of revenue. Group contribution requires at least one recorded cost for every included property.');addNote(contributionNote);
   if(d.id==='manager-topics')addNote('Only structured business topics and preferred communication channels are included. Groups may overlap. These are descriptive associations, not causal traits or predictions. Names, birthdays, private interests and free-text notes are never mined.');
   if(d.id==='manager-portfolio')addNote('Only current property manager tenures are included. A jointly managed property may appear for multiple managers; rows should not be summed.');
  }
 }
 if(report.columns.some(c=>c.key==='revenue'||c.key==='revAction'||c.key==='perUnit')){
  addNote(financialNote);addNote(lastPay?'Portfolio payment history: '+firstPay+' through '+lastPay+'. Later dates without entries are not proof that no revenue was earned.':'No linked payment history is available for this portfolio. Revenue is unknown.');
  if(d.id==='top-revenue'||d.id==='revenue-ranking')summarize('Recorded Net Collections',moneyCoverage?asMoney(accounts.reduce((s,a)=>s+stat(a).cents,0)/100):'No Coverage');
 }
 summarize('Properties in Scope',accounts.length);summarize('Result Rows',report.rows.length);
 // Send only the selected columns: intermediate calculations and private source records must never escape.
 report.rows=report.rows.map(r=>row(Object.fromEntries(report.columns.map(c=>[c.key,r.values[c.key]??null])),r.accountId));return report;
}
