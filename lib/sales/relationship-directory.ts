import type {Row} from '../accounts/model';
export type SalesContact={id:string;name:string;email?:string;phone?:string;relationshipPhotoVersion?:number;version?:number;editableProfile?:boolean};
export type Tenure={key:string;relationship?:Row;lead:Row;role:string;decision:boolean;start:string;end:string};
export type ContactGroup={contact:SalesContact;tenures:Tenure[];active:Tenure[];historical:Tenure[];example:boolean;timeline:Row[]};
export type DirectoryFilter={scope:'all'|'current'|'former'|'decision';role:string;rep:string;query:string};
const text=(s:unknown)=>typeof s==='string'?s.trim():'';
export const crmName=(s:unknown)=>text(s).replace(/^Sample\s*[·:]\s*/i,'');
export const sortedTenures=(a:Tenure,b:Tenure)=>Number(!!a.end)-Number(!!b.end)||(b.end||b.start).localeCompare(a.end||a.start)||Number(b.decision)-Number(a.decision)||a.lead.name.localeCompare(b.lead.name)||a.key.localeCompare(b.key);
export function contactGroups(rows:Row[],contacts:SalesContact[]):ContactGroup[]{
 const leads=new Map(rows.filter(r=>r.kind==='opportunity'&&!r.deletedAt).map(r=>[r.id,r]));
 const people=new Map(contacts.filter(c=>c.id&&c.name).map(c=>[c.id,c])),pairs=new Set<string>(),groups=new Map<string,ContactGroup>(),perLead=new Map<string,Row[]>();
 function group(id:string,name:string){const c=people.get(id);if(!id||(!c&&!name))return undefined;const group=groups.get(id)||{contact:c||{id,name},active:[],historical:[],tenures:[],timeline:[],example:id.startsWith('sales-example:')};groups.set(id,group);return group;}
 for(const r of rows){
  if(r.deletedAt)continue;
  if(r.kind==='salesActivity'){const key=text(r.opportunityId),entries=perLead.get(key)||[];entries.push(r);perLead.set(key,entries);continue;}
  if(r.kind!=='salesRelationship')continue;const lead=leads.get(text(r.opportunityId));if(!lead)continue;
  const id=text(r.contactId),g=group(id,r.name);if(!g)continue;pairs.add(JSON.stringify([id,lead.id]));
  g.tenures.push({key:r.id,relationship:r,lead,role:text(r.role),decision:r.decisionMaker===true||r.role==='Decision Maker',start:text(r.startDate),end:text(r.endDate)});
 }
 // Older leads may have a canonical primary-contact ID but no recorded tenure. Do not infer links or service dates from matching names.
 for(const lead of leads.values()){
  const id=text(lead.contactId);if(!id||pairs.has(JSON.stringify([id,lead.id])))continue;const g=group(id,text(lead.contactName));if(!g)continue;
  g.tenures.push({key:'lead:'+lead.id,lead,role:text(lead.contactRole),decision:lead.contactRole==='Decision Maker',start:'',end:''});
 }
 for(const g of groups.values()){
  g.tenures.sort(sortedTenures);g.active=g.tenures.filter(t=>!t.end);g.historical=g.tenures.filter(t=>t.end);
  const ids=new Set(g.tenures.map(t=>t.lead.id));
  g.timeline=[...ids].flatMap(id=>perLead.get(id)||[]).sort((a,b)=>text(b.date||b.updatedAt).localeCompare(text(a.date||a.updatedAt))||text(b.updatedAt).localeCompare(text(a.updatedAt))||a.id.localeCompare(b.id));
 }
 return [...groups.values()].sort((a,b)=>a.contact.name.localeCompare(b.contact.name)||a.contact.id.localeCompare(b.contact.id));
}
export function matchesTenure(g:ContactGroup,t:Tenure,filter:DirectoryFilter){
 if(filter.scope==='current'&&t.end||filter.scope==='former'&&!t.end||filter.scope==='decision'&&(t.end||!t.decision))return false;
 if(filter.rep&&t.lead.assignee!==filter.rep||filter.role&&t.role!==filter.role)return false;
 const q=filter.query.trim().toLocaleLowerCase();return !q||[g.contact.name,g.contact.email,g.contact.phone,t.role,crmName(t.lead.name),t.lead.companyName,t.lead.address,t.relationship?.email,t.relationship?.phone].filter(Boolean).join(' ').toLocaleLowerCase().includes(q);
}
export function filteredContacts(groups:ContactGroup[],filter:DirectoryFilter,examples:boolean){
 return groups.filter(g=>g.example===examples&&g.tenures.some(t=>matchesTenure(g,t,filter)));
}
