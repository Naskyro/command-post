import type {Row} from '../accounts/model';
import {isSalesSample} from './handoff-relationships';
import {ConflictError} from '../shared/errors';
export const leadExterior='Sales property exterior';
export function photoAccount(lead:Row,all:Row[],strict=false){
 if(!lead.onboardingAccountId)return undefined;
 const account=all.find(r=>r.kind==='account'&&r.id===lead.onboardingAccountId&&r.sourceOpportunityId===lead.id);
 if(!account&&strict)throw new ConflictError('The linked property has changed. Refresh the lead.');
 return account;
}
export function propertyFiles(lead:Row,all:Row[],account=photoAccount(lead,all)){
 if(isSalesSample(lead)||lead.onboardingAccountId&&!account)return [];
 return all.filter(f=>f.kind==='file'&&f.status==='Current'&&(account?f.category==='Account photo'&&f.accountId===account.id:f.category===leadExterior&&f.opportunityId===lead.id&&!f.accountId)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||b.id.localeCompare(a.id));
}
export function propertyPhotoFields(lead:Row,all:Row[]){
 const f=propertyFiles(lead,all)[0];
 return f?{propertyPhotoId:f.id,propertyPhotoUrl:'/api/sales/property-photo?leadId='+encodeURIComponent(lead.id)+'&v='+encodeURIComponent(f.id)}:{propertyPhotoId:'',propertyPhotoUrl:''};
}
export function promotePropertyPhoto(lead:Row,account:Row,all:Row[]){
 const file=all.filter(f=>f.kind==='file'&&f.category===leadExterior&&f.opportunityId===lead.id&&!f.accountId&&f.status==='Current').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||b.id.localeCompare(a.id))[0];
 return !file?undefined:{old:file,next:{...file,accountId:account.id,category:'Account photo',sourceOpportunityId:lead.id}};
}

// Index once per directory request: a missing legacy association must never break the CRM.
export function exteriorDirectory(all:Row[]){
 const accounts=new Map(all.filter(r=>r.kind==='account').map(a=>[a.id,a])),files=new Map<string,Row>();
 for(const f of all.filter(r=>r.kind==='file'&&r.status==='Current'&&(r.category===leadExterior||r.category==='Account photo')).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||b.id.localeCompare(a.id))){
  const k=f.category===leadExterior&&!f.accountId?'lead:'+f.opportunityId:f.category==='Account photo'?'account:'+f.accountId:'';if(k&&!files.has(k))files.set(k,f);
 }
 return (lead:Row)=>{const account=accounts.get(String(lead.onboardingAccountId||'')),f=lead.onboardingAccountId?(account?.sourceOpportunityId===lead.id?files.get('account:'+account!.id):undefined):files.get('lead:'+lead.id);
 return f?{propertyPhotoId:f.id,propertyPhotoUrl:'/api/sales/property-photo?leadId='+encodeURIComponent(lead.id)+'&v='+encodeURIComponent(f.id)}:{propertyPhotoId:'',propertyPhotoUrl:''};};
}
