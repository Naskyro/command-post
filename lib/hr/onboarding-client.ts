import type { HrRecord } from './model';

/** Server-derived readiness is never submitted as editable checklist data. */
export function onboardingDraftData(data: Record<string, unknown>) {
  const { readiness: _readiness, sopClearance: _sopClearance, ...draft } = data;
  return draft;
}

export function onboardingSaveBody(record: HrRecord, data: Record<string, unknown>) {
  return { action: 'save', id: record.id, kind: 'onboarding', personId: record.personId, version: record.version, data: onboardingDraftData(data) };
}

/** Only attach the matching document; signatures and employer verification remain separate. */
export function assignOnboardingDocumentData(data: Record<string, unknown>, personId: string, step: 'offer' | 'jobDescription', document: HrRecord) {
  const category = step === 'offer' ? 'Offer Letter' : 'Job Description';
  if (document.kind !== 'document' || document.personId !== personId || document.data.category !== category) throw new Error('Choose the matching document for this employee.');
  const tasks = Array.isArray(data.tasks) ? data.tasks as Record<string, unknown>[] : [];
  return { ...onboardingDraftData(data), tasks: tasks.map(task => task.key === step ? { ...task, documentId: document.id, status: 'Submitted' } : task) };
}
