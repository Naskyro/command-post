// Stored snapshots are evidence. Project them for the reader instead of rewriting personnel records.
import type {HrRecord} from './model';
import type {FinRecord,Viewer} from '../finance/model';
import {canManageCorrectiveContent} from '../sop/corrective-access';
import {describePerformanceSopCitations,describeRecipientPerformanceSopCitations} from './performance-sop-links';
const restricted={restricted:true} as const;
const refKey=(c:{id:string;version:number})=>c.id+'|'+c.version;
const hiddenSubject='Restricted Policy Reference';

export async function correctiveRecordView(record:HrRecord,viewer:Viewer,people:FinRecord[]):Promise<HrRecord> {
 if(record.kind!=='corrective'&&record.kind!=='note')return record;
 const who=people.find(p=>p.kind==='person'&&p.id===viewer.person),employee=people.find(p=>p.kind==='person'&&p.id===record.personId);
 const data={...record.data};
 // Raw generated fields are never authoritative, including if an older compromised client stored them.
 delete data.employeePdfCitations;delete data.employeePolicySubject;
 if(data.policySnapshot&&(!who||!canManageCorrectiveContent(who))){
   const snapshot=data.policySnapshot as Record<string,unknown>;
   data.policySnapshot=Object.fromEntries(['id','title','version','effectiveDate','category','group'].filter(k=>typeof snapshot[k]==='string').map(k=>[k,snapshot[k]]));
 }
 if(Array.isArray(data.sopCitations)&&data.sopCitations.length){
   delete data.policyIds;
   const saved=data.sopCitations;
   const visible=await describePerformanceSopCitations(saved,viewer,people),map=new Map(visible.map(c=>[refKey(c),c]));
   const refs=saved.map(c=>map.get(refKey(c))||restricted);
   data.sopCitations=refs;
   if(record.kind==='corrective'){
     // Each generated notice is meant for the employee: intersect viewer and recipient permissions.
     const employeeVisible=viewer.person===record.personId?visible:employee?await describeRecipientPerformanceSopCitations(saved,employee,people):[];
     const permitted=new Set(employeeVisible.map(refKey));
     const paper=saved.map(c=>permitted.has(refKey(c))?map.get(refKey(c))||restricted:restricted);
     data.employeePdfCitations=paper;data.employeePolicySubject='title' in paper[0]?paper[0].title:hiddenSubject;
     if(!('title' in refs[0])){
       data.subject=hiddenSubject;
       for(const k of ['policyReference','policySnapshot','policyVersion','policyEffectiveDate'])delete data[k];
     }
   }
 }
 return {...record,data};
}
