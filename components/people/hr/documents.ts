import {referenceDescription,savedPolicyReferences,usesSopCitations} from '../../../lib/hr/performance-reference-labels.ts';
import { legalPersonName } from '../../../lib/people/display-name.ts';
import type { jsPDF } from 'jspdf';
import { buildTemplateJobDescription } from './job-description-pdf.ts';

export type HrDocumentKind = 'offer' | 'jobDescription' | 'corrective' | 'onboarding';
export type HrDocumentField = { key: string; label: string; required?: boolean; multiline?: boolean };
export const officialHrForms = [
  { id: 'i9', title: 'Form I-9', description: 'Employment Eligibility Verification', url: 'https://www.uscis.gov/i-9', instructions: 'https://www.uscis.gov/sites/default/files/document/forms/i-9instr.pdf' },
  { id: 'w4', title: 'Form W-4', description: 'Employee Withholding Certificate', url: 'https://www.irs.gov/forms-pubs/about-form-w-4', instructions: 'https://www.irs.gov/pub/irs-pdf/fw4.pdf' },
  { id: 'w9', title: 'Form W-9', description: 'Request for Taxpayer Identification Number and Certification', url: 'https://www.irs.gov/forms-pubs/about-form-w-9', instructions: 'https://www.irs.gov/pub/irs-pdf/fw9.pdf' },
];

export const hrDocumentFields: Record<HrDocumentKind, HrDocumentField[]> = {
  offer: [
    { key: 'title', label: 'Approved Job Title', required: true },
    { key: 'offerDate', label: 'Offer Date', required: true },
    { key: 'department', label: 'Department or Team', required: true },
    { key: 'roleContribution', label: 'Role Contribution', required: true, multiline: true },
    { key: 'startDate', label: 'Anticipated Start Date', required: true },
    { key: 'startTime', label: 'Arrival Time', required: true },
    { key: 'workAddress', label: 'Work Address', required: true },
    { key: 'supervisorName', label: 'Supervisor Name', required: true },
    { key: 'supervisorTitle', label: 'Supervisor Title', required: true },
    { key: 'scheduleDays', label: 'Scheduled Days', required: true },
    { key: 'shiftStart', label: 'Shift Start Time', required: true },
    { key: 'shiftEnd', label: 'Shift End Time', required: true },
    { key: 'weeklyHours', label: 'Scheduled Hours per Week', required: true },
    { key: 'scheduleNotes', label: 'Overnight or Schedule Details', multiline: true },
    { key: 'trainingRate', label: 'Training Rate, If Applicable' },
    { key: 'trainingBasis', label: 'Training Rate Basis: Hour or Week' },
    { key: 'trainingDuration', label: 'Expected Training Duration' },
    { key: 'regularRate', label: 'Approved Regular Rate', required: true },
    { key: 'payBasis', label: 'Regular Rate Basis', required: true },
    { key: 'payFrequency', label: 'Pay Frequency', required: true },
    { key: 'payday', label: 'Payday', required: true },
    { key: 'commissionTerms', label: 'Approved Commission or Incentive Terms', multiline: true },
    { key: 'employmentClass', label: 'Full-Time, Part-Time, Temporary, or Seasonal', required: true },
    { key: 'flsaStatus', label: 'Approved FLSA Status', required: true },
    { key: 'benefitsText', label: 'Approved Benefit Override, If Applicable', multiline: true },
    { key: 'otherBenefits', label: 'Additional Approved Benefits', multiline: true },
    { key: 'acceptanceDeadline', label: 'Acceptance Deadline', required: true },
    { key: 'representativeName', label: 'Authorized Representative Name', required: true },
    { key: 'representativeTitle', label: 'Authorized Representative Title', required: true },
  ],
  jobDescription: [
    { key: 'title', label: 'Approved Job Title', required: true },
    { key: 'flsaStatus', label: 'FLSA Status', required: true },
    { key: 'payBasis', label: 'Hourly or Salaried Pay Basis', required: true },
    { key: 'reportsTo', label: 'Reports To: Name and Title', required: true },
    { key: 'summary', label: 'General Summary', required: true, multiline: true },
    { key: 'essentialFunctions', label: 'Essential Functions: One per Line', required: true, multiline: true },
    { key: 'physicalDemands', label: 'Physical Demands and Frequency', required: true, multiline: true },
    { key: 'workEnvironment', label: 'Work Environment, Schedule, Travel, and PPE', required: true, multiline: true },
    { key: 'educationExperience', label: 'Education, Experience, Licenses, and Certifications', required: true, multiline: true },
    { key: 'knowledgeSkills', label: 'Knowledge, Skills, and Abilities', required: true, multiline: true },
    { key: 'supervises', label: 'Positions Supervised, or None', required: true },
    { key: 'collaboratesWith', label: 'Collaborates With', required: true, multiline: true },
    { key: 'authorityLimits', label: 'Authority Limits', required: true, multiline: true },
    { key: 'revisedBy', label: 'Revised By: Name and Title', required: true },
    { key: 'revisedDate', label: 'Date Written or Revised', required: true },
  ],
  corrective: [
    { key: 'issuedDate', label: 'Date Issued', required: true },
    { key: 'issuer', label: 'Issued By / Supervisor', required: true },
    { key: 'action', label: 'Proposed Action', required: true },
    { key: 'policyReference', label: 'Policy Reference', required: true },
    { key: 'category', label: 'Reviewed Category', required: true },
    { key: 'reason', label: 'Reason for Warning', required: true, multiline: true },
    { key: 'expectedStandardImpact', label: 'Expected Standard and Impact', required: true, multiline: true },
    { key: 'employeeExplanation', label: 'Employee Explanation', multiline: true },
    { key: 'expectations', label: 'Expectations Going Forward', required: true, multiline: true },
    { key: 'support', label: 'Support or Training, or None Required', required: true, multiline: true },
    { key: 'improvementDeadline', label: 'Improvement Deadline or Immediately and Consistently', required: true },
    { key: 'followUpDate', label: 'Follow-Up Date', required: true },
    { key: 'consequence', label: 'Consequence if the Concern Continues', required: true, multiline: true },
  ],
  onboarding: [],
};

