import type { jsPDF } from 'jspdf';

/**
 * Measured against the supplied Job Description Template and Sample, with the current menu logo.
 * Letter pages, company artwork, Arial-compatible embedded font, original margins,
 * underlined headings, list indentation, the section-VI page break and signature
 * block are intentionally independent of the other HR document styles.
 */
export type JobDescriptionAssets = { regular: string; bold: string; parkingLogo: Uint8Array; towingLogo: Uint8Array };
let assetsPromise: Promise<JobDescriptionAssets> | undefined;
const clean = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
const rows = (value: unknown): string[] => (Array.isArray(value) ? value : clean(value).split(/\r?\n/)).map(clean).map(line => line.replace(/^[-•]\s*/, '')).filter(Boolean);
export function isOtherDutiesLine(line:string) {
  return /^(?:perform\s+)?other duties as (?:needed and )?assigned[.!]?$/i.test(line.trim());
}
function base64(bytes: Uint8Array) { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); }
async function readAsset(name: string) {
  const result = await fetch('/hr/job-description/' + name);
  if (!result.ok) throw new Error('The job-description template could not be loaded. Please try again.');
  return new Uint8Array(await result.arrayBuffer());
}
async function assets(): Promise<JobDescriptionAssets> {
  if (!assetsPromise) assetsPromise = Promise.all([
    readAsset('LiberationSans-Regular.ttf'), readAsset('LiberationSans-Bold.ttf'),
    readAsset('pte-road-print.png'), readAsset('galindos-logo.png'),
  ]).then(([regular, bold, parkingLogo, towingLogo]) => ({ regular: base64(regular), bold: base64(bold), parkingLogo, towingLogo })).catch(error => { assetsPromise = undefined; throw error; });
  return assetsPromise;
}

class JobDescriptionWriter {
  private baseline = 115.4;
  private previousAfter = 0;
  private first = true;
  private readonly lineHeight = 13.25;
  private readonly bottom = 733.9;
  private readonly left = 57.7;
  private readonly right = 554.4;
  readonly doc: jsPDF;
  constructor(doc: jsPDF) { this.doc = doc; }
  private font(bold = false, size = 11) { this.doc.setFont('JDTemplate', bold ? 'bold' : 'normal'); this.doc.setFontSize(size); this.doc.setTextColor(0, 0, 0); }
  private newPage() { this.doc.addPage('letter', 'portrait'); this.baseline = 67.9; this.previousAfter = 0; this.first = true; }
  private next(before: number, keepHeight = 0) {
    const at = this.first ? this.baseline : this.baseline + this.lineHeight + Math.max(before, this.previousAfter);
    if (at + keepHeight > this.bottom) this.newPage(); else this.baseline = at;
    this.first = false;
  }
  pageBreak() { this.newPage(); }
  heading(label: string) {
    this.next(7, this.lineHeight + 2); this.font(true);
    this.doc.text(label, this.left, this.baseline);
    this.doc.setDrawColor(0, 0, 0); this.doc.setLineWidth(0.55);
    this.doc.line(this.left, this.baseline + 1.05, this.left + this.doc.getTextWidth(label), this.baseline + 1.05);
    this.previousAfter = 2;
  }
  paragraph(value: unknown, options: { x?: number; before?: number; after?: number; bullet?: boolean; label?: string; keepTogether?: boolean } = {}) {
    const valueText = clean(value); if (!valueText) return;
    const x = options.x ?? 100.9;
    this.font();
    const label = options.label ?? '';
    this.font(Boolean(label)); const labelWidth = label ? this.doc.getTextWidth(label) : 0; this.font();
    // A bold lead-in reserves exactly its rendered width on the first line.
    const firstWidth = this.right - x - labelWidth;
    const words = valueText.split(/\s+/);
    const lines: string[] = []; let line = ''; let available = firstWidth;
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      if (this.doc.getTextWidth(trial) <= available) { line = trial; continue; }
      if (line) { lines.push(line); line = ''; available = this.right - x; }
      // Long unbroken identifiers still wrap inside the template margin.
      if (this.doc.getTextWidth(word) > available) {
        const parts = this.doc.splitTextToSize(word, available) as string[];
        lines.push(...parts.slice(0, -1)); line = parts.at(-1) ?? '';
      } else line = word;
    }
    if (line) lines.push(line);
    const keepHeight = options.keepTogether && lines.length < 8 ? (lines.length - 1) * this.lineHeight : 0;
    this.next(options.before ?? 0, keepHeight);
    for (let i = 0; i < lines.length; i++) {
      if (i) { if (this.baseline + this.lineHeight > this.bottom) { this.newPage(); this.first = false; } else this.baseline += this.lineHeight; }
      this.font();
      if (i === 0 && options.bullet) { this.doc.setFillColor(0, 0, 0); this.doc.circle(89.9, this.baseline - 3, 1.6, 'F'); }
      if (i === 0 && label) { this.font(true); this.doc.text(label, x, this.baseline); this.font(); }
      this.doc.text(lines[i], x + (i === 0 ? labelWidth : 0), this.baseline);
    }
    this.previousAfter = options.after ?? 5;
  }
  bullets(value: unknown) { rows(value).forEach(line => this.paragraph(line, { x: 102.35, bullet: true, after: 0, keepTogether: true })); }
  labeledBullet(label: string, value: unknown) { this.paragraph(value, { x: 102.35, bullet: true, label: label + ': ', after: 0, keepTogether: true }); }
  acknowledgment() {
    const statement = 'I have read and understand this Job Description.';
    this.next(0, 38.5); this.font(); this.doc.text(statement, 100.9, this.baseline); this.previousAfter = 5;
    this.next(12, 13.25); this.font();
    this.doc.text('_________________________________          ____________________', 100.9, this.baseline);
    this.baseline += this.lineHeight;
    this.doc.text('Employee signature                                      Date', 100.9, this.baseline);
    this.previousAfter = 5;
  }
  finish(title:string) {
    for (let page = 1; page <= this.doc.getNumberOfPages(); page++) {
      this.doc.setPage(page); this.font(false, 9);
      const footer=title||'Job Description';
      // Match the completed director description: the document name lives in the left footer.
      const chars=Array.from(footer);let text=footer;
      if(this.doc.getTextWidth(text)>214){while(chars.length&&this.doc.getTextWidth(chars.join('')+'…')>214)chars.pop();text=chars.join('')+'…';}
      this.doc.text(text, 57.7, 753.65);
      this.font(); this.doc.text(String(page), 288.65, 753.65);
    }
    return this.doc;
  }
}

