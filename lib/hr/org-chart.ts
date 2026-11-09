import type {FinRecord,Viewer} from '../finance/model';
/** Only public work identity: never widen personnel/payroll access for an org chart. */
export function orgChartNodes(v:Viewer,records:FinRecord[]){
 const active=records.filter(p=>p.kind==='person'&&p.status!=='Former'),ids=new Set<string>([v.person]);
 let id=String(active.find(p=>p.id===v.person)?.supervisor||'');while(id&&!ids.has(id)){ids.add(id);id=String(active.find(p=>p.id===id)?.supervisor||'');}
 const descendants=new Set([v.person]);let changed=true;while(changed){changed=false;for(const p of active)if(descendants.has(String(p.supervisor))&&!descendants.has(p.id)){descendants.add(p.id);changed=true;}}
 for(const id of descendants)ids.add(id);
 return active.filter(p=>v.owner||ids.has(p.id)).map(p=>({id:p.id,kind:'person',version:p.version,name:p.preferredName||p.name,title:p.title,department:p.department,supervisor:p.supervisor,status:p.status} as FinRecord));
}
