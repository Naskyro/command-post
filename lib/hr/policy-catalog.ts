/** Source: supplied Company_Wide_Corrective_Action_SOP(2).pdf, HR-CA v3.0.
 * Subjects, category ranges, descriptions, and usual responses transcribed from the source tables.
 * Groups organize the selector only; they do not change policy or automate discipline.
 */
export const HR_CA_POLICY_VERSION = '3.0';
export const HR_CA_EFFECTIVE_DATE = '2026-07-01';
export type HrPolicy = { id: string; title: string; category: string; description: string; response: string; version: string; effectiveDate: string; group: string };
export const HR_CA_POLICIES: HrPolicy[] = [
  {
    "id": "HR-CA-001",
    "title": "Absence / No-Call, No-Show",
    "category": "2 or 3",
    "description": "Missing a scheduled shift without required notice. A pattern is Category 2; abandoning a critical shift or causing serious operational exposure may be Category 3.",
    "response": "Documented or written warning; final warning or termination review when serious or repeated.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Schedule & Attendance"
  },
  {
    "id": "HR-CA-002",
    "title": "Admitting Fault, Illegality, or Liability",
    "category": "3",
    "description": "Telling a customer, resident, property, government official, or other person that the Company acted illegally, caused damage, owes money, or is at fault without authorization.",
    "response": "Management review; written/final warning, suspension, or termination depending on exposure.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Customer & Property Relations"
  },
  {
    "id": "HR-CA-003",
    "title": "Bribes / Kickbacks",
    "category": "4",
    "description": "Accepting or requesting money, favors, gifts, or side payments in exchange for Company action.",
    "response": "Generally immediate termination if substantiated.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Financial Integrity"
  },
  {
    "id": "HR-CA-004",
    "title": "Bullying, Intimidation, or Abusive Conduct",
    "category": "2, 3, or 4",
    "description": "Repeated hostile, humiliating, intimidating, or abusive conduct toward a coworker, customer, resident, vendor, or other person. Serious intimidation, account harm, or fear of harm advances the matter.",
    "response": "Written/final warning or management review; Category 4 when combined with threats, violence, unlawful harassment, discrimination, or retaliation.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Conduct & Employee Relations"
  },
  {
    "id": "HR-CA-005",
    "title": "Company Credit Card, Fuel Card, or Expense Misuse",
    "category": "3 or 4",
    "description": "Unauthorized use, unsupported charges, failure to follow receipt or approval rules, or spending that creates financial exposure. Intentional personal use or a fraudulent claim is Category 4.",
    "response": "Preserve records and escalate; written/final warning through immediate termination depending on intent.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Financial Integrity"
  },
  {
    "id": "HR-CA-006",
    "title": "Company Vehicle or Equipment Misuse",
    "category": "3",
    "description": "Unauthorized use, unsafe operation, prohibited passengers, personal use, or careless handling that creates significant risk.",
    "response": "Written/final warning, loss of driving/access privileges, suspension, or termination review.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-007",
    "title": "Confidential or Internal Account Information",
    "category": "3 or 4",
    "description": "Unauthorized disclosure of customer, employee, property-account, pricing, financial, operational, or management information.",
    "response": "Category 3 when unauthorized; Category 4 when intentional, harmful, retaliatory, fraudulent, or for personal gain.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Confidentiality & Access"
  },
  {
    "id": "HR-CA-008",
    "title": "Conflict of Interest or Outside Solicitation",
    "category": "3 or 4",
    "description": "Using Company time, access, relationships, information, customers, residents, vendors, or opportunities for an undisclosed personal or outside-business interest.",
    "response": "Management review and written/final warning; Category 4 for kickbacks, theft, fraud, diverted business, or intentional misuse of confidential information.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Financial Integrity"
  },
  {
    "id": "HR-CA-009",
    "title": "Customer Service / Rude Conduct",
    "category": "1 to 2 or 3",
    "description": "An isolated unprofessional response is Category 1; repeated complaints are Category 2; serious escalation, account harm, or liability is Category 3.",
    "response": "Coach first when minor; advance to warning or management review based on pattern or impact.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Customer & Property Relations"
  },
  {
    "id": "HR-CA-010",
    "title": "Damage to a Vehicle, Property, or Equipment",
    "category": "3 or 4",
    "description": "Significant preventable damage is Category 3. Intentional damage, sabotage, or concealment is Category 4.",
    "response": "Preserve evidence and notify management; warning through termination depending on facts.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-011",
    "title": "Dishonesty",
    "category": "3 or 4",
    "description": "Lying during an investigation, concealing material facts, dishonest blame-shifting, or misleading the Company for a benefit.",
    "response": "Final warning or termination; Category 4 when intentional and trust-destroying.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Conduct & Employee Relations"
  },
  {
    "id": "HR-CA-012",
    "title": "Dress Code",
    "category": "1 to 2",
    "description": "Failure to follow ordinary appearance or uniform requirements without a safety, accommodation, or protected-rights issue.",
    "response": "Coaching for an isolated issue; documented warning if repeated.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Conduct & Employee Relations"
  },
  {
    "id": "HR-CA-013",
    "title": "Drugs, Alcohol, or Impairment at Work",
    "category": "4",
    "description": "Possessing or using illegal drugs while working, using alcohol on duty, or reporting impaired by alcohol or illegal drugs. Medical or prescribed-medication safety concerns require a separate confidential review and are not automatically misconduct.",
    "response": "Remove from safety-sensitive work; generally immediate termination if substantiated.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-014",
    "title": "Excessive Personal Phone or Internet Use",
    "category": "1 to 2 or 3",
    "description": "Personal calls, messaging, social media, streaming, gaming, or browsing that interferes with work. It becomes Category 3 when driving, safety, security, customer service, or critical coverage is affected.",
    "response": "Coach an isolated low-impact issue; warn repeated misuse; escalate immediately when serious exposure is created.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Work Performance"
  },
  {
    "id": "HR-CA-015",
    "title": "Failure to Cooperate in a Company Investigation",
    "category": "3 or 4",
    "description": "Refusing to provide job-related information, records, or truthful answers that the Company may lawfully request. This does not require an employee to waive a protected legal right.",
    "response": "Management review; Category 4 for lying, evidence destruction, witness intimidation, or retaliation.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Conduct & Employee Relations"
  },
  {
    "id": "HR-CA-016",
    "title": "Failure to Follow a Procedure or Checklist",
    "category": "1 to 2 or 3",
    "description": "An isolated low-impact miss is Category 1; repeated misses are Category 2; any miss creating material safety, legal, financial, confidentiality, or account exposure is Category 3.",
    "response": "Coach or warn when minor; management review when serious exposure is created.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Work Performance"
  },
  {
    "id": "HR-CA-017",
    "title": "Failure to Maintain a Required License or Certification",
    "category": "3 or 4",
    "description": "Allowing a required license, certification, endorsement, or qualification to expire, lapse, or become invalid, or failing to report a restriction that prevents lawful or safe job performance.",
    "response": "Remove from affected duties and conduct management review; Category 4 for intentional falsification or misrepresentation.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Licenses & Compliance"
  },
  {
    "id": "HR-CA-018",
    "title": "Failure to Report an Accident, Damage, Injury, or Serious Complaint",
    "category": "3 or 4",
    "description": "Not promptly reporting a work-related accident, vehicle or property damage, injury, safety event, or serious customer complaint as required.",
    "response": "Preserve evidence and conduct management review; Category 4 for intentional concealment, evidence destruction, or falsification.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-019",
    "title": "Failure to Return Company Property",
    "category": "2 to 3 or 4",
    "description": "Failing to timely return keys, cards, uniforms, devices, documents, equipment, vehicles, money, or other Company property after a request, reassignment, suspension, or separation.",
    "response": "Written/final warning or recovery action; Category 4 for intentional retention, sale, destruction, or conversion for personal use.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Company Property"
  },
  {
    "id": "HR-CA-020",
    "title": "Falsifying Records or Evidence",
    "category": "3 or 4",
    "description": "A reckless material record error is Category 3. Knowingly creating, changing, hiding, backdating, or destroying records or evidence is Category 4.",
    "response": "Preserve originals and escalate; final warning through immediate termination.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Records & Documentation"
  },
  {
    "id": "HR-CA-021",
    "title": "Fighting, Violence, or Threats",
    "category": "4",
    "description": "Physical fighting, threats of violence, assault, or intentional use of a vehicle or equipment as a weapon.",
    "response": "Address safety and contact authorities when necessary; generally immediate termination.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-022",
    "title": "Harassment, Discrimination, or Retaliation",
    "category": "4",
    "description": "Substantiated harassment, sexual harassment, discrimination, or retaliation against a person for a protected report or activity.",
    "response": "Immediate management investigation; generally termination if substantiated.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Conduct & Employee Relations"
  },
  {
    "id": "HR-CA-023",
    "title": "Horseplay or Practical Jokes",
    "category": "1 to 2 or 3",
    "description": "Disruptive joking, pranks, scuffling, or horseplay. An isolated harmless issue may be minor; conduct involving vehicles, equipment, customers, property, or foreseeable injury is Category 3.",
    "response": "Coach or warn when minor; stop the activity and escalate when safety, property, or customers are exposed.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-024",
    "title": "Insubordination / Refusal of Instruction",
    "category": "3",
    "description": "Refusing a clear, lawful, job-related instruction or openly defying authorized supervision. Respectful disagreement, reporting safety concerns, or protected activity is not insubordination.",
    "response": "Written/final warning or termination review; Category 4 if combined with threats, violence, sabotage, or fraud.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Conduct & Employee Relations"
  },
  {
    "id": "HR-CA-025",
    "title": "Leaving a Shift or Assigned Post Without Approval",
    "category": "2 or 3",
    "description": "Leaving early, abandoning an assigned post, becoming unavailable, or failing to remain at the required work location without permission or an emergency.",
    "response": "Documented/written warning; final warning or termination review when critical coverage, customers, safety, security, or operations are left exposed.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Schedule & Attendance"
  },
  {
    "id": "HR-CA-026",
    "title": "Lost Keys, Access Cards, Devices, or Company Records",
    "category": "1 to 2 or 3",
    "description": "Losing or failing to safeguard keys, access credentials, phones, tablets, documents, or records. Security, privacy, financial, or customer-property exposure makes the matter Category 3.",
    "response": "Secure access immediately; coach or warn when minor; management review when exposure is created.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Confidentiality & Access"
  },
  {
    "id": "HR-CA-027",
    "title": "Missed or Unfinished Task",
    "category": "1 to 2 or 3",
    "description": "An isolated non-critical task is Category 1; repeated failures form Category 2; a critical failure creating serious exposure is Category 3.",
    "response": "Coach, document the pattern, or escalate based on impact.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Work Performance"
  },
  {
    "id": "HR-CA-028",
    "title": "Paperwork or Data-Entry Error",
    "category": "1 to 2 or 3",
    "description": "An isolated correctable error is Category 1; repeated errors are Category 2; materially inaccurate legal, financial, safety, or regulatory records are Category 3.",
    "response": "Correct and coach; warning for patterns; management review for material records.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Records & Documentation"
  },
  {
    "id": "HR-CA-029",
    "title": "Password, Alarm Code, or System-Access Sharing",
    "category": "3 or 4",
    "description": "Sharing passwords, alarm codes, logins, access cards, or other credentials without authorization, or allowing another person to use an assigned account.",
    "response": "Secure access and notify management; Category 4 when done for fraud, theft, retaliation, personal gain, or intentional harm.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Confidentiality & Access"
  },
  {
    "id": "HR-CA-030",
    "title": "Poor Communication",
    "category": "1 to 2 or 3",
    "description": "Minor inconvenience from unclear or missed communication is Category 1; repeated communication failures are Category 2; unauthorized disclosure or admission is Category 3.",
    "response": "Coach or warn; escalate when the statement creates exposure.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Work Performance"
  },
  {
    "id": "HR-CA-031",
    "title": "Poor Housekeeping or Failure to Maintain the Work Area",
    "category": "1 to 2 or 3",
    "description": "Failing to keep an assigned work area reasonably clean, organized, or free of known hazards. A serious safety, fire, equipment, or property hazard is Category 3.",
    "response": "Correct and coach; warn repeated issues; stop work and escalate when a serious hazard exists.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-032",
    "title": "Safety Violation",
    "category": "3 or 4",
    "description": "Unsafe work, bypassing a critical safety rule, or continuing an activity after a serious hazard becomes known.",
    "response": "Stop the activity and preserve evidence; final warning, suspension, or termination. Category 4 when intentional and trust-destroying.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-033",
    "title": "Schedule Change or Shift Swap Without Approval",
    "category": "1 to 2 or 3",
    "description": "Changing a schedule, trading a shift, arranging coverage, or failing to report for the assigned schedule without required approval.",
    "response": "Coach or warn; Category 3 when the change leaves a critical shift uncovered or creates serious operational exposure.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Schedule & Attendance"
  },
  {
    "id": "HR-CA-034",
    "title": "Sleeping on Duty",
    "category": "3",
    "description": "Dispatcher asleep while responsible for calls, the window, gate, or yard; driver asleep and unavailable without authorization while dispatched/on duty; or continuing to drive after recognizing dangerous fatigue without reporting it.",
    "response": "Remove from safety-sensitive duty and conduct management review; final warning, suspension, or termination. Category 4 if paired with time theft, falsified logs, drugs, or deliberate operation after being told to stop.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-035",
    "title": "Smoking or Vaping in a Prohibited Area",
    "category": "1 to 2 or 3",
    "description": "Smoking or vaping where prohibited by Company or property rules. Conduct near fuel, hazardous materials, vehicles, or another serious fire risk is Category 3.",
    "response": "Coach or warn when minor; stop the activity and escalate immediately when a serious hazard is created.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Safety & Equipment"
  },
  {
    "id": "HR-CA-036",
    "title": "Social Media Misconduct",
    "category": "3 or 4",
    "description": "Posting, commenting, or sharing negative, insulting, mocking, disparaging, or confidential content about customers, residents, property accounts, vendors, coworkers, or Company business when the employment connection is identifiable. This includes speaking negatively about customers from a personal account.",
    "response": "Management review; written/final warning or termination. Category 4 for threats, unlawful harassment, retaliation, fabricated harmful claims, confidential disclosures, or deliberate severe harm.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Confidentiality & Access"
  },
  {
    "id": "HR-CA-037",
    "title": "Tardiness",
    "category": "1 to 2",
    "description": "Occasional lateness is Category 1. Repeated lateness or different attendance problems showing unreliable attendance are Category 2.",
    "response": "Coaching first; documented verbal, written, or final warning as the pattern continues.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Schedule & Attendance"
  },
  {
    "id": "HR-CA-038",
    "title": "Theft / Fraud / Time Theft",
    "category": "4",
    "description": "Stealing money or property, payroll fraud, knowingly claiming time not worked, or fraudulent transactions.",
    "response": "Generally immediate termination if substantiated; preserve records and notify authorities when appropriate.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Financial Integrity"
  },
  {
    "id": "HR-CA-039",
    "title": "Timeclock Error",
    "category": "1 to 2 or 4",
    "description": "An isolated missed punch is Category 1; repeated missed punches are Category 2; intentionally false time is Category 4 time theft.",
    "response": "Correct and coach; warn for a pattern; termination review for intentional falsification.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Schedule & Attendance"
  },
  {
    "id": "HR-CA-040",
    "title": "Unauthorized Overtime or Off-the-Clock Work",
    "category": "1 to 2, 3, or 4",
    "description": "Working overtime without required approval may be coached or disciplined, but every hour worked must still be accurately reported and paid. Knowingly working off the clock, concealing work time, or directing another employee not to report time creates serious liability.",
    "response": "Correct and pay the time record; coach or warn unauthorized overtime; management review for concealed time; Category 4 for intentional payroll falsification or fraud.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Schedule & Attendance"
  },
  {
    "id": "HR-CA-041",
    "title": "Unauthorized Promise, Discount, Release, or Change",
    "category": "3",
    "description": "Making a commitment, waiver, discount, release, permit/account change, refund, or other Company decision without required authority.",
    "response": "Management review; written/final warning, suspension, or termination depending on exposure.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Customer & Property Relations"
  },
  {
    "id": "HR-CA-042",
    "title": "Unauthorized Recording, Photography, or Sharing",
    "category": "3 or 4",
    "description": "Recording, photographing, copying, posting, or sharing confidential customer/property records, private personal information, secure areas, active incidents, or restricted Company information without authorization. Lawfully protected employee activity is not prohibited.",
    "response": "Preserve evidence and conduct management review; Category 4 for fraud, retaliation, harassment, intentional disclosure, or deliberate harm.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Confidentiality & Access"
  },
  {
    "id": "HR-CA-043",
    "title": "Unauthorized Visitors, Passengers, or Restricted-Area Access",
    "category": "2 or 3",
    "description": "Allowing an unauthorized visitor or passenger into a Company vehicle, work area, yard, office, restricted area, or other controlled location.",
    "response": "Remove the unauthorized person and document the event; Category 3 when safety, security, customer property, or Company liability is exposed.",
    "version": "3.0",
    "effectiveDate": "2026-07-01",
    "group": "Confidentiality & Access"
  }
];
export const HR_CA_CATEGORIES = [
 { value: '1', label: 'Category 1 — Minor / Isolated', reviewer: 'Supervisor' },
 { value: '2', label: 'Category 2 — Repeated Pattern', reviewer: 'Supervisor and Manager' },
 { value: '3', label: 'Category 3 — Serious / Liability', reviewer: 'Authorized Management' },
 { value: '4', label: 'Category 4 — Gross Misconduct', reviewer: 'Senior Management / Ownership' },
];
export const HR_CA_ACTIONS = ['Coaching Conversation', 'Documented Verbal Warning', 'Written Warning', 'Final Written Warning', 'Performance Improvement Plan', 'Suspension Review', 'Termination Review'];
export const HR_CA_GUIDANCE = 'An allegation is not a finding. Review the facts, employee explanation, training, history, actual impact, and foreseeable risk. Category ranges and usual responses guide human review; they do not issue discipline automatically. Related violations from one incident normally belong in one action. The 12-month active period does not delete the record.';
export const HR_DISAGREEMENT_REASONS = ['Facts Are Inaccurate', 'Important Context Is Missing', 'Policy Does Not Apply', 'Action Is Disproportionate', 'Other'];
export function findHrPolicy(id: unknown) { return HR_CA_POLICIES.find(p => p.id === String(id)); }
