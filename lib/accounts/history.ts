import source from './history-data.json';
import { tenureAt } from './insights';
import { type Row } from './model';
export const importedPayments = source.payments;
export function vehicles(all: Row[]) { const map = new Map((source.vehicles as Row[]).map(r=>[r.id,r])); for(const r of all.filter(r=>r.kind==='vehicle')) map.set(r.id,r); return [...map.values()]; }
export function results(all: Row[], accountId='', contactId='', from='', to='', estimated=false) {
  const calls=new Map(vehicles(all).map(r=>[r.id,r]));
  const affiliations=all.filter(r=>r.kind==='affiliation' && (!accountId||r.accountId===accountId));
  const accounts=new Map(all.filter(r=>r.kind==='account').map(r=>[r.id,r]));
  const payments=importedPayments.filter(p=>!p.void && (!accountId||p.accountId===accountId) && (!from||p.paymentDate>=from) && (!to||p.paymentDate<=to));
  let total=0, unattributed=0, estimatedCents=0;
  const monthly=new Map<string,number>(), properties=new Map<string,number>(), managers=new Map<string,{id:string;name:string;cents:number;estimatedCents:number;accounts:Set<string>}>();
  for(const p of payments) {
    const call=calls.get(p.vehicleId), date=String(call?.towDate || (estimated?call?.receivedDate:'') || '');
    const manager=tenureAt(affiliations,p.accountId,date), cid=String(manager?.contactId||'');
    if(contactId && cid!==contactId)continue;
    total+=p.cents; const month=p.paymentDate.slice(0,7);monthly.set(month,(monthly.get(month)||0)+p.cents);
    properties.set(p.accountId,(properties.get(p.accountId)||0)+p.cents);
    if(!manager){unattributed+=p.cents;continue;}
    const m=managers.get(cid)||{id:cid,name:all.find(r=>r.id===cid)?.name||'Manager',cents:0,estimatedCents:0,accounts:new Set<string>()};
    m.cents+=p.cents;m.accounts.add(p.accountId); if(!call?.towDate){estimatedCents+=p.cents;m.estimatedCents+=p.cents;}managers.set(cid,m);
  }
  const expenseRows=all.filter(r=>r.kind==='financial'&&r.type!=='Revenue'&&r.status!=='Voided'&&(!accountId||r.accountId===accountId)&&(!from||String(r.date)>=from)&&(!to||String(r.date)<=to)&&(!contactId||tenureAt(affiliations,String(r.accountId),String(r.date))?.contactId===contactId));
  const claims=all.filter(r=>r.kind==='claim'&&r.status==='Paid'&&(!accountId||r.accountId===accountId)&&(!from||String(r.paidDate)>=from)&&(!to||String(r.paidDate)<=to)&&(!contactId||tenureAt(affiliations,String(r.accountId),String(r.incidentDate||r.date))?.contactId===contactId));
  const releases=all.filter(r=>r.kind==='courtesy'&&['Released','Imported'].includes(String(r.status))&&(!accountId||r.accountId===accountId)&&(!from||String(r.date)>=from)&&(!to||String(r.date)<=to)&&(!contactId||(r.managerContactId||tenureAt(affiliations,String(r.accountId),String(r.date))?.contactId)===contactId));
  return {total:total/100,unattributed:unattributed/100,estimated:estimatedCents/100,paymentCount:payments.length,coveredFrom:payments.map(p=>p.paymentDate).sort()[0]||'',coveredTo:payments.map(p=>p.paymentDate).sort().at(-1)||'',
    monthly:[...monthly].sort(([a],[b])=>a.localeCompare(b)).map(([month,cents])=>({month,collected:cents/100})),
    properties:[...properties].map(([id,cents])=>({id,name:accounts.get(id)?.name||id,collected:cents/100})).sort((a,b)=>b.collected-a.collected),
    managers:[...managers.values()].map(m=>({id:m.id,name:m.name,collected:m.cents/100,estimated:m.estimatedCents/100,accounts:m.accounts.size})).sort((a,b)=>b.collected-a.collected),
    recordedExpenses:expenseRows.reduce((s,r)=>s+Math.round(Number(r.amount||0)*100),0)/100,
    settlementsPaid:claims.reduce((s,r)=>s+Math.round(Number(r.paidAmount||0)*100),0)/100,
    waived:releases.reduce((s,r)=>s+Math.round(Number(r.amountWaived||0)*100),0)/100,
    unknownWaivers:releases.filter(r=>typeof r.amountWaived!=='number').length};
}
