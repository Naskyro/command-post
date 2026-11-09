import {createHash} from 'node:crypto';
import type {Row} from '../accounts/model';
import {AppError} from '../shared/errors.ts';

const val=(v:unknown)=>typeof v==='string'?v.trim():'';
const same=(a:unknown,b:unknown)=>!!val(a)&&val(a).toLowerCase()===val(b).toLowerCase();
export const handoffId=(prefix:string,...parts:string[])=>prefix+':'+createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,40);
export const isSalesSample=(r:Partial<Row>)=>Boolean(r.example||r.isSample||r.sample||r.trainingSample||r.isDemo||String(r.id||'').startsWith('sales-example:'));
const roleName=(role:string)=>({'Assistant Manager':'Assistant Property Manager','Leasing Agent':'Leasing Team'} as Record<string,string>)[role]||role;
const hasDecision=(r:Row)=>r.decisionMaker===true||r.role==='Decision Maker';
const snapshotPrefix='sales-handoff-source:';
const validActivity=(r:Row,lead:string)=>r.kind==='salesActivity'&&r.opportunityId===lead&&!r.deletedAt&&!isSalesSample(r)&&!r.googleMessageId&&!r.gmailMessageId&&!r.gmailThreadId&&!r.threadId&&!r.messageId&&!r.storageKey&&['Phone call','Email','Onsite visit','Meeting','Note','Text message','Video meeting'].includes(val(r.channel||r.name));
const dateNow=(r:Row,day:string)=>(!r.startDate||String(r.startDate)<=day)&&(!r.endDate||String(r.endDate)>day);
export function planHandoffContacts(lead:Row,account:Row,all:Row[],day:string){
 if(isSalesSample(lead))throw new AppError('Training leads cannot be converted into production accounts.');
 const records=new Map(all.map(r=>[r.id,r])),created:Row[]=[],aff:Row[]=[];
 const contacts=new Map(all.filter(r=>r.kind==='contact'&&!isSalesSample(r)&&!r.deletedAt).map(r=>[r.id,r]));
 function fallback(key:string,name:string){
  if(!name)throw new AppError('Complete the name or select a contact for this sales relationship before converting the lead.');
  const id=handoffId('sales-contact',lead.id,key),previous=records.get(id);
  if(previous)throw new AppError('A handoff contact already exists. Review the existing account.');
  const contact:Row={id,kind:'contact',name,version:0,sourceOpportunityId:lead.id,sourceContactSlot:key};
  contacts.set(id,contact);created.push(contact);return contact;
 }
 function relationship(contact:Row,role:string,source:string,meta:Partial<Row>={}){
  const affiliation:Row={id:handoffId('sales-affiliation',lead.id,source),kind:'affiliation',version:0,accountId:account.id,name:roleName(role),role:roleName(role),salesRole:role,contactId:contact.id,companyId:account.companyId,sourceOpportunityId:lead.id,...meta};
  aff.push(affiliation);return affiliation;
 }
 for(const r of all.filter(r=>r.kind==='salesRelationship'&&r.opportunityId===lead.id&&!r.deletedAt&&!isSalesSample(r)).sort((a,b)=>a.id.localeCompare(b.id))){
  let contact=contacts.get(val(r.contactId));
  if(r.contactId&&!contact)throw new AppError('A sales relationship references an unavailable contact. Correct it before marking Won.');
  if(!contact)contact=fallback('relationship:'+r.id,val(r.name));
  relationship(contact,val(r.role)||'Other','relationship:'+r.id,{sourceRelationshipId:r.id,companyId:r.companyId||(dateNow(r,day)?account.companyId:undefined),sourceCompanyName:r.companyName,decisionMaker:hasDecision(r),workEmail:r.email||r.workEmail,workPhone:r.phone||r.workPhone,startDate:r.startDate,endDate:r.endDate,endReason:r.endReason,datePrecision:r.datePrecision});
 }
 const active=()=>aff.filter(r=>dateNow(r,day));
 // Denormalized role names mirror the original link. Suppress that one mirror
 // only inside this lead and role; never merge independent people by name.
 const roles:[string,string][]=[['propertyManager','Property Manager'],['assistantManager','Assistant Manager'],['leasingAgent','Leasing Agent']];
 const decisionRole=val(lead.contactRole)||'Decision Maker';
 const structuredDecision=contacts.get(val(lead.contactId));
 if(lead.contactId&&!structuredDecision)throw new AppError('Choose an existing decision contact before marking Won.');
 if(structuredDecision||val(lead.contactName)){
  let linked=structuredDecision&&active().find(r=>r.contactId===structuredDecision.id&&(r.salesRole===decisionRole||hasDecision(r)));
  const formerOnly=structuredDecision&&aff.some(r=>r.contactId===structuredDecision.id)&&!active().some(r=>r.contactId===structuredDecision.id);
  if(!formerOnly){
   if(!structuredDecision){
    const possible=active().filter(r=>hasDecision(r)&&same(contacts.get(String(r.contactId))?.name,lead.contactName));
    if(possible.length===1)linked=possible[0];
   }
   if(!linked){
    const contact=structuredDecision||fallback('decision',val(lead.contactName));
    linked=relationship(contact,decisionRole,'decision',{decisionMaker:true});
   }
   linked.decisionMaker=true;linked.workEmail=linked.workEmail||lead.email;linked.workPhone=linked.workPhone||lead.phone;
  }
 }
 for(const [key,role] of roles){
  const name=val(lead[key]);if(!name)continue;
  if(active().some(r=>r.salesRole===role&&same(contacts.get(String(r.contactId))?.name,name)))continue;
  // A structured source explicitly ended this exact role; a stale text slot
  // must never resurrect it or manufacture a second copy of the former person.
  if(aff.some(r=>r.salesRole===role&&r.endDate&&same(contacts.get(String(r.contactId))?.name,name)))continue;
  relationship(fallback(key,name),role,key);
 }
 const ranking=(a:Row)=>a.salesRole==='Property Manager'?0:a.contactId===lead.contactId&&hasDecision(a)?1:hasDecision(a)?2:a.salesRole==='Assistant Manager'?3:4;
 const primary=active().sort((a,b)=>ranking(a)-ranking(b)||String(b.startDate||'').localeCompare(String(a.startDate||''))||a.id.localeCompare(b.id))[0];
 if(primary){account.primaryContactId=primary.contactId;account.officeContact=contacts.get(String(primary.contactId))?.name||'';account.email=primary.workEmail||'';account.phone=primary.workPhone||'';}
 else{account.primaryContactId='';account.officeContact='';account.email='';account.phone='';}
 // One or more system-only immutable snapshots hold slim relationship fields.
 // History doesn't consume four D1 writes per row / hit the 80-change API ceiling.
 // Activity bodies stay at the source; only the ID allowlist is frozen at conversion.
 const ids=all.filter(r=>validActivity(r,lead.id)).map(r=>r.id).sort();
 const chunks:string[][]=[];let chunk:string[]=[],size=0;
 for(const s of [...aff.map(f=>JSON.stringify(f)),...ids.map(id=>JSON.stringify(id))]){
  if(size+s.length>100000&&chunk.length){chunks.push(chunk);chunk=[];size=0;}
  chunk.push(s);size+=s.length;
 }
 if(chunk.length)chunks.push(chunk);
 chunks.forEach((entries,i)=>created.push({id:handoffId('sales-handoff-source',lead.id,String(i)),kind:'salesSettings',version:0,name:'Sales Handoff Source',accountId:account.id,sourceOpportunityId:lead.id,entries}));
 return {created,affiliations:aff};
}
export function withSalesHandoffHistory(all:Row[]):Row[]{
 const store=new Map(all.map(r=>[r.id,r])),rows=all.filter(r=>!r.id.startsWith(snapshotPrefix)),added=new Set<string>();
 for(const snapshot of all){
  if(snapshot.kind!=='salesSettings'||!snapshot.id.startsWith(snapshotPrefix)||!Array.isArray(snapshot.entries))continue;
  const account=store.get(val(snapshot.accountId)),lead=val(snapshot.sourceOpportunityId);
  if(!account||account.kind!=='account'||account.sourceOpportunityId!==lead||isSalesSample(account))continue;
  for(const json of snapshot.entries){
   let data:unknown;try{data=JSON.parse(json);}catch{continue;}
   let projected:Row;
   if(typeof data==='string'){
    const src=store.get(data);if(!src||!validActivity(src,lead))continue;
    projected={id:handoffId('sales-history',lead,src.id),kind:'activity',version:0,accountId:account.id,name:'Sales · '+String(src.channel||src.name),channel:src.channel||src.name,
     date:src.date,details:src.details,outcome:src.outcome,contactId:src.contactId,sourceOpportunityId:lead,sourceActivityId:src.id,authorId:src.authorId,updatedBy:src.updatedBy,
     createdAt:src.createdAt,updatedAt:src.updatedAt,readOnly:true};
   }else{
    const r=data as Row;
    if(!r||r.kind!=='affiliation'||r.accountId!==account.id||r.sourceOpportunityId!==lead||!r.id.startsWith('sales-affiliation:'))continue;
    projected=r;
   }
   // A saved Account Management correction to the original affiliation wins.
   if(!store.has(projected.id)&&!added.has(projected.id)){rows.push(projected);added.add(projected.id);}
  }
 }
 return rows;
}
