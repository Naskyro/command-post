// Server only. The approved original strings and management guidance must never enter a client bundle.
// Match the two reviewed sections exactly: a stray note, edited mixed section, or unknown future
// source must never be converted into employee text merely because it reused an old policy ID.
import reviewedJson from './private/corrective-employee-guides.json' with {type:'json'};
import sourceCatalog from './private/catalog.json' with {type:'json'};
import {isCorrectivePolicy,type CorrectiveSection} from './corrective-content.ts';
import type {SopContent} from './model';
type Reviewed={reviewedStandard:string;reviewedResponse:string;reviewedBoundary:string;conduct:string;consequences:string;rights:string};
const reviewed:Readonly<Record<string,Reviewed>>=reviewedJson;
const archive=new Map(sourceCatalog.filter(p=>p.topicId==='HR-CA').map(p=>[p.id,p]));
const decisionHeading='Management Decision Guidance';
const managerGuidance=[
 'Start with the usual response in this policy. It is guidance for consistent decisions, not a guaranteed sequence or an automatic outcome. Exercise discretion within the policy and your approval authority.',
 'Compare the current facts with similar cases. Consider relevant differences such as training, prior history, intent, actual impact, and foreseeable risk; record the factual reason if you recommend a different response.',
 'When the facts are unclear or your recommendation differs from the usual response, seek a second review. This is a recommendation; follow any review, escalation, conflict-of-interest, or approval requirements already stated in the policy.',
].join('\n');
export function withImportedCorrectiveSections<T extends {id:string;code?:string;topicId?:string;accessEdition?:string;content:SopContent}>(policy:T):T {
 if(!isCorrectivePolicy(policy)||policy.accessEdition==='employee')return policy;
 const existing:CorrectiveSection[]=policy.content.sections;
 let sections=[...existing];
 // Once an author has classified a record, never revive a section that was removed or reclassified.
 if(!existing.some(s=>s.visibility!==undefined)){
  const ref=Object.prototype.hasOwnProperty.call(reviewed,policy.id)?reviewed[policy.id]:undefined;
  const only=(heading:string)=>{const matches=existing.filter(s=>s.heading===heading);return matches.length===1?matches[0].text:undefined;};
  sections=existing.map(s=>({...s,visibility:'management'}));
  const original=archive.get(policy.id);
  if(ref&&original&&original.content.title===policy.content.title&&original.content.sections.length===existing.length&&original.content.sections.every((section,i)=>section.heading===existing[i].heading&&section.text===existing[i].text)){
   // Preserve protective qualifications as well as outcomes. Withhold automatic curation of the
   // whole document if any reviewed section changed; an editor can author the two guides explicitly.
   const procedure=only('Procedure')||'';
   const boundaries=existing.filter(s=>s.heading==='Related Decisions & Boundaries');
   if(only('Policy Standard')===ref.reviewedStandard&&only('Normal Category & Usual Starting Response')===ref.reviewedResponse&&
      (ref.reviewedBoundary?only('Related Decisions & Boundaries')===ref.reviewedBoundary:boundaries.length===0)&&
      procedure.includes('These are usual responses, not guaranteed steps or an automatic finding.')&&
      procedure.includes('Protect applicable leave, accommodation, good-faith reporting and other legal rights.')){
    sections.unshift({heading:'Conduct Standard',text:ref.conduct,visibility:'employee'},
     {heading:'Typical Consequences',text:ref.consequences,visibility:'employee'},
     {heading:'Employee Rights & Clarifications',text:ref.rights,visibility:'employee'});
   }
  }
 }
 if(!sections.some(s=>s.heading===decisionHeading))sections.push({heading:decisionHeading,text:managerGuidance,visibility:'management'});
 if(sections.length===existing.length&&sections.every((s,i)=>s===existing[i]))return policy;
 return {...policy,content:{...policy.content,sections}};
}
