import { financeDb, financeFiles } from '@/db/finance';
import { logAudit } from '@/lib/audit';
import { checkAdminPermission } from '@/lib/admin';
import type { Viewer } from '@/lib/finance/model';

export type CcrActor = Pick<Viewer, 'person' | 'name' | 'role' | 'owner'>;

type IncidentInput = {
  category: string;
  location?: string;
  description?: string;
  safety_concern?: boolean;
  property_id?: string;
  employee_id?: string;
  occurrence_date?: string;
  priority?: string;
};

type RecoveryInput = {
  responsibility_finding: string;
  recoverable_amount: number;
  recovery_approved_amount: number;
  collection_method: string;
  reason: string;
};

async function requirePermission(actor: CcrActor, module: string, tab: string | null, action: string) {
  const perm = await checkAdminPermission(actor, module, tab, action);
  if (!perm.allowed) throw new Error(perm.reason || `No permission for action: ${action}`);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as any);
  const arr = new Uint8Array(digest as ArrayBuffer);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createIncident(actor: CcrActor, input: IncidentInput) {
  await requirePermission(actor, 'ccr', 'Incidents', 'Create');
  const db = financeDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const stage = 'Draft';

  await db.prepare(
    'INSERT INTO ccr_incidents (id, category, location, brief_description, immediate_safety_concern, property_id, employee_id, occurrence_date, occurrence_unknown, reporter_id, created_by, created_at, updated_at, updated_by, internal_stage, version, is_active, assigned_to, priority, recovery_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    input.category,
    input.location ?? null,
    input.description ?? null,
    input.safety_concern ? 1 : 0,
    input.property_id ?? null,
    input.employee_id ?? null,
    input.occurrence_date ?? null,
    input.occurrence_date ? 0 : 1,
    actor.person,
    actor.person,
    now,
    now,
    actor.person,
    stage,
    1,
    1,
    null,
    input.priority || 'Normal',
    null
  ).run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'ccr_incident', id, 'Create', 'Success', { newValue: input });

  return { id, created_at: now };
}

