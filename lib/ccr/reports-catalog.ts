import type {Viewer} from '../finance/model';
import {canAccess} from '../finance/access.ts';
import {ForbiddenError} from '../shared/errors.ts';
import {isCcrTab} from './navigation.ts';
export const reportDesks={hearings:'Court Docket',damage:'Damage Claims',tdlr:'TDLR Complaints',recovery:'Chargebacks & Recovery',licenses:'Licenses & Testing',calendar:'Compliance Calendar',evidence:'Inspection & Evidence'} as const;
export type ReportDesk=keyof typeof reportDesks;
export type Def={id:string;desk:ReportDesk;title:string;question:string;basis:string;unit:'Records'|'Appearances'|'Documents'|'Deadlines'|'Entries';money?:boolean;rate?:'court'|'bank'|'responded'};
const d=(desk:ReportDesk,id:string,title:string,question:string,basis:string,opts:Partial<Pick<Def,'unit'|'money'|'rate'>>={}):Def=>({desk,id,title,question,basis,unit:'Records',...opts});
export const catalog:Def[]=[
 d('hearings','lawsuit-cause','Lawsuits by Cause','What issues are bringing PTE into lawsuits?','Filed Date'),
 d('hearings','proceeding-type','Court Cases by Proceeding Type','How much of the docket is tow hearings, lawsuits, or other matters?','Filed Date'),
 d('hearings','court-status','Court Cases by Status','Which cases are open, closed, or still missing a verified outcome?','Filed Date'),
 d('hearings','tow-rulings','Tow Hearing Outcomes','How often does PTE prevail in tow hearings with a verified win or loss?','Disposition Date',{rate:'court'}),
 d('hearings','jp-rulings','JP Tow Hearing Outcomes','How often did PTE win a verified ruling in a named Justice Court precinct? County appeals are excluded.','Disposition Date',{rate:'court'}),
 d('hearings','county-outcomes','County Court at Law Outcomes','What dispositions are recorded separately at the county court level?','Disposition Date',{rate:'court'}),
 d('hearings','courthouse','Caseload by Court','Which courts or JP precincts are handling our cases?','Filed Date'),
 d('hearings','court-property','Court Cases by Property','Which properties are associated with the most court matters?','Filed Date'),
 d('hearings','appearances','Court Appearances by Month','When are appearances scheduled and which were continued or attended?','Appearance Date',{unit:'Appearances'}),
 d('hearings','settlement-timing','Court Settlements by Stage','Were cases settled before filing, at the courthouse, or after a hearing?','Disposition Date'),
 d('damage','damage-source','Damage Claims by Source','How many records came from property claims, employee assets, or direct incident intake?','Reported Date'),
 d('damage','damage-status','Damage Claims by Status','Which records are open, closed, paid, or awaiting proof of outcome?','Reported Date'),
 d('damage','damage-property','Damage Claims by Property','Which linked or explicitly identified properties have the most damage records?','Reported Date'),
 d('damage','damage-month','Damage Claims by Month','How many claims and directly reported incidents were recorded by reported month?','Reported Date'),
 d('damage','damage-paid','Property Claim Payments','What amounts have actually been recorded as paid on property claims?','Payment Date',{money:true}),
 d('damage','damage-settled','Damage Settlements by Stage','When have damage claims been settled, including at the courthouse?','Settlement Date'),
 d('tdlr','tdlr-type','TDLR Cases by Category','What types of agency matters are we handling?','Record Created'),
 d('tdlr','tdlr-topic','TDLR Complaint Subjects','What are complaints about: authorization, signage, fees, release paperwork, or other issues?','Record Created'),
 d('tdlr','tdlr-status','TDLR Response Status','Which complaints need a response or are awaiting the agency?','Record Created'),
 d('recovery','processors','Chargebacks by Processor','Which processors are sending us disputes?','Record Created'),
 d('recovery','bank-outcomes','Bank Decisions on Chargebacks','How often does the bank side with PTE on decided disputes?','Record Created',{rate:'bank'}),
 d('recovery','responses','Chargeback Response Coverage','Who filed a response, and which disputes missed a response?','Record Created',{rate:'responded'}),
 d('recovery','deadlines','Outstanding Dispute Deadlines','Which processor replies, signed elections, or repayment follow-ups are due?','Deadline',{unit:'Deadlines'}),
 d('recovery','mail','Certified Mail Recovery Status','Which chargebacks have a letter prepared, sent, delivered, or returned?','Record Created'),
 d('recovery','costs','Itemized Chargeback Costs','How much have we spent on certified mail, filing, processor fees, and other costs?','Expense Date',{money:true,unit:'Entries'}),
 d('recovery','repayments','Net Recovery by Processor','How much has been recovered through payments and posted processor credits, after recorded refunds?','Transaction Date',{money:true,unit:'Entries'}),
 d('licenses','licenses-due','License & Testing Deadlines','Which open credential or testing records have deadlines in the next 30 or 90 days?','Due Date'),
 d('calendar','calendar-due','Compliance Calendar Deadlines','Which open obligations are overdue, due soon, or missing a deadline?','Due Date'),
 d('evidence','file-types','Inspection Evidence by Document Type','Which document types are indexed in inspection packets?','Upload Date',{unit:'Documents'}),
];
const CCR='Compliance, Claims & Recovery';
export function permittedReports(v:Viewer){if(!v.person||v.id.startsWith('preview:')||v.onboardingOnly||!canAccess(v,CCR,'reports'))throw new ForbiddenError();return catalog.filter(r=>isCcrTab(r.desk)&&canAccess(v,CCR,r.desk));}
export function permittedReport(v:Viewer,id:string){const def=permittedReports(v).find(d=>d.id===id);if(!def)throw new ForbiddenError('This report or its source section is not assigned to you.');return def;}
