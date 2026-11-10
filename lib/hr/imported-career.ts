import type {FinRecord} from '../finance/model';
const rows:Record<string,[string,string,number|null][]>= {
 nessa:[['Weekend Overnight Dispatcher','Part-Time',18],['Permit Specialist','Full-Time',18],['Dispatcher','Full-Time',null],['Dispatcher & Admin Coordinator','Full-Time',22],['Dispatch Day Manager','Full-Time',22]],
 dalila:[['Overnight Dispatcher','Full-Time',20],['Overnight Dispatch Manager','Full-Time',22]]
};
export function withImportedCareer(p:FinRecord){if(!rows[p.id])return p;const history=(p.careerHistory||[]) as Record<string,unknown>[];const imports=rows[p.id].map(([title,employmentClass,hourlyRate],i)=>({id:`owner-history-20261027-${p.id}-${i}`,title,employmentClass,hourlyRate,effectiveDate:'',reasonType:i===0?'Initial Agreement':'Reassignment',reason:'Owner-provided career history. Exact date and change reason require confirmation.',recordedBy:'Jerson Arauz (Owner-Provided Source)',source:'Owner instruction, October 27, 2026',historicalOnly:true,imported:true,sequence:i+1}));return {...p,careerHistory:[...history,...imports.filter(e=>!history.some(h=>h.id===e.id))]};}
