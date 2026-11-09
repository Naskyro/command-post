// Client-safe shape helpers. Never import a policy archive or protected text here.
import type {Policy,SopContent} from './model';
export type CorrectiveVisibility='employee'|'management';
export type CorrectiveSection={heading:string;text:string;visibility?:CorrectiveVisibility};
export const employeeCorrectiveHeadings=['Conduct Standard','Typical Consequences','Employee Rights & Clarifications'] as const;
export function isCorrectivePolicy(p:{id?:string;code?:string;topicId?:string;originalReference?:string}){
 return [p.topicId,p.code,p.id,p.originalReference].some(v=>typeof v==='string'&&/^HR-CA(?:-|$)/i.test(v.trim()));
}
export function isCorrectiveTopic(t:{id?:string;prefix?:string}){
 return [t.id,t.prefix].some(v=>typeof v==='string'&&/^HR-CA$/i.test(v.trim()));
}
export function isEmployeeCorrectiveHeading(heading:string){return employeeCorrectiveHeadings.some(h=>h===heading.trim());}
export function correctiveSectionVisibility(s:{heading:string;visibility?:string}):CorrectiveVisibility{
 return s.visibility==='employee'&&isEmployeeCorrectiveHeading(s.heading)?'employee':'management';
}
export function hasCorrectiveEmployeeGuide(c:Pick<SopContent,'sections'>){
 return employeeCorrectiveHeadings.slice(0,2).every(heading=>c.sections.some(s=>s.heading.trim()===heading&&correctiveSectionVisibility(s)==='employee'&&!!s.text.trim()));
}
/** Explicitly build the delivery contract. Never spread raw content, even on an already projected copy. */
export function employeeCorrectiveContent(p:Policy):SopContent {
 const c=p.content,sections=c.sections.filter(s=>correctiveSectionVisibility(s)==='employee'&&!!s.text.trim())
  .map(s=>({heading:s.heading.trim(),text:s.text,visibility:'employee' as const}));
 return {title:c.title,shortName:c.shortName,preparedDate:'',effectiveDate:c.effectiveDate,revision:c.revision,approvalStatus:p.status,
  policyOwner:'',keywords:'',relatedIds:[],sections};
}
