import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildHrPdfDocument } from '../../components/people/hr/documents.ts';
import { buildTemplateJobDescription } from '../../components/people/hr/job-description-pdf.ts';
import { buildServerJobDescriptionPdf } from '../../lib/hr/job-description-pdf-server.ts';

const person = { name: 'Template Test Employee' };
const data = {
  title: 'Dispatcher', flsaStatus: 'Nonexempt', payBasis: 'Hourly', reportsTo: 'Hiring Supervisor',
  summary: 'Coordinates service requests, vehicle-release paperwork, and records for the assigned shift.',
  essentialFunctions: 'Answer calls and record requests.\nVerify release paperwork.\nEscalate exceptions to the supervisor.',
  physicalDemands: 'Frequent seated work and keyboard use.', workEnvironment: 'Office and vehicle storage facility.',
  educationExperience: 'Relevant customer-service experience.\nRequired licenses and training.',
  knowledgeSkills: 'Accurate data entry.\nClear communication.', supervises: 'None',
  collaboratesWith: 'Drivers and supervisors.', authorityLimits: 'Escalate matters outside approved procedures.',
  revisedBy: 'Hiring Supervisor', revisedDate: 'October 27, 2026',
};
const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; });

test('job description refuses incomplete approved terms instead of emitting a misleading document', async () => {
  await assert.rejects(() => buildHrPdfDocument('jobDescription', person, { ...data, flsaStatus: '' }), /FLSA Status/);
});

test('template asset failure is explicit and recoverable', async () => {
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  await assert.rejects(() => buildHrPdfDocument('jobDescription', person, data), /template could not be loaded/);
  globalThis.fetch = async url => new Response(await readFile(new URL('../../public' + url, import.meta.url)));
  const pdf = await buildHrPdfDocument('jobDescription', person, data);
  assert.equal(pdf.getNumberOfPages(), 2);
  assert.equal(pdf.internal.pageSize.getWidth(), 612);
  assert.equal(pdf.internal.pageSize.getHeight(), 792);
  assert.deepEqual(pdf.getFontList().JDTemplate.sort(), ['bold', 'normal']);
  assert.ok(pdf.output('arraybuffer').byteLength > 50000, 'The original logo/font assets must be embedded.');
});

test('long duties expand across Letter pages rather than shrinking the source page format', async () => {
  const pdf = await buildHrPdfDocument('jobDescription', person, {
    ...data,
    essentialFunctions: Array.from({ length: 80 }, (_, i) => `Duty ${i + 1}: Record each request, verify the supporting documents, and escalate discrepancies through the assigned supervisor.`).join('\n'),
  });
  assert.ok(pdf.getNumberOfPages() >= 4);
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    assert.equal(pdf.internal.pageSize.getWidth(), 612);
    assert.equal(pdf.internal.pageSize.getHeight(), 792);
  }
});

test('the PDF delivered for signature matches the preview, including the current logo and all template assets', async () => {
  globalThis.fetch = async url => new Response(await readFile(new URL('../../public' + url, import.meta.url)));
  const preview = await buildTemplateJobDescription(data);
  const issued = await buildServerJobDescriptionPdf(data);
  assert.deepEqual(issued, new Uint8Array(preview.output('arraybuffer')));
  const revised = await buildServerJobDescriptionPdf({ ...data, summary: 'Now also responsible for yard dispatch.' });
  assert.notDeepEqual(revised, issued, 'changed duties require a distinct revision');
});