const COMPANY = "Galindo's Towing & Transport LLC, DBA Parking & Towing Enforcement";
const titles: Record<HrDocumentKind, string> = {
  offer: 'Employment Offer Letter', jobDescription: 'Job Description',
  corrective: 'Employee Corrective Action Notice', onboarding: 'Onboarding Progress Record',
};
const safe = (value: unknown): string => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
// Standard PDF fonts do not contain every Unicode glyph. Preserve readable punctuation.
const pdfText = (value: unknown): string => safe(value).replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/\u00a0/g, ' ');
const present = (value: unknown): boolean => value !== undefined && value !== null && safe(value) !== '';

function normalize(person: Record<string, unknown>, data: Record<string, unknown>) {
  const d: Record<string, unknown> = { ...data };
  const fallback = (key: string, ...values: unknown[]) => { if (!present(d[key])) d[key] = values.find(present); };
  fallback('name', legalPersonName(person), person.fullName, data.employeeName);
  fallback('title', person.title, data.jobTitle);
  fallback('department', person.department);
  fallback('startDate', person.startDate);
  fallback('employmentClass', person.employmentClass);
  fallback('flsaStatus', person.flsaStatus, typeof person.exempt === 'boolean' ? person.exempt ? 'Exempt' : 'Nonexempt' : undefined);
  fallback('payBasis', data.regularBasis);
  fallback('issuedDate', data.issueDate, data.dateIssued);
  fallback('issuer', data.issuedBy, data.supervisorName);
  fallback('action', data.proposedAction, data.actionType);
  fallback('policyReference', data.policyId, Array.isArray(data.policyIds) ? data.policyIds[0] : undefined);
  fallback('reason', data.reasonForWarning, data.facts, data.summary);
  fallback('expectedStandardImpact', data.expectedStandard, data.impact);
  fallback('employeeExplanation', data.employeeResponse, data.response);
  fallback('expectations', data.improvement, data.expectationsGoingForward);
  fallback('support', data.trainingSupport, data.supportOrTraining);
  fallback('consequence', data.consequences);
  fallback('followUpDate', data.followupDate);
  return d;
}

