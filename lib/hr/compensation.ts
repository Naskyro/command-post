import {AppError} from '../shared/errors.ts';
export type Component={id:string;name:string;kind:string;amount:number;basis:string;frequency:string;trigger:string;criteria:string;treatment:string;group:string};
export const componentKinds=['Hourly Pay','Salary','Per-Activity Pay','Revenue Share','Bonus','Guaranteed Minimum'];
export const componentFrequencies=['Per Hour','Per Event','Weekly','Monthly','Yearly','One Time'];
export const componentTreatments=['Add to Pay','Counts Toward Minimum'];
export function componentsFor(p:Record<string,unknown>):Component[]{
 if(Array.isArray(p.payComponents))return p.payComponents as Component[];
 const out:Component[]=[],type=String(p.payType||'');
 if(!['Commission only','Per tow','Pending method',''].includes(type))out.push({id:'legacy-base',name:type.startsWith('Hourly')?'Hourly Pay':'Salary',kind:type.startsWith('Hourly')?'Hourly Pay':'Salary',amount:Number(p.rate||0),basis:'Fixed Amount',frequency:type.startsWith('Hourly')?'Per Hour':'Weekly',trigger:'',criteria:type==='Net salary'?'Legacy net-pay target: '+p.netTarget:'',treatment:'Add to Pay',group:''});
 for(const key of ['commissionRules','bonusRules'])for(const [i,r] of ((p[key]||[]) as Record<string,unknown>[]).entries())out.push({id:key+'-'+i,name:String(r.name||''),kind:key==='bonusRules'?'Bonus':r.basis==='Percent'?'Revenue Share':'Per-Activity Pay',amount:Number(r.amount||0),basis:String(r.basis||'Fixed Amount'),frequency:key==='bonusRules'?String(r.frequency||'One Time'):'Per Event',trigger:String(r.trigger||''),criteria:String(r.criteria||''),treatment:'Add to Pay',group:''});
 return out;
}
export function validateComponents(value:unknown):Component[]{
 if(!Array.isArray(value)||!value.length||value.length>40)throw new AppError('Add between 1 and 40 compensation components.');
 const components=value.map((r:Record<string,unknown>,i)=>{if(!r||typeof r!=='object')throw new AppError('Enter a valid compensation component.');const kind=String(r.kind),basis=String(r.basis||'Fixed Amount'),amount=Number(r.amount),frequency=String(r.frequency),treatment=String(r.treatment||'Add to Pay'),group=String(r.group||'').trim();
 if(!componentKinds.includes(kind)||!String(r.name||'').trim()||String(r.name).length>150||!Number.isFinite(amount)||amount<0||amount>1e7||!['Fixed Amount','Percent','Amount Set Per Event'].includes(basis)||basis==='Percent'&&amount>100||!componentFrequencies.includes(frequency)||!componentTreatments.includes(treatment))throw new AppError('Complete each component with a name, valid amount, frequency and treatment.');
 if(['Hourly Pay','Salary','Guaranteed Minimum'].includes(kind)&&basis!=='Fixed Amount')throw new AppError('Base pay and guarantees require a fixed amount.');
 if(kind==='Hourly Pay'&&frequency!=='Per Hour'||kind==='Salary'&&!['Weekly','Monthly','Yearly'].includes(frequency)||kind==='Guaranteed Minimum'&&frequency!=='Weekly')throw new AppError('Choose the appropriate frequency. Guaranteed minimums currently settle weekly.');
 if(kind==='Guaranteed Minimum'&&!group||treatment==='Counts Toward Minimum'&&!group)throw new AppError('Name the minimum group so the system knows which earnings share a guarantee.');
 if(kind==='Guaranteed Minimum'&&treatment!=='Add to Pay')throw new AppError('A guarantee cannot count toward another guarantee.');
 if(!['Hourly Pay','Salary','Guaranteed Minimum'].includes(kind)&&!String(r.trigger||'').trim())throw new AppError('Specify what qualifies for this incentive.');
 return {id:String(r.id||'component-'+i),name:String(r.name).trim(),kind,basis,amount,frequency,treatment,group,trigger:String(r.trigger||'').slice(0,500),criteria:String(r.criteria||'').slice(0,4000)};});
 if(new Set(components.map(c=>c.id)).size!==components.length)throw new AppError('Compensation component IDs must be unique.');
 const guarantees=components.filter(c=>c.kind==='Guaranteed Minimum');if(new Set(guarantees.map(c=>c.group.toLowerCase())).size!==guarantees.length)throw new AppError('Use one guaranteed minimum per group.');
 for(const c of components.filter(c=>c.treatment==='Counts Toward Minimum'))if(!guarantees.some(g=>g.group.toLowerCase()===c.group.toLowerCase()))throw new AppError('Add the guaranteed minimum for '+c.group+'.');
 return components;
}
export function weeklyAmount(c:Component){return c.frequency==='Yearly'?c.amount/52:c.frequency==='Monthly'?c.amount*12/52:c.amount;}
/** Calculates approved component earnings; guarantee is only a top-up, never a duplicate salary. */
export function calculateComponents(components:Component[],earned:Record<string,number>){let total=0;const groups:Record<string,number>={},lines:{id:string;name:string;amount:number}[]=[];for(const c of components.filter(c=>c.kind!=='Guaranteed Minimum')){const amount=c.kind==='Salary'?weeklyAmount(c):Number(earned[c.id]||0);total+=amount;lines.push({id:c.id,name:c.name,amount});if(c.treatment==='Counts Toward Minimum'){const g=c.group.toLowerCase();groups[g]=(groups[g]||0)+amount;}}
 for(const c of components.filter(c=>c.kind==='Guaranteed Minimum')){const amount=Math.max(0,c.amount-(groups[c.group.toLowerCase()]||0));total+=amount;lines.push({id:c.id,name:c.name+' Top-Up',amount});}return {total:Math.round(total*100)/100,lines};}