export async function listIncidents(actor: CcrActor, filters: { status?: string; category?: string; assigned_to?: string; employee_id?: string; limit?: number }) {
  await requirePermission(actor, 'ccr', null, 'View');
  const db = financeDb();
  const limit = Math.min(filters.limit ?? 50, 100);
  let query = 'SELECT * FROM ccr_incidents WHERE is_active = 1';
  const params: (string | number)[] = [];

  if (filters.status) { query += ' AND internal_stage = ?'; params.push(filters.status); }
  if (filters.category) { query += ' AND category = ?'; params.push(filters.category); }
  if (filters.assigned_to) { query += ' AND assigned_to = ?'; params.push(filters.assigned_to); }
  if (filters.employee_id) { query += ' AND employee_id = ?'; params.push(filters.employee_id); }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const result = await db.prepare(query).bind(...params).all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function getIncident(actor: CcrActor, id: string) {
  await requirePermission(actor, 'ccr', null, 'View');
  const db = financeDb();
  const incident = await db.prepare('SELECT * FROM ccr_incidents WHERE id = ? AND is_active = 1').bind(id).first() as Record<string, unknown> | null;
  if (!incident) return null;

  const [evidence, decisions, recovery, insurance, findings] = await Promise.all([
    db.prepare('SELECT id, file_id, sha256_hash, file_type, file_size, original_filename, uploader_id, upload_time, caption, content_classification FROM ccr_evidence WHERE incident_id = ? AND is_active = 1').bind(id).all().then(r => r.results as Record<string, unknown>[]),
    db.prepare('SELECT * FROM ccr_case_decisions WHERE incident_id = ?').bind(id).all().then(r => r.results as Record<string, unknown>[]),
    db.prepare('SELECT * FROM ccr_employee_recovery WHERE incident_id = ? AND is_active = 1').bind(id).all().then(r => r.results as Record<string, unknown>[]),
    db.prepare('SELECT * FROM ccr_insurance_claims WHERE incident_id = ? AND is_active = 1').bind(id).all().then(r => r.results as Record<string, unknown>[]),
    db.prepare('SELECT * FROM ccr_regulatory_findings WHERE incident_id = ? AND is_active = 1').bind(id).all().then(r => r.results as Record<string, unknown>[]),
  ]);

  return { incident, evidence, decisions, recovery, insurance, findings };
}

export async function updateIncident(actor: CcrActor, id: string, data: Record<string, unknown>) {
  await requirePermission(actor, 'ccr', 'Incidents', 'Edit');
  const db = financeDb();
  const current = await db.prepare('SELECT * FROM ccr_incidents WHERE id = ? AND is_active = 1').bind(id).first() as Record<string, unknown> | null;
  if (!current) throw new Error('Incident not found');

  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const now = new Date().toISOString();

  if (data.status !== undefined) { sets.push('internal_stage = ?'); params.push(String(data.status)); }
  if (data.assigned_to !== undefined) { sets.push('assigned_to = ?'); params.push(data.assigned_to ? String(data.assigned_to) : null); }
  if (data.priority !== undefined) { sets.push('priority = ?'); params.push(String(data.priority)); }
  if (data.recovery_status !== undefined) { sets.push('recovery_status = ?'); params.push(String(data.recovery_status)); }
  if (data.location !== undefined) { sets.push('location = ?'); params.push(String(data.location)); }
  if (data.brief_description !== undefined) { sets.push('brief_description = ?'); params.push(String(data.brief_description)); }

  if (!sets.length) return current;

  const newVersion = (current.version as number ?? 1) + 1;
  sets.push('updated_at = ?'); params.push(now);
  sets.push('updated_by = ?'); params.push(actor.person);
  sets.push('version = ?'); params.push(newVersion);
  params.push(id);

  await db.prepare(`UPDATE ccr_incidents SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'ccr_incident', id, 'Update', 'Success', {
    entityVersion: newVersion,
    oldValue: current,
    newValue: data,
  });

  return { ...current, ...data, updated_at: now, updated_by: actor.person, version: newVersion };
}

export async function uploadEvidence(actor: CcrActor, incidentId: string, file: Uint8Array, metadata: { caption?: string; source?: string; classification?: string; filename?: string; type?: string }) {
  await requirePermission(actor, 'ccr', 'Evidence', 'Upload');
  const db = financeDb();
  const incident = await db.prepare('SELECT id FROM ccr_incidents WHERE id = ? AND is_active = 1').bind(incidentId).first() as { id: string } | null;
  if (!incident) throw new Error('Incident not found');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const hash = await sha256(file);
  const fileId = `ccr/evidence/${incidentId}/${id}`;
  const bucket = financeFiles();
  await bucket.put(fileId, file);

  await db.prepare(
    'INSERT INTO ccr_evidence (id, incident_id, file_id, sha256_hash, file_type, file_size, original_filename, uploader_id, upload_time, claimed_source, content_classification, caption, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    incidentId,
    fileId,
    hash,
    metadata.type ?? 'application/octet-stream',
    file.length,
    metadata.filename ?? 'unknown',
    actor.person,
    now,
    metadata.source ?? null,
    metadata.classification ?? 'public',
    metadata.caption ?? null,
    now,
    1
  ).run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'ccr_evidence', id, 'Upload', 'Success', { newValue: { fileId, sha256: hash } });

  return { id, sha256: hash, file_id: fileId };
}

export async function listEvidence(actor: CcrActor, incidentId: string) {
  await requirePermission(actor, 'ccr', 'Evidence', 'View');
  const db = financeDb();
  const result = await db.prepare('SELECT id, file_id, sha256_hash, file_type, file_size, original_filename, uploader_id, upload_time, caption, content_classification FROM ccr_evidence WHERE incident_id = ? AND is_active = 1 ORDER BY created_at DESC').bind(incidentId).all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function approveRecovery(actor: CcrActor, incidentId: string, input: RecoveryInput) {
  await requirePermission(actor, 'ccr', 'Recovery Decisions', 'Approve');
  const db = financeDb();
  const incident = await db.prepare('SELECT * FROM ccr_incidents WHERE id = ? AND is_active = 1').bind(incidentId).first() as Record<string, unknown> | null;
  if (!incident) throw new Error('Incident not found');

  const employeeId = incident.employee_id as string | undefined;
  if (employeeId && employeeId === actor.person) {
    throw new Error('Conflict of interest - must be approved by an uninvolved owner/COO');
  }

  const decisionId = crypto.randomUUID();
  const recoveryId = employeeId && input.recovery_approved_amount > 0 ? crypto.randomUUID() : null;
  const now = new Date().toISOString();

  await db.prepare(
    'INSERT INTO ccr_case_decisions (id, incident_id, responsibility_finding, recoverable_amount, recovery_approved_amount, collection_method, reason, decision_made_by, decision_date, status, version, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    decisionId,
    incidentId,
    input.responsibility_finding,
    input.recoverable_amount,
    input.recovery_approved_amount,
    input.collection_method,
    input.reason,
    actor.person,
    now,
    'Approved',
    1,
    actor.person,
    now
  ).run();

  if (recoveryId) {
    await db.prepare(
      'INSERT INTO ccr_employee_recovery (id, incident_id, employee_id, case_decision_id, approved_total, collected_total, remaining_balance, posted_deductions, created_by, created_at, updated_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      recoveryId,
      incidentId,
      employeeId,
      decisionId,
      input.recovery_approved_amount,
      0,
      input.recovery_approved_amount,
      0,
      actor.person,
      now,
      now,
      1
    ).run();
  }

  await db.prepare('UPDATE ccr_incidents SET internal_stage = ?, recovery_status = ?, updated_at = ?, updated_by = ? WHERE id = ?').bind('Action in Progress', 'In Collection', now, actor.person, incidentId).run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'ccr_case_decision', decisionId, 'Approve', 'Success', {
    newValue: { approved_amount: input.recovery_approved_amount, method: input.collection_method },
    entityVersion: 1,
  });

  return { decision_id: decisionId, recovery_id: recoveryId };
}

export async function downloadEvidence(actor: CcrActor, evidenceId: string) {
  await requirePermission(actor, 'ccr', 'Evidence', 'Download');
  const db = financeDb();
  const evidence = await db.prepare('SELECT * FROM ccr_evidence WHERE id = ? AND is_active = 1').bind(evidenceId).first() as Record<string, unknown> | null;
  if (!evidence) throw new Error('Evidence not found');

  const classification = String(evidence.content_classification || 'public');
  if (classification === 'counsel_restricted' && !actor.owner && actor.role !== 'COO') {
    throw new Error('Access denied - counsel restricted');
  }

  const bucket = financeFiles();
  const object = await bucket.get(String(evidence.file_id));
  if (!object) throw new Error('File not found in storage');

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'ccr_evidence', evidenceId, 'Download', 'Success');

  const bytes = await object.arrayBuffer();
  return {
    bytes: new Uint8Array(bytes),
    fileType: String(evidence.file_type || 'application/octet-stream'),
    filename: String(evidence.original_filename || 'download'),
    sha256: String(evidence.sha256_hash),
  };
}

export async function getEmployeeRecoveries(actor: CcrActor) {
  await requirePermission(actor, 'ccr', null, 'View');
  const db = financeDb();
  const result = await db.prepare(
    `SELECT cr.id, cr.approved_total, cr.collected_total, cr.remaining_balance, cr.posted_deductions,
      ci.occurrence_date, ci.location, ci.category, cd.reason, cd.responsibility_finding
    FROM ccr_employee_recovery cr
    JOIN ccr_incidents ci ON cr.incident_id = ci.id
    JOIN ccr_case_decisions cd ON cr.case_decision_id = cd.id
    WHERE cr.employee_id = ? AND ci.is_active = 1 AND cr.is_active = 1
    ORDER BY cr.created_at DESC`
  ).bind(actor.person).all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function createInsuranceClaim(actor: CcrActor, incidentId: string, input: { provider?: string; claim_number?: string; amount_claimed?: number; amount_paid?: number; status?: string }) {
  await requirePermission(actor, 'ccr', 'Insurance Claims', 'Create');
  const db = financeDb();
  const incident = await db.prepare('SELECT id FROM ccr_incidents WHERE id = ? AND is_active = 1').bind(incidentId).first() as { id: string } | null;
  if (!incident) throw new Error('Incident not found');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO ccr_insurance_claims (id, incident_id, provider, claim_number, status, amount_claimed, amount_paid, created_at, updated_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, incidentId, input.provider ?? null, input.claim_number ?? null, input.status ?? 'Open', input.amount_claimed ?? null, input.amount_paid ?? null, now, now, 1).run();
  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'ccr_insurance_claim', id, 'Create', 'Success', { newValue: input });
  return { id, created_at: now };
}

export async function listInsuranceClaims(actor: CcrActor, incidentId: string) {
  await requirePermission(actor, 'ccr', null, 'View');
  const db = financeDb();
  const result = await db.prepare('SELECT * FROM ccr_insurance_claims WHERE incident_id = ? AND is_active = 1 ORDER BY created_at DESC').bind(incidentId).all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function createRegulatoryFinding(actor: CcrActor, incidentId: string, input: { agency?: string; finding?: string; status?: string; due_date?: string }) {
  await requirePermission(actor, 'ccr', 'Regulatory Findings', 'Create');
  const db = financeDb();
  const incident = await db.prepare('SELECT id FROM ccr_incidents WHERE id = ? AND is_active = 1').bind(incidentId).first() as { id: string } | null;
  if (!incident) throw new Error('Incident not found');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO ccr_regulatory_findings (id, incident_id, agency, finding, status, due_date, created_at, updated_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, incidentId, input.agency ?? null, input.finding ?? null, input.status ?? 'Open', input.due_date ?? null, now, now, 1).run();
  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'ccr_regulatory_finding', id, 'Create', 'Success', { newValue: input });
  return { id, created_at: now };
}

export async function listRegulatoryFindings(actor: CcrActor, incidentId: string) {
  await requirePermission(actor, 'ccr', null, 'View');
  const db = financeDb();
  const result = await db.prepare('SELECT * FROM ccr_regulatory_findings WHERE incident_id = ? AND is_active = 1 ORDER BY created_at DESC').bind(incidentId).all();
  return (result.results || []) as Record<string, unknown>[];
}
