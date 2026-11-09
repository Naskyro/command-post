// Explicit professional preferences used for portfolio reporting; never derive them from personal notes.
export const suggestedBusinessTopics = ['After-Hours Coverage','Bilingual Resident Notices','Carport Call Authorization','Coffee Meetings','Community Events','Digital Permits','Enforcement Consistency','Event Parking','Fast Response','Lunch and Learns','Monthly Reporting','Onsite Visits','Parking Education','Permit Compliance','Quarterly Business Reviews','Resident Communication','Signage Audits','Visitor Parking','Weekend Patrols'];
export function tidyBusinessTopics(input:unknown):string[]|null {
 if(!Array.isArray(input)||input.length>15)return null;
 const result=new Map<string,string>();
 for(const topic of input){
  if(typeof topic!=='string'||/[\u0000-\u001f\u007f]/u.test(topic))return null;
  const label=topic.trim().replace(/\s+/gu,' ');if(!label||label.length>52)return null;
  const canon=suggestedBusinessTopics.find(t=>t.toLocaleLowerCase('en-US')===label.toLocaleLowerCase('en-US'))||label;
  if(!result.has(canon.toLocaleLowerCase('en-US')))result.set(canon.toLocaleLowerCase('en-US'),canon);
 }
 return Array.from(result.values()).sort((a,b)=>a.localeCompare(b));
}
