import {validateComponents,weeklyAmount} from './compensation.ts';
import type {FinRecord} from '../finance/model';
import {AppError} from '../shared/errors.ts';
export const payArrangements=['Hourly','Hourly + commission','Commission only','Salary + commission','Salary exempt','Salary nonexempt','Net salary','Per tow','Owner payment'];
export const payKeys=['payComponents','payType','rate','netTarget','exempt','overtimeEstimateRate','notes','commissionRules','bonusRules'];
export const changeReasons=['Initial Agreement','Training Pay','Training Completed','Promotion','Demotion','Reassignment','Pay Increase','Pay Correction','Other'];
export const bonusFrequencies=['One Time','Weekly','Monthly','Yearly'];
export const bonusTriggers=['Performance Goal','Attendance','Vehicle Count','Revenue Goal','Training Completion','Retention / Anniversary','Discretionary Approval','Other'];
export function effectivePay(p:FinRecord,day:string):FinRecord{
 const schedule=(p.payTimeline||[]) as Record<string,unknown>[];if(!schedule.length)return p;
 const baseline=(p.payBaseline||[]) as Record<string,unknown>[];const base={...p,...(baseline[0]||{})} as FinRecord;
 const events=schedule.filter(e=>e.status!=='Cancelled'&&e.effectiveDate&&String(e.effectiveDate)<=day).sort((a,b)=>String(a.effectiveDate).localeCompare(String(b.effectiveDate))||String(a.recordedAt).localeCompare(String(b.recordedAt)));
 for(const e of events){for(const k of payKeys)if(e[k]!==undefined)base[k]=e[k] as FinRecord[string];if(e.title)base.title=String(e.title);base.date=String(e.effectiveDate);}
 const roles=[...schedule.filter(e=>e.status!=='Cancelled'&&e.title),...((p.careerHistory||[]) as Record<string,unknown>[]).filter(e=>!e.historicalOnly&&e.title)].filter(e=>String(e.effectiveDate)<=day).sort((a,b)=>String(a.effectiveDate).localeCompare(String(b.effectiveDate))||String(a.recordedAt).localeCompare(String(b.recordedAt)));if(roles.length)base.title=String(roles.at(-1)!.title);
 return base;
}
export function validPayDate(value:unknown){const d=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T12:00Z'))||new Date(d+'T12:00Z').toISOString().slice(0,10)!==d)throw new AppError('Enter a valid effective date.');return d;}
export function validatePayAgreement(d:Record<string,unknown>){
 const result:Record<string,unknown>={};if(d.payComponents!==undefined){const components=validateComponents(d.payComponents);if(typeof d.exempt!=='boolean')throw new AppError('Select FLSA status separately.');const hourly=components.filter(c=>c.kind==='Hourly Pay'),salary=components.filter(c=>c.kind==='Salary');return {payComponents:components,payType:hourly.length?'Hourly + commission':salary.length?(d.exempt?'Salary exempt':'Salary nonexempt'):'Commission only',rate:hourly.reduce((s,c)=>s+c.amount,0)||salary.reduce((s,c)=>s+weeklyAmount(c),0),exempt:d.exempt,notes:String(d.notes||''),commissionRules:[],bonusRules:[]};}if(!payArrangements.includes(String(d.payType)))throw new AppError('Choose a pay arrangement.');result.payType=d.payType;
 for(const k of ['rate','netTarget','overtimeEstimateRate']){const n=Number(d[k]||0);if(!Number.isFinite(n)||n<0||n>1e7)throw new AppError('Enter a valid '+k+'.');result[k]=n;}
 if(['Commission only','Per tow'].includes(String(d.payType)))result.rate=0;
 if(typeof d.exempt!=='boolean')throw new AppError('Select the FLSA classification.');if(String(d.payType).startsWith('Hourly')&&d.exempt)throw new AppError('Hourly agreements must be nonexempt.');result.exempt=d.exempt;result.notes=String(d.notes||'').slice(0,4000);
 for(const key of ['commissionRules','bonusRules']){
  if(d[key]!==undefined&&!Array.isArray(d[key]))throw new AppError('Enter valid compensation rules.');
  const rules=(d[key]||[]) as Record<string,unknown>[];if(rules.length>30)throw new AppError('Limit each agreement to 30 rules.');
  result[key]=rules.map(r=>{if(!r||typeof r!=='object'||!String(r.name||'').trim())throw new AppError('Name each compensation rule.');const amount=Number(r.amount);if(!Number.isFinite(amount)||amount<0||amount>1e7||!['Fixed Amount','Percent'].includes(String(r.basis))||r.basis==='Percent'&&amount>100)throw new AppError('Enter a valid amount or percentage.');if(!String(r.trigger||'').trim())throw new AppError('Specify what triggers each commission or bonus.');if(key==='bonusRules'&&!bonusFrequencies.includes(String(r.frequency)))throw new AppError('Choose the bonus frequency.');return {name:String(r.name).slice(0,150),amount,basis:String(r.basis),trigger:String(r.trigger).slice(0,150),frequency:key==='bonusRules'?String(r.frequency):'Per Event',criteria:String(r.criteria||'').slice(0,2000)};});
 }
 return result;
}
export function payBaseline(p:FinRecord){return [...payKeys,'title','date'].reduce((a,k)=>({...a,...(p[k]!==undefined?{[k]:p[k]}:{})}),{});}
