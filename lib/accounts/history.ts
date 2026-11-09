import source from './history-data.json';
import {vehicles} from './vehicle-rows';
export {vehicles} from './vehicle-rows';
import { tenureAt } from './insights';
import { today, type Row } from './model';
export const importedPayments = source.payments;
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

export type PropertyMonthlyRow = {
  month: string;
  collected: number;
  towRevenue: number;
  towCount: number;
  receivedDateCount: number;
};

export type PropertyMonthlyPerformance = {
  accountId: string;
  year: number;
  years: number[];
  from: string;
  to: string;
  monthly: PropertyMonthlyRow[];
  ytdCollected: number;
  ytdTowRevenue: number;
  confirmedTowCount: number;
  receivedDateCount: number;
  paymentCount: number;
};

const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';

/**
 * Return a complete calendar-year view for one property. Payments remain
 * grouped by payment date (the established revenue convention), while tow
 * counts and tow-attributed revenue use the confirmed tow date on the
 * property’s Towbook call. Records without a confirmed tow date are reported
 * separately by received date so the UI never presents an intake date as an
 * actual towing date.
 */
export function propertyMonthlyPerformance(
  all: Row[],
  accountId: string,
  year: number,
  day = today(),
  payments: { accountId: string; paymentDate: string; cents: number; vehicleId?: string; void?: boolean }[] = importedPayments,
): PropertyMonthlyPerformance {
  const from = `${year}-01-01`;
  const to = year === Number(day.slice(0, 4)) ? day : `${year}-12-31`;
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  const byMonth = new Map(months.map(month => [month, { month, collected: 0, towRevenue: 0, towCount: 0, receivedDateCount: 0 }]));
  const calls = vehicles(all).filter(row => row.accountId === accountId);
  const callById = new Map(calls.map(row => [row.id, row]));
  const availableYears = new Set<number>();
  for (const payment of payments) if (!payment.void && payment.accountId === accountId) {
    const paymentYear = Number(String(payment.paymentDate || '').slice(0, 4));
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(payment.paymentDate || '')) && Number.isInteger(paymentYear) && paymentYear <= Number(day.slice(0, 4))) availableYears.add(paymentYear);
  }
  for (const call of calls) for (const value of [call.towDate, call.receivedDate]) {
    const callYear = Number(String(value || '').slice(0, 4));
    if (validDate(value) && Number.isInteger(callYear) && callYear <= Number(day.slice(0, 4))) availableYears.add(callYear);
  }
  availableYears.add(Number(day.slice(0, 4)));
  let ytdCollected = 0;
  let ytdTowRevenue = 0;
  let confirmedTowCount = 0;
  let receivedDateCount = 0;

  for (const payment of payments) {
    if (payment.void || payment.accountId !== accountId) continue;
    const call = payment.vehicleId ? callById.get(payment.vehicleId) : undefined;
    const towDate = validDate(call?.towDate);
    if (towDate && towDate >= from && towDate <= to) {
      const towRow = byMonth.get(towDate.slice(0, 7));
      if (towRow) {
        towRow.towRevenue += payment.cents / 100;
        ytdTowRevenue += payment.cents / 100;
      }
    }
    if (payment.paymentDate < from || payment.paymentDate > to) continue;
    const paymentMonth = payment.paymentDate.slice(0, 7);
    const row = byMonth.get(paymentMonth);
    if (!row) continue;
    row.collected += payment.cents / 100;
    ytdCollected += payment.cents / 100;
  }

  for (const call of calls) {
    const towDate = validDate(call.towDate);
    if (towDate && towDate >= from && towDate <= to) {
      const row = byMonth.get(towDate.slice(0, 7));
      if (row) row.towCount += 1;
      confirmedTowCount += 1;
      continue;
    }
    const receivedDate = validDate(call.receivedDate);
    if (!towDate && receivedDate && receivedDate >= from && receivedDate <= to) {
      const row = byMonth.get(receivedDate.slice(0, 7));
      if (row) row.receivedDateCount += 1;
      receivedDateCount += 1;
    }
  }

  return { accountId, year, years: [...availableYears].sort((a, b) => b - a), from, to, monthly: [...byMonth.values()], ytdCollected, ytdTowRevenue, confirmedTowCount, receivedDateCount, paymentCount: payments.filter(payment => !payment.void && payment.accountId === accountId && payment.paymentDate >= from && payment.paymentDate <= to).length };
}