export async function buildTemplateJobDescription(data: Record<string, unknown>): Promise<jsPDF> {
  return renderTemplateJobDescription(data,await assets());
}
export async function renderTemplateJobDescription(data: Record<string, unknown>,template:JobDescriptionAssets):Promise<jsPDF> {
  const {jsPDF}=await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true, putOnlyUsedFonts: true });
  doc.addFileToVFS('JDTemplate-Regular.ttf', template.regular); doc.addFont('JDTemplate-Regular.ttf', 'JDTemplate', 'normal');
  doc.addFileToVFS('JDTemplate-Bold.ttf', template.bold); doc.addFont('JDTemplate-Bold.ttf', 'JDTemplate', 'bold');
  doc.setProperties({ title: 'Job Description — ' + clean(data.title), author: "Galindo's Towing & Transport LLC, DBA Parking & Towing Enforcement", subject: 'Job description and employee acknowledgment', creator: 'Command Post' });
  // Fingerprint only fields rendered on the page. The viewer, server issue process and
  // download produce the same PDF for the same description and renderer edition.
  const fields=['title','flsaStatus','payBasis','reportsTo','summary','essentialFunctions','physicalDemands','workEnvironment','educationExperience','knowledgeSkills','supervises','collaboratesWith','authorityLimits','revisedBy','revisedDate'];
  const stable=JSON.stringify(['pte-description-2',...fields.map(k=>rows(data[k]))]);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable)));
  doc.setFileId(Array.from(digest.subarray(0,16),c=>c.toString(16).padStart(2,'0')).join('').toUpperCase());
  const revisionDate=clean(data.revisedDate);
  // The PDF metadata must not depend on the viewer's timezone or the render time.
  // An incomplete draft has no effective date; its authoritative history lives in the catalog.
  const revisionMs=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(revisionDate) ? revisionDate+'T00:00:00Z' : revisionDate+' UTC');
  const metadataDate=new Date(Number.isFinite(revisionMs)?revisionMs:0).toISOString().slice(0,10).replace(/-/g,'');
  doc.setCreationDate('D:'+metadataDate+"000000+00'00'");
  doc.addImage(template.parkingLogo, 'PNG', 57.5, 27.55, 140.15, 68.37);
  doc.addImage(template.towingLogo, 'PNG', 428.15, 27.55, 123.9, 69.5);
  const w = new JobDescriptionWriter(doc);
  w.heading('I.  Job Title:'); w.paragraph(data.title, { x: 102.875 });
  w.heading('II.  FLSA Status:'); w.paragraph([clean(data.flsaStatus),clean(data.payBasis)].filter(Boolean).join(' / '));
  w.heading('III.  Reports to:'); w.paragraph(data.reportsTo);
  w.heading('IV.  General Summary:'); rows(data.summary).forEach(p=>w.paragraph(p));
  w.heading('V.  Essential Functions:'); const duties=rows(data.essentialFunctions).filter(line=>!isOtherDutiesLine(line));
  w.bullets([...duties, 'Other duties as assigned']);
  w.pageBreak();
  w.heading('VI.  Physical Demands and Work Environment:');
  w.paragraph('With reasonable accommodation, this position requires:');
  w.bullets(data.physicalDemands); w.bullets(data.workEnvironment);
  w.heading('VII.  Education and Experience:'); w.bullets(data.educationExperience);
  w.heading('VIII.  Knowledge, Skills and Abilities:'); w.bullets(data.knowledgeSkills);
  w.heading('IX.  Organizational Relationships:');
  w.labeledBullet('Supervises', data.supervises); w.labeledBullet('Collaborates with', data.collaboratesWith); w.labeledBullet('Authority limits', data.authorityLimits);
  w.heading('Current Version Revised By:'); w.paragraph(data.revisedBy);
  w.heading('Date Written/Revised:'); w.paragraph(data.revisedDate);
  w.paragraph('This job description is not intended to be all-inclusive. Parking & Towing Enforcement reserves the right to revise or change duties as business needs arise. This job description does not constitute a written or implied contract of employment.', { before: 8, keepTogether: true });
  w.acknowledgment();
  return w.finish(clean(data.title));
}
