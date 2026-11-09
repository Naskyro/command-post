import {AppError,ForbiddenError,ConflictError} from '@/lib/shared/errors';
import type {Viewer} from '@/lib/finance/model';
import {docket,propertyOptions,insertEdition} from './docket-server';
import {docketAccess,prepareMatter,type Matter} from './docket-model';
import {canonCause,plain} from './docket-import';
import {hearingCourtKey} from './hearing-facts';
import {sourcePageCount} from './hearing-facts-server';
import type {PropertyLinkReview,PropertyLinkReviewResult} from './property-link-review';
export type PropertyLinkPacketRow={number:string;courtName:string;propertyName:string;accountId:string;propertyAsPrinted:string;basis:string;evidence:{sha256:string;page:number}[]};
type ReviewedTarget={id:string;version:number;expectedAccountId:string;confirmReplace:boolean};
type PropertySnapshot={accounts:Awaited<ReturnType<typeof propertyOptions>>;matters:Matter[]};
export async function reconcilePropertyCourt(v:Viewer,action:unknown,raw:unknown,snapshot?:PropertySnapshot,target?:ReviewedTarget){
 if(!v?.person||!v.id||v.id.startsWith('preview:')||!docketAccess(v,action==='import'))throw new ForbiddenError();
 if(!['preview','receipt','import'].includes(String(action)))throw new AppError('Choose preview, receipt, or import.');
 const b=raw as PropertyLinkPacketRow;if(!b||typeof b!=='object'||Array.isArray(b)||!['number','courtName','propertyName','accountId','propertyAsPrinted','basis'].every(k=>typeof b[k as keyof PropertyLinkPacketRow]==='string'&&String(b[k as keyof PropertyLinkPacketRow]).trim().length&&String(b[k as keyof PropertyLinkPacketRow]).length<520)||!Array.isArray(b.evidence)||!b.evidence.length||b.evidence.length>16||b.evidence.some(x=>!x||!/^[a-f0-9]{64}$/.test(x.sha256)||!Number.isInteger(x.page)||x.page<1||x.page>10000))throw new AppError('An exact court, cause, account, printed property, basis, and source PDF pages are required.');
 const refs=[...new Map(b.evidence.map(x=>[x.sha256+':'+x.page,{sha256:x.sha256,page:x.page}])).values()],key=hearingCourtKey(b.courtName),num=canonCause(b.number);if(!key||!num)throw new AppError('Enter a full court and cause number.');
 const accounts=snapshot?.accounts??await propertyOptions(v),a=accounts.find(x=>x.id===b.accountId);if(!a||plain(a.name)!==plain(b.propertyName))return {status:'review',reason:'The requested account is unavailable or the current property name differs.'};
 const rows=(snapshot?.matters??await docket(v)).filter(x=>canonCause(x.number)===num),same=rows.filter(x=>hearingCourtKey(x.courtName||'')===key);if(same.length!==1||rows.some(x=>!hearingCourtKey(x.courtName||'')))return {status:'review',reason:'No unique saved match for this court and cause.'};
 const m=same[0];if(plain(m.title).includes('city of austin parking enforcement')&&!plain(m.title).includes('parking and towing enforcement'))return {status:'review',reason:'Verify that this case names the company.'};
 if(target&&(m.id!==target.id||m.version!==target.version||(m.accountId||'')!==target.expectedAccountId))throw new ConflictError('This case or its property link changed. Refresh and review the current link before saving.');
 if(m.accountId&&m.accountId!==a.id){
  if(!target?.confirmReplace)return {status:'review',reason:'A different property is already linked. No change was made.'};
  if(!v.owner&&!accounts.some(p=>p.id===m.accountId))throw new ForbiddenError('The current property is outside your account access.');
 }

 const pages=new Map<string,number>();for(const f of m.hearingFacts||[])for(const e of f.evidence)if(e.pageCount)pages.set(e.sha256,e.pageCount);
 const verified=[];for(const c of refs){const doc=m.files?.find(d=>d.sha256===c.sha256&&d.type==='application/pdf');if(!doc)return {status:'review',reason:'A cited original PDF is not attached to this case.'};
 if(!pages.has(c.sha256)){try{pages.set(c.sha256,await sourcePageCount(v,m,doc));}catch(e){if(e instanceof AppError&&e.status===422)return {status:'review',reason:e.message};throw e;}}
 if(c.page>pages.get(c.sha256)!)return {status:'review',reason:'A cited page is outside the original PDF.'};verified.push({...c,fileId:doc.id});}
 const previous=m.propertyLinkHistory?.at(-1),alreadyReviewed=previous?.verification==='source-verified'&&previous.accountId===a.id&&previous.propertyAsPrinted===b.propertyAsPrinted&&previous.basis===b.basis&&JSON.stringify(previous.evidence)===JSON.stringify(verified);
 if(m.accountId===a.id&&(!target||alreadyReviewed))return {status:'confirmed',id:m.id,version:m.version,reason:'This property link is already on file.'};
 if(action!=='import')return {status:'ready',id:m.id,version:m.version,reason:'Original PDF pages checked. Review the selected property, then save the link.'};
 const time=new Date(),next=target?prepareMatter({...m,accountId:a.id,statement:''},m,v,time):{...m,accountId:a.id,version:m.version+1,updatedAt:time.toISOString(),updatedBy:v.name,actorId:v.id};
 next.propertyLinkHistory=[...(m.propertyLinkHistory||[]),{accountId:a.id,...(m.accountId&&m.accountId!==a.id?{fromId:m.accountId}:{}),propertyAsPrinted:b.propertyAsPrinted,basis:b.basis,verification:'source-verified',at:next.updatedAt,by:v.name,byId:v.id,evidence:verified}];
 await insertEdition(next);return {status:'confirmed',id:m.id,version:next.version,reason:'Property link saved with the original PDF page references.'};
}

