import type {FinRecord} from '../finance/model';

export type HrRosterScope = 'Current' | 'Former' | 'All';

/** Workflow lists use current workers; historical records remain in the source roster. */
export function isCurrentHrWorker(person:FinRecord):boolean {
 return ['active','onboarding','leave'].includes(String(person.status||'').trim().toLowerCase());
}

export function isFormerHrWorker(person:FinRecord):boolean {
 return String(person.status||'').trim().toLowerCase()==='former';
}

/** Accept only the already-authorized roster supplied by /api/hr. This is a view filter, not an access grant. */
export function hrRoster(people:readonly FinRecord[],scope:HrRosterScope='Current',search=''):FinRecord[] {
 const query=search.trim().toLocaleLowerCase();
 return people.filter(person=>person.kind==='person'&&(scope==='All'||(scope==='Former'?isFormerHrWorker(person):isCurrentHrWorker(person))))
  .filter(person=>!query||[person.name,person.title,person.department].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))
  .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'})||a.id.localeCompare(b.id));
}

/** A former profile must not stay implicitly selected when a current-workflow view opens. */
export function resolveHrRosterPersonId(roster:readonly FinRecord[],selectedId:string,viewerPersonId?:string):string {
 if(roster.some(person=>person.id===selectedId))return selectedId;
 if(viewerPersonId&&roster.some(person=>person.id===viewerPersonId))return viewerPersonId;
 return roster[0]?.id||'';
}
