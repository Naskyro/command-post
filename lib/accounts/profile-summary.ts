import {layoutFieldKeys} from './property-layout';
import {current, today, type Row} from './model';

export const operatingFields = [...layoutFieldKeys, 'propertyType', 'instructions', 'enforcementHours', 'visitorParkingEnforcement', 'carportParking', 'carportEnforcement', 'towAuthorization', 'spaceCallAuthority', 'towAuthorizationNotes'];
export const hangarPolicy = {
  enforcementHours: 'Authorized calls only; no patrol service.',
  carportParking: 'Yes',
  carportEnforcement: 'Authorized call-in only',
  towAuthorization: 'Property manager only',
  spaceCallAuthority: 'Property manager only',
  towAuthorizationNotes: 'Only the property manager may initiate a tow, including an occupied paid carport space. Assistant property managers and residents cannot authorize a tow. Service must wait for the property manager’s call; this may prevent service late at night or overnight.',
};

export function recordedEnforcementHours(account:Row):string {
 if(account.enforcementHours)return String(account.enforcementHours);
 const line=String(account.instructions||'').split(/[\r\n]/).find(line=>/^\s*Enforcement\s*:/i.test(line));
 return line?line.replace(/^\s*Enforcement\s*:\s*/i,'').trim():'';
}

// Apply the owner's correction to the older imported note, preserving later edits.
export function operatingDefaults(account: Row): Row {
  if(account.propertyType==='Mixed')account={...account,propertyType:'Mixed use'};
  if(account.id==='account:thecole')account={parkingGarage:'Yes',...account};
  if(account.id==='account:mlkhighline')account={residentialBuildingType:'Mid rise',mixedUseLayout:'Commercial on the first floor with mid-rise residences above.',parkingGarage:'Yes',commercialTenantParking:'Yes',customerParking:'Yes',commercialTenantParkingLocation:'Commercial tenant parking within the shared parking garage.',customerParkingLocation:'Customer parking within the shared parking garage.',residentialParkingLocation:'Resident parking is farther inside the garage, beyond the commercial tenant and customer parking.',...account};
  if (account.id !== 'account:citizenhousebergstrom') return account;
  return {...hangarPolicy, ...account,
    instructions: !account.towAuthorization && account.instructions === 'Patrol not allowed. Strict Call in from Regional or Manager'
      ? 'Patrol not allowed. Only the property manager may initiate a tow.' : account.instructions};
}

export function enforcementSchedule(all: Row[], accountId: string, day = today()) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const groups = new Map<string, {days: string[]; scope: string; hours: string}>();
  for (const r of all.filter(r => r.kind === 'patrol' && r.accountId === accountId && current(r, day))
    .sort((a,b) => days.indexOf(String(a.day)) - days.indexOf(String(b.day)))) {
    const hours = r.mode === 'Allowed window' ? `${r.starts}–${r.ends}${String(r.ends) < String(r.starts) ? ' (overnight)' : ''}` : String(r.mode);
    const key = String(r.scope) + '|' + hours;
    const group = groups.get(key) || {days: [], scope: String(r.scope || 'Property'), hours};
    if (!group.days.includes(String(r.day))) group.days.push(String(r.day));
    groups.set(key, group);
  }
  return [...groups.values()].map(g => ({...g, daysLabel: g.days.length === 7 ? 'Every day' : g.days.map(d => d.slice(0,3)).join(', ')}));
}

type Payment = {accountId:string; paymentDate:string; cents:number; void?:boolean};
export function annualRevenue(payments: Payment[], accountId: string, year: number, day = today()) {
  const from = `${year}-01-01`, to = year === Number(day.slice(0,4)) ? day : `${year}-12-31`;
  const valid = payments.filter(p => !p.void && p.paymentDate <= day);
  const scope = valid.filter(p => p.accountId === accountId && p.paymentDate >= from && p.paymentDate <= to);
  const coverage = valid.filter(p => p.paymentDate >= from && p.paymentDate <= to).map(p => p.paymentDate).sort();
  const years = [...new Set([Number(day.slice(0,4)), ...valid.map(p => Number(p.paymentDate.slice(0,4)))])].sort((a,b) => b-a);
  return {year, from, to, total: scope.reduce((sum,p) => sum+p.cents, 0)/100, paymentCount: scope.length,
    coverageFrom: coverage[0] || '', coverageTo: coverage.at(-1) || '', years};
}
