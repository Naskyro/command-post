// Presentation of server-projected record snapshots only. Never resolve a current catalog entry here.
export type DisplayedPolicyReference={restricted:true}|{restricted:false;code:string;title:string;version:string;revision:string;state:'current'|'historical'|''};
type Data=Record<string,unknown>;
const str=(v:unknown)=>typeof v==='string'?v.trim():typeof v==='number'&&Number.isSafeInteger(v)?String(v):'';
const obj=(v:unknown):Data=>v&&typeof v==='object'&&!Array.isArray(v)?v as Data:{};
function rows(values:unknown[]):DisplayedPolicyReference[]{
 return values.map(v=>{const r=obj(v),code=str(r.code)||str(r.id),title=str(r.title);
  if(r.restricted===true||!code||!title)return {restricted:true};
  return {restricted:false,code,title,version:str(r.version),revision:str(r.revision),state:r.publicationState==='historical'?'historical':r.publicationState==='current'?'current':''};
 });
}
export function usesSopCitations(d:Data){return Array.isArray(d.sopCitations)||Array.isArray(d.employeePdfCitations);}
export function savedPolicyReferences(d:Data,forEmployeePdf=false):DisplayedPolicyReference[]{
 if(usesSopCitations(d)){
  // The issuer may see more than the person receiving a printed notice. Do not use the issuer's
  // list as a fallback when an older client or incomplete response omits the recipient projection.
  const value=forEmployeePdf?d.employeePdfCitations:d.sopCitations;
  return Array.isArray(value)?rows(value):[{restricted:true}];
 }
 const snap=obj(d.policySnapshot),code=str(snap.id)||str(d.policyReference)||str(d.policyId),title=str(snap.title)||str(d.subject);
 return code?[{restricted:false,code,title,version:str(snap.version)||str(d.policyVersion),revision:'',state:''}]:[];
}
export function referenceDescription(r:DisplayedPolicyReference){
 if(r.restricted)return 'Restricted Policy Reference';
 return [r.code,r.title,r.version&&'Version '+r.version,r.revision&&'Revision '+r.revision].filter(Boolean).join(' · ');
}