function requiredFields(kind: HrDocumentKind, d: Record<string, unknown>) {
  const cited=kind==='corrective'&&usesSopCitations(d);
  const missing = hrDocumentFields[kind].filter(f => f.required && !(cited&&f.key==='policyReference') && !present(d[f.key])).map(f => f.label);
  if(cited&&!savedPolicyReferences(d,true).length)missing.push('Policy Reference');
  if (!present(d.name)) missing.unshift('Employee or Candidate Name');
  if (kind === 'offer' && present(d.trainingRate)) {
    for (const [key, label] of [['trainingBasis', 'Training Rate Basis'], ['trainingDuration', 'Expected Training Duration']])
      if (!present(d[key])) missing.push(label);
  }
  if (kind === 'offer' && !['Full-Time', 'Part-Time', 'Temporary', 'Seasonal'].includes(safe(d.employmentClass)))
    missing.push('Valid Employment Class');
  if (kind === 'offer' && !/^(nonexempt|non-exempt|exempt|salaried exempt|salaried nonexempt|hourly nonexempt)$/i.test(safe(d.flsaStatus)))
    missing.push('Approved Exempt or Nonexempt Classification');
  if (missing.length) throw new Error('Complete these fields before generating the PDF: ' + [...new Set(missing)].join(', ') + '.');
  if (kind === 'corrective' && !cited && !present(policySnapshot(d).title) && !present(d.subject))
    throw new Error('Choose a published HR-CA policy, or provide the approved policy subject.');
}

function dollars(value: unknown) {
  const raw = safe(value);
  if (/^\$/.test(raw)) return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n) : raw;
}

function dateLabel(value: unknown) {
  const text = safe(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : text;
}

function fullTimeBenefits(d: Record<string, unknown>) {
  if (present(d.benefitsText)) return safe(d.benefitsText);
  if (d.employmentClass !== 'Full-Time')
    return 'This ' + safe(d.employmentClass).toLowerCase() + ' position does not include the Company\'s discretionary paid-time-off or benefit package. Ordinary requested time off is unpaid, requires arranged shift coverage, and remains subject to supervisor approval. Requests involving legally protected leave or accommodation receive a separate review.';
  const exempt = /^(exempt|salaried exempt)$/i.test(safe(d.flsaStatus));
  return 'Our standard first-year PTO benefit is ' + (exempt ? '18 days (144 hours)' : '15 days (120 hours)') + '. PTO accrues on hours worked, including paid breaks, up to 40 hours per workweek. Paid PTO, sick leave, personal leave, and other paid leave do not earn additional PTO. PTO begins accruing on your first day and becomes available after successful completion of your 90-day probationary period. At that time, you also receive 3 sick days and ' + (exempt ? '2 personal days.' : '1 personal day.') + ' Up to 4 days of bereavement leave for a qualifying immediate-family loss are available from your first day. Optional enrollment in health insurance and/or retirement plans becomes available after successful completion of your 90-day probationary period.';
}

class PdfWriter {
  doc: jsPDF;
  private title: string;
  private subtitle: string;
  private compact: boolean;
  y = 37;
  readonly left = 17;
  readonly width = 176;
  readonly bottom = 273;
  constructor(doc: jsPDF, title: string, subtitle: string, compact = false) { this.doc = doc; this.title = title; this.subtitle = subtitle; this.compact = compact; this.header(); }
  header() {
    const d = this.doc;
    d.setFillColor(10, 43, 70); d.rect(0, 0, 210, 5, 'F');
    d.setFont('helvetica', 'bold'); d.setFontSize(9); d.setTextColor(36, 77, 106);
    d.text('PARKING & TOWING ENFORCEMENT', this.left, 15);
    d.setFontSize(19); d.setTextColor(15, 35, 57); d.text(this.title, this.left, 25);
    d.setFont('helvetica', 'normal'); d.setFontSize(8); d.setTextColor(75, 91, 109); d.text(this.subtitle, this.left, 31);
    d.setDrawColor(206, 219, 229); d.line(this.left, 34, 193, 34);
    this.y = 41;
  }
  room(height: number) { if (this.y + height > this.bottom) { this.doc.addPage(); this.header(); } }
  paragraph(value: unknown, options: { bold?: boolean; size?: number; indent?: number; after?: number } = {}) {
    const text = pdfText(value); if (!text) return;
    const d = this.doc, size = options.size ?? (this.compact ? 10 : 10.5), lineHeight = size * (this.compact ? 0.42 : 0.48), indent = options.indent ?? 0;
    d.setFont('helvetica', options.bold ? 'bold' : 'normal'); d.setFontSize(size); d.setTextColor(28, 43, 60);
    const lines = d.splitTextToSize(text, this.width - indent) as string[];
    this.room(Math.min(lines.length, 2) * lineHeight + 1);
    for (const line of lines) {
      this.room(lineHeight + 1);
      d.setFont('helvetica', options.bold ? 'bold' : 'normal'); d.setFontSize(size); d.setTextColor(28, 43, 60);
      d.text(line, this.left + indent, this.y); this.y += lineHeight;
    }
    this.y += options.after ?? (this.compact ? 1.3 : 3);
  }
  heading(title: string) {
    this.room(20); this.y += 2;
    this.doc.setFillColor(234, 242, 248); this.doc.roundedRect(this.left, this.y - 4, this.width, 9, 1, 1, 'F');
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(11); this.doc.setTextColor(18, 65, 96);
    this.doc.text(pdfText(title), this.left + 3, this.y + 2); this.y += this.compact ? 10 : 12;
  }
  field(label: string, value: unknown) { if (!present(value)) return; this.paragraph(label + ': ' + safe(value), { after: 2.5 }); }
  bullets(value: unknown) {
    const rows = Array.isArray(value) ? value.map(safe) : safe(value).split(/\r?\n/);
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(10.5);
    const blockHeight = rows.filter(Boolean).reduce((sum, row) => sum + this.doc.splitTextToSize(pdfText(row), this.width - 3).length * 5.04 + 1.8, 2);
    if (blockHeight < 60) this.room(blockHeight);
    rows.filter(Boolean).forEach(row => this.paragraph('- ' + row.replace(/^[-•]\s*/, ''), { indent: 3, after: 1.8 }));
    this.y += 2;
  }
  writingLines(count = 3) {
    this.room(count * 8 + 2); this.doc.setDrawColor(185, 198, 208);
    for (let i = 0; i < count; i++) { this.y += 8; this.doc.line(this.left, this.y, 193, this.y); }
    this.y += 6;
  }
  signature(label: string) {
    this.room(23); this.y += 11; this.doc.setDrawColor(81, 102, 121);
    this.doc.line(this.left, this.y, 139, this.y); this.doc.line(153, this.y, 193, this.y);
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(9); this.doc.setTextColor(50, 67, 84);
    this.doc.text(label, this.left, this.y + 5); this.doc.text('Date', 153, this.y + 5); this.y += 13;
  }
  finish(reference?: unknown) {
    const pages = this.doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      this.doc.setPage(p); this.doc.setDrawColor(206, 219, 229); this.doc.line(this.left, 280, 193, 280);
      this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7.5); this.doc.setTextColor(80, 96, 112);
      this.doc.text('Confidential Personnel Record | ' + (reference ? pdfText(reference).slice(0, 70) : 'Command Post'), this.left, 286);
      this.doc.text(`${p} of ${pages}`, 193, 286, { align: 'right' });
    }
    return this.doc;
  }
}

