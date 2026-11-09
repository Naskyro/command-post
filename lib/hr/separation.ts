import type { FinRecord, Viewer } from '../finance/model';
import { today } from '../finance/model.ts';
import type { HrRecord } from './model';
import { hrCan } from './permissions.ts';
import { AppError, ConflictError, ForbiddenError } from '../shared/errors.ts';

export const separationTypes = ['Termination', 'Resignation', 'End of Assignment', 'Other'] as const;
export const rehireOptions = ['Eligible', 'Not Eligible', 'Needs Review'] as const;
const protectedOwners = new Set(['jerson', 'jeidy', 'jendel']);

export function canSeparatePerson(viewer: Viewer, person: FinRecord, finance: FinRecord[]) {
  return person.id !== viewer.person && person.role !== 'Owner' && person.workerType !== 'Owner' && !protectedOwners.has(person.id) && person.status !== 'Former' && !viewer.onboardingOnly && hrCan(viewer, 'manageOffboarding', person.id, finance);
}

export function isSeparationFollowUp(record: HrRecord, records: HrRecord[]) {
  if (record.kind !== 'task' || record.data.category !== 'Offboarding') return false;
  const parent = records.find(r => r.kind === 'offboarding' && r.id === record.data.separationRecordId && r.personId === record.personId && r.data.separationRecordedAt);
  return !!parent && Array.isArray(parent.data.followUpTaskIds) && parent.data.followUpTaskIds.includes(record.id);
}

function requiredString(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AppError(`Enter ${label} (${max} characters or fewer).`);
  return value.trim();
}

/** One separation decision; operational closeout remains explicitly pending. */
export function prepareSeparation(input: Record<string, unknown>, viewer: Viewer, finance: FinRecord[], hr: HrRecord[], at = new Date().toISOString(), day = today()) {
  const personId = requiredString(input.personId, 'the employee', 150), person = finance.find(r => r.kind === 'person' && r.id === personId);
  if (!person) throw new AppError('Employee not found.', 404);
  if (viewer.onboardingOnly || !hrCan(viewer, 'manageOffboarding', personId, finance)) throw new ForbiddenError('Offboarding is not assigned to you for this employee.');
  if (personId === viewer.person) throw new ForbiddenError('Another authorized person must record your separation.');
  if (person.role === 'Owner' || person.workerType === 'Owner' || protectedOwners.has(person.id)) throw new ForbiddenError('Owner accounts cannot be ended through employee offboarding.');
  const requestId = requiredString(input.requestId, 'a submission reference', 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) throw new AppError('Refresh the form to create a valid submission reference.');
  const separationType = requiredString(input.separationType, 'a separation type', 40);
  if (!separationTypes.includes(separationType as typeof separationTypes[number])) throw new AppError('Choose a valid separation type.');
  const separationDate = requiredString(input.separationDate, 'a separation date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(separationDate) || !Number.isFinite(Date.parse(separationDate + 'T12:00:00Z')) || new Date(separationDate + 'T12:00:00Z').toISOString().slice(0, 10) !== separationDate) throw new AppError('Enter a valid separation date.');
  if (separationDate > day) throw new AppError('Use today or an earlier separation date. Future separations are not scheduled by this action.');
  if (person.startDate && separationDate < String(person.startDate)) throw new AppError('The separation date cannot be before the employee’s start date.');
  const reason = requiredString(input.reason, 'the reason for separation', 1000), rehireEligibility = requiredString(input.rehireEligibility, 'rehire eligibility', 40);
  if (!rehireOptions.includes(rehireEligibility as typeof rehireOptions[number])) throw new AppError('Choose rehire eligibility.');
  if (input.notes !== undefined && typeof input.notes !== 'string') throw new AppError('Enter valid additional notes.');
  const notes = String(input.notes || '').trim(); if (notes.length > 5000) throw new AppError('Keep additional notes to 5,000 characters or fewer.');
  const id = 'hrseparation:' + requestId, request = { personId, separationType, separationDate, reason, rehireEligibility, notes };
  const existing = hr.find(r => r.id === id);
  if (existing) {
    if (existing.kind !== 'offboarding' || existing.personId !== personId || existing.data.separationRecordedById !== viewer.id || JSON.stringify(existing.data.separationRequest) !== JSON.stringify(request)) throw new ConflictError('This submission reference was already used for different details. Refresh the form.');
    return { person, updated: person, record: existing, tasks: [] as HrRecord[], alreadyRecorded: true };
  }
  if (Number(input.personVersion) !== person.version) throw new ConflictError('This employee changed. Refresh the profile before ending employment.');
  if (!Number.isInteger(input.personVersion) || Number(input.personVersion) < 0) throw new AppError('Refresh the employee profile before saving.');
  if (person.status === 'Former') throw new AppError('This employee is already marked Former. Open their separation history or add a follow-up.');
  const updated: FinRecord = { ...person, status: 'Former', endDate: separationDate, accountStatus: 'Disabled', version: person.version + 1, updatedAt: at, updatedBy: viewer.name, separationRecordId: id };
  const definitions = [
    { key: 'final-pay', title: 'Review Final Time & Final Pay Handoff', followUpType: 'Final Time & Pay', notes: 'Review actual worked time, any open clock and corrections, and hand off final-pay processing to the authorized payroll person. No time has been removed, clocked out, or paid by the separation action.' },
    { key: 'equipment', title: 'Recover Equipment & Physical Access', followUpType: 'Equipment & Physical Access', notes: 'Record equipment, keys, badges, codes, and third-party access returned, disabled, or not applicable. Command Post access has already been disabled.' },
    { key: 'benefits', title: 'Review Benefits & Preserve Personnel Records', followUpType: 'Benefits & Records', notes: 'Review applicable benefit notices and plan changes, retain the personnel file, and document any remaining separation or TWC follow-up. No carrier enrollment or benefit cancellation has been performed automatically.' },
  ];
  const taskIds = definitions.map(d => id + ':' + d.key);
  const base = { personId, version: 1, createdAt: at, createdBy: viewer.name, updatedAt: at, updatedBy: viewer.name };
  const record: HrRecord = { ...base, id, kind: 'offboarding', data: { ...request, status: 'Follow-Up Pending', employeeVisible: false, assignedTo: viewer.person, separationRecordedAt: at, separationRecordedBy: viewer.name, separationRecordedById: viewer.id, separationRequest: request, accessDisabledAt: at, employmentStatus: 'Former', followUpTaskIds: taskIds } };
  const tasks: HrRecord[] = definitions.map((d, i) => ({ ...base, id: taskIds[i], kind: 'task', data: { category: 'Offboarding', status: 'Pending', title: d.title, notes: d.notes, assignee: viewer.person, dueDate: day, employeeVisible: false, separationRecordId: id, followUpType: d.followUpType, source: 'Recorded Separation' } }));
  return { person, updated, record, tasks, alreadyRecorded: false };
}