/** Explicit per-case review. Manual corrections retain a distinct, unverified provenance. */
export async function reviewPropertyCourt(v:Viewer,action:unknown,raw:unknown):Promise<PropertyLinkReviewResult>{
 const save=action==='save-review';
 if(!v?.person||!v.id||v.id.startsWith('preview:')||!docketAccess(v,save))throw new ForbiddenError();
 if(action!=='review'&&!save)throw new AppError('Choose review or save review.');
 const b=raw as PropertyLinkReview;
 if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.caseId!=='string'||!b.caseId||!Number.isInteger(b.version)||b.version<1||typeof b.expectedAccountId!=='string'||typeof b.accountId!=='string'||!b.accountId||!['source','manual'].includes(b.method)||typeof b.basis!=='string'||b.basis.trim().length<8||b.basis.length>500||b.confirmed!==true)throw new AppError('Choose a property, explain how you matched this case, and confirm your review.');
 const [matters,accounts]=await Promise.all([docket(v),propertyOptions(v)]),m=matters.find(m=>m.id===b.caseId),account=accounts.find(a=>a.id===b.accountId);
 if(!m)throw new AppError('This court case is unavailable.',404);
 if(m.version!==b.version||(m.accountId||'')!==b.expectedAccountId)throw new ConflictError('This case or its property link changed. Refresh and review the current link before saving.');
 if(!account)throw new ForbiddenError('Choose a property within your account access.');
 if(m.accountId!==account.id&&m.accountId&&!v.owner&&!accounts.some(a=>a.id===m.accountId))throw new ForbiddenError('The current property is outside your account access.');
 if(b.method==='source'){
  if(typeof b.propertyAsPrinted!=='string'||!b.propertyAsPrinted.trim()||b.propertyAsPrinted.length>500||!Array.isArray(b.evidence)||!b.evidence.length||b.evidence.length>16)throw new AppError('Enter the property as printed and select the original PDF page you checked.');
  const evidence=b.evidence.map(ref=>{
   const doc=ref&&m.files?.find(f=>f.id===ref.fileId&&f.type==='application/pdf');
   if(!doc||!Number.isInteger(ref.page)||ref.page<1)throw new AppError('Select an attached original PDF and a valid page.');
   return {sha256:doc.sha256,page:ref.page};
  });
  return await reconcilePropertyCourt(v,save?'import':'preview',{number:m.number,courtName:m.courtName||'',propertyName:account.name,accountId:account.id,propertyAsPrinted:b.propertyAsPrinted.trim(),basis:b.basis.trim(),evidence},{accounts,matters},{id:m.id,version:b.version,expectedAccountId:b.expectedAccountId,confirmReplace:b.confirmed}) as PropertyLinkReviewResult;
 }
 // The same validator used by Edit Court Record checks the full current matter.
 const next=prepareMatter({...m,accountId:account.id,statement:''},m,v,new Date()),basis=b.basis.trim(),previous=m.propertyLinkHistory?.at(-1);
 if(m.accountId===account.id&&previous?.verification==='manual-review'&&previous.basis===basis)return {status:'confirmed',id:m.id,version:m.version,reason:'This manual review is already on file.'};
 if(!save)return {status:'ready',id:m.id,version:m.version,reason:'Ready to save as a manual property review. An original PDF page has not been verified.'};
 next.propertyLinkHistory=[...(m.propertyLinkHistory||[]),{accountId:account.id,...(m.accountId&&m.accountId!==account.id?{fromId:m.accountId}:{}),at:next.updatedAt,by:v.name,byId:v.id,basis,verification:'manual-review'}];
 await insertEdition(next);return {status:'confirmed',id:m.id,version:next.version,reason:'Property link saved as a manual review. Original PDF verification is not recorded.'};

}

export async function manyPropertyLinks(v:Viewer,action:unknown,records:unknown){
 if(!v?.person||!v.id||v.id.startsWith('preview:')||!docketAccess(v,action==='import'))throw new ForbiddenError();
 if(!['preview','receipt','import'].includes(String(action))||!Array.isArray(records)||!records.length||records.length>(action==='receipt'?16:4))throw new AppError('Use 1–4 property checks per group (up to 16 for receipts).');
 const keys=records.map(r=>r&&typeof r.courtName==='string'&&typeof r.number==='string'?hearingCourtKey(r.courtName)+'/'+canonCause(r.number):'');if(keys.includes('')||new Set(keys).size!==keys.length)throw new AppError('Use distinct, fully named court cases.');
 const [accounts,matters]=await Promise.all([propertyOptions(v),docket(v)]),results=[];for(const r of records){try{results.push(await reconcilePropertyCourt(v,action,r,{accounts,matters}));}catch(e){if(e instanceof ForbiddenError)throw e;results.push({status:'review',reason:e instanceof AppError?e.message:'Source check did not finish. Verify the case before trying again.'});}}return {results};
}