function writeOffer(w: PdfWriter, d: Record<string, unknown>) {
  const s = (key: string) => safe(d[key]);
  w.paragraph(s('title'), { bold: true, size: 14 }); w.paragraph(dateLabel(d.offerDate));
  w.paragraph('Dear ' + s('name') + ',');
  w.paragraph("We're excited to offer you the position of " + s('title') + ' with ' + COMPANY + "! Our company is growing, and we'd love to have you on our " + s('department') + ". You'll help " + s('roleContribution').replace(/[.]$/, '') + ". We'll work alongside you during training so you can build confidence and feel ready to handle your role.");
  w.heading('Your Schedule');
  w.paragraph('Your anticipated start date is ' + s('startTime') + ' on ' + dateLabel(d.startDate) + ', at ' + s('workAddress') + '. You will report to ' + s('supervisorName') + ', ' + s('supervisorTitle') + '. Your regular schedule will be ' + s('scheduleDays') + ', from ' + s('shiftStart') + ' to ' + s('shiftEnd') + ', for ' + s('weeklyHours') + ' scheduled hours per week. You will also have opportunities to pick up extra shifts or hours as available with supervisor approval.');
  w.paragraph(d.scheduleNotes);
  w.heading('Your Pay and Paid Training');
  if (present(d.trainingRate)) {
    w.paragraph('You will earn ' + dollars(d.trainingRate) + ' per ' + s('trainingBasis') + ' during paid training, which generally lasts ' + s('trainingDuration') + ' depending on how quickly you learn the role. Once your supervisor confirms you are ready to work independently, your pay increases to ' + dollars(d.regularRate) + ' per ' + s('payBasis') + '.');
  } else w.paragraph('Your approved pay is ' + dollars(d.regularRate) + ' per ' + s('payBasis') + '.');
  w.paragraph('You will be paid ' + s('payFrequency') + ' on ' + s('payday') + '.');
  w.paragraph(d.commissionTerms);
  w.heading(d.employmentClass === 'Full-Time' ? 'Your First Year Benefits' : 'Benefits and Time Off');
  w.paragraph(fullTimeBenefits(d)); w.paragraph(d.otherBenefits);
  w.heading('Next Steps');
  w.paragraph('This offer is contingent on satisfactory background check results and passing a pre-employment drug test. Employment is at will, meaning you or the company may end the employment relationship at any time, subject to applicable law.');
  w.paragraph(s('name') + ", we're looking forward to getting to know you and helping you get off to a great start. Please sign and return this letter by " + dateLabel(d.acceptanceDeadline) + ". We'd be excited to welcome you aboard!");
  w.paragraph('Sincerely,'); w.paragraph(s('representativeName'), { bold: true, after: 1 }); w.paragraph(d.representativeTitle);
  w.room(32); w.paragraph('I accept this offer and the terms above.', { bold: true }); w.signature('Candidate Signature');
}


