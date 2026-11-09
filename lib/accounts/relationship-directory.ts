import type {Row} from './model';
export type AffiliationState='Current'|'Former'|'Upcoming';
const val=(x:unknown)=>typeof x==='string'?x.trim():'';
const day=(x:unknown)=>val(x).slice(0,10);
export function relationshipPeriod(r:Row,today:string):AffiliationState {
 if(day(r.endDate)&&day(r.endDate)<=today)return 'Former';
 if(day(r.startDate)&&day(r.startDate)>today)return 'Upcoming';
 return 'Current';
}
export type Link={key:string;affiliation?:Row;account?:Row;company?:Row;contact?:Row;state:AffiliationState;role:string;source:'Assignment'|'Property Record';decision:boolean;primary?:boolean};
export type Entry={entity:Row;links:Link[];search:string};
export function accountRelationships(rows:Row[],today:string):Entry[]{
 const dictionary=new Map(rows.map(r=>[r.id,r])), visible=(id:unknown,k:Row['kind'])=>{const r=dictionary.get(val(id));return r?.kind===k?r:undefined;};
 const all=new Map(rows.filter(r=>(r.kind==='contact'||r.kind==='company')&&!r.deletedAt).map(entity=>[entity.id,{entity,links:[] as Link[],search:''}]));
 for(const f of rows.filter(r=>r.kind==='affiliation'&&!r.deletedAt)){
  const account=visible(f.accountId,'account'),state=relationshipPeriod(f,today);
  const company=visible(f.companyId,'company'),contact=visible(f.contactId,'contact');
  const association:Link={key:f.id,affiliation:f,account,company,contact,state,role:val(f.role),source:'Assignment',decision:f.decisionMaker===true||f.role==='Decision Maker'};
  if(contact){const currentFirm=!f.companyId&&state==='Current'&&account?visible(account.companyId,'company'):undefined;all.get(contact.id)?.links.push({...association,company:company||currentFirm});}
  if(company)all.get(company.id)?.links.push(association);
 }
 for(const account of rows.filter(r=>r.kind==='account'&&!r.deletedAt)){
  for(const [field,role] of [['companyId','Management Company'],['ownerId','Property Owner'],['primaryContactId','Primary Contact']] as const){
   const g=all.get(val(account[field]));if(!g)continue;
   if(field==='primaryContactId'){const same=g.links.find(l=>l.state==='Current'&&l.account?.id===account.id);if(same){same.primary=true;continue;}}
   g.links.push({key:field+':'+account.id,account,role,company:field==='primaryContactId'?visible(account.companyId,'company'):undefined,state:'Current',decision:false,source:'Property Record'});
  }
 }
 const rank={Current:0,Upcoming:1,Former:2};
 for(const g of all.values()){g.links.sort((a,b)=>rank[a.state]-rank[b.state]||day(b.affiliation?.startDate).localeCompare(day(a.affiliation?.startDate))||(a.account?.name||a.company?.name||'').localeCompare(b.account?.name||b.company?.name||''));
 const p=g.entity;g.search=[p.name,p.title,p.type,p.email,p.alternateEmail,p.phone,p.personalPhone,p.address,...g.links.flatMap(l=>[l.role,l.account?.name,l.company?.name,l.contact?.name,l.affiliation?.workEmail,l.affiliation?.workPhone])].map(val).join(' ').toLowerCase();}
 return [...all.values()].sort((a,b)=>a.entity.name.localeCompare(b.entity.name)||a.entity.id.localeCompare(b.entity.id));
}
export function matchAccountRelationships(entries:Entry[],q:string,kind:string,scope:string){const query=q.trim().toLowerCase();
 return entries.filter(g=>{
  if(kind&&(kind==='people'?g.entity.kind!=='contact':kind==='owners'?g.entity.kind!=='company'||g.entity.type!=='Apartment owner':g.entity.kind!=='company'))return false;
  if(!scope)return !query||g.search.includes(query);
  const same=g.links.filter(l=>l.state===scope);if(!same.length)return false;
  const p=g.entity;return !query||[p.name,p.title,p.type,p.email,p.alternateEmail,p.phone,p.personalPhone,p.address,...same.flatMap(l=>[l.role,l.account?.name,l.company?.name,l.contact?.name,l.affiliation?.workEmail,l.affiliation?.workPhone])].map(val).join(' ').toLowerCase().includes(query);
 });
}
export function accountRelationshipActivity(rows:Row[],id:string,can:(key:string)=>boolean){
 const company=rows.some(r=>r.id===id&&r.kind==='company'),companyAff=company?rows.filter(r=>r.kind==='affiliation'&&r.companyId===id&&r.contactId&&r.startDate&&!r.deletedAt):[];
 const linked=(r:Row)=>{if(r.contactId===id||r.waitingContactId===id||r.companyId===id)return true;
  const at=day(r.date||r.updatedAt),person=val(r.contactId||r.waitingContactId);
  return !!at&&!!person&&companyAff.some(f=>f.contactId===person&&(!f.accountId||f.accountId===r.accountId)&&relationshipPeriod(f,at)==='Current');};

 // A note on a property alone does not imply this person participated.
 return rows.filter(r=>!r.deletedAt&&linked(r)&&((r.kind==='activity'&&can('activity'))||(r.kind==='email'&&can('email')&&r.status!=='Draft')||(r.kind==='task'&&can('work')))).sort((a,b)=>day(b.date||b.updatedAt).localeCompare(day(a.date||a.updatedAt))||a.id.localeCompare(b.id));
}