function policySnapshot(d: Record<string, unknown>): Record<string, unknown> {
  return d.policySnapshot && typeof d.policySnapshot === 'object' && !Array.isArray(d.policySnapshot) ? d.policySnapshot as Record<string, unknown> : {};
}

function writeCorrective(w: PdfWriter, d: Record<string, unknown>) {
  const p = policySnapshot(d);
  w.field('Employee', d.name); w.field('Date Issued', dateLabel(d.issuedDate)); w.field('Position', d.title);
  w.field('Issued By / Supervisor', d.issuer); w.field('Proposed Action', d.action);
  if(usesSopCitations(d)){
    const refs=savedPolicyReferences(d,true),primary=refs[0];
    // This is the employee's printable notice, even when a supervisor clicks Generate.
    // Never print the manager's raw title/legacy policy snapshot for a restricted primary.
    if(primary)w.field('Subject',primary.restricted?'Restricted Policy Reference':primary.title);
    w.field('Category',d.category);
    w.heading('Recorded Policy References');refs.forEach((ref,i)=>w.field(i===0?'Primary Policy':'Related Policy',referenceDescription(ref)));
  }else{
    w.field('Policy Reference', d.policyReference); w.field('Subject', p.title || d.subject); w.field('Category', d.category);
    w.field('Policy Version', p.version || d.policyVersion); w.field('Related SOP / Rule', d.relatedSop);
  }
  w.field('Incident Date / Time', d.incidentAt || d.occurredAt); w.field('Incident Location', d.location);
  w.heading('I. Reason for Warning'); w.paragraph(d.reason); w.field('Evidence References', d.evidence);
  w.heading('II. Expected Standard and Impact'); w.paragraph(d.expectedStandardImpact);
  w.heading('III. Employee Explanation');
  if (present(d.employeeExplanation)) w.paragraph(d.employeeExplanation); else w.writingLines(4);
  if (present(d.disagreementReason)) w.field('Employee Disagreement', d.disagreementReason);
  if (d.responseStatus === 'Declined to Respond' || d.responseStatus === 'Declined to Sign' || present(d.refusalReason)) {
    w.field('Response Status', d.responseStatus || 'Manager-Documented Refusal'); w.field('Manager-Documented Circumstances', d.refusalReason); w.field('Witness', d.witness);
  }
  w.heading('IV. Expectations Going Forward'); w.paragraph(d.expectations); w.field('Support or Training to Be Provided', d.support);
  w.field('Improvement Deadline', d.improvementDeadline); w.field('Follow-Up Date', dateLabel(d.followUpDate));
  w.heading('V. Consequence if the Concern Continues'); w.paragraph(d.consequence);
  w.heading('Acknowledgment');
  w.paragraph('Your signature confirms this notice was discussed with you and you received a copy. It does not mean you agree. You may attach a written response.');
  w.signature('Employee Signature'); w.signature('Supervisor Signature');
}

function writeOnboarding(w: PdfWriter, d: Record<string, unknown>) {
  w.field('Employee', d.name); w.field('Position', d.title); w.field('Department', d.department); w.field('Original Hire / Start Date', dateLabel(d.startDate));
  w.field('Onboarding Path', d.path); w.field('Record Status', d.status || 'In Progress');
  w.paragraph('This report describes recorded progress. It does not replace signed forms, employer verification, or authorized start clearance.');
  const tasks = Array.isArray(d.tasks) ? d.tasks as Record<string, unknown>[] : [];
  w.heading('Task History');
  if (!tasks.length) w.paragraph('No task records were provided for this report.');
  for (const task of tasks) {
    w.room(22); w.paragraph(safe(task.label || task.title || task.key) + ' — ' + safe(task.status || 'Pending'), { bold: true, after: 2 });
    w.field('Assigned To', task.assignee || task.owner); w.field('Reviewed By', task.reviewedBy); w.field('Completed At', task.completedAt); w.field('Due Date', task.dueDate); w.field('Evidence Reference', task.fileId || task.evidenceId);
  }
  w.heading('Start Clearance'); w.field('Approved By', d.approvedBy); w.field('Approved At', d.approvedAt);
  if (!d.approvedAt) w.paragraph('Start clearance has not been recorded.');
  w.field('Outstanding Follow-Up', d.followUp);
}

/** Build an unsigned, printable document from approved structured inputs. No signature is fabricated. */
export async function buildHrPdfDocument(kind: HrDocumentKind, person: Record<string, unknown>, data: Record<string, unknown>): Promise<jsPDF> {
  const d = normalize(person, data); requiredFields(kind, d);
  if (kind === 'jobDescription') return buildTemplateJobDescription(d);
  const { jsPDF: PDF } = await import('jspdf');
  const pdf = new PDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: titles[kind] + ' — ' + safe(d.name), author: COMPANY, subject: 'Unsigned personnel document generated from approved inputs', creator: 'Command Post' });
  const w = new PdfWriter(pdf, titles[kind], kind === 'onboarding' ? 'Progress Report | Verify Source Records Before Relying on Completion' : 'Unsigned Copy | Review, Sign, and Retain the Completed Version', kind === 'offer');
  if (kind === 'offer') writeOffer(w, d);
  else if (kind === 'corrective') writeCorrective(w, d);
  else writeOnboarding(w, d);
  return w.finish(data.recordId || data.id);
}

function fileName(kind: HrDocumentKind, person: Record<string, unknown>) {
  return (titles[kind] + '_' + safe(legalPersonName(person) || 'Employee')).replace(/[^a-zA-Z0-9_-]+/g, '_') + '.pdf';
}
export async function createHrPdfFile(kind: HrDocumentKind, person: Record<string, unknown>, data: Record<string, unknown>): Promise<File> {
  const pdf = await buildHrPdfDocument(kind, person, data);
  return new File([pdf.output('arraybuffer')], fileName(kind, person), { type: 'application/pdf' });
}
export async function generateHrPdf(kind: HrDocumentKind, person: Record<string, unknown>, data: Record<string, unknown>): Promise<void> {
  const pdf = await buildHrPdfDocument(kind, person, data);
  pdf.save(fileName(kind, person));
}

/** Uses the supplied blank provider form; only its two supervisor-fillable fields are populated. */
export async function generateDrugScreenPdf(candidateName: string, employerContactName: string): Promise<void> {
  if (!safe(candidateName) || !safe(employerContactName)) throw new Error('Enter the candidate name and employer contact name.');
  const response = await fetch('/hr/drug-screen-request.png');
  if (!response.ok) throw new Error('The drug screen request template could not be loaded.');
  const image = new Uint8Array(await response.arrayBuffer());
  const { jsPDF: PDF } = await import('jspdf');
  const pdf = new PDF({ unit: 'pt', format: 'letter', compress: true });
  pdf.addImage(image, 'PNG', 0, 0, 612, 792);
  pdf.setTextColor(0, 0, 0); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  const fit = (value: string, x: number, y: number, width: number) => {
    const content = pdfText(value); let size = 10;
    while (pdf.getTextWidth(content) > width && size > 7) { size -= 0.25; pdf.setFontSize(size); }
    if (pdf.getTextWidth(content) > width) throw new Error('The name is too long for the provider form. Use the provider’s original form for this request.');
    pdf.text(content, x, y); pdf.setFontSize(10);
  };
  fit(employerContactName, 221, 363, 295);
  fit(candidateName, 151, 608, 203);
  pdf.setProperties({ title: 'Employer Drug Screen Request — ' + safe(candidateName), author: COMPANY, subject: 'Supplied provider form with employer contact and candidate name', creator: 'Command Post' });
  pdf.save(('Drug_Screen_Request_' + safe(candidateName)).replace(/[^a-zA-Z0-9_-]+/g, '_') + '.pdf');
}
