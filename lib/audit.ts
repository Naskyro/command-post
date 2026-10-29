import { financeDb } from '@/db/finance';

type AuditActor = { personId: string; personName: string; role: string; requestId?: string };
type AuditDetails = {
  entityVersion?: number;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  denialReason?: string;
};

export async function logAudit(
  actor: AuditActor,
  entityType: string,
  entityId: string,
  operation: string,
  outcome: 'Success' | 'Denied' | 'Failed',
  details?: AuditDetails
): Promise<void> {
  const db = financeDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const requestId = actor.requestId || crypto.randomUUID();

  const oldValue = details?.oldValue !== undefined ? JSON.stringify(details.oldValue) : null;
  const newValue = details?.newValue !== undefined ? JSON.stringify(details.newValue) : null;

  await db
    .prepare(
      'INSERT INTO audit_log (id, entity_type, entity_id, entity_version, actor_id, actor_role_at_time, operation, field_name, old_value, new_value, outcome, denial_reason, request_id, action_time, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      id,
      entityType,
      entityId,
      details?.entityVersion ?? null,
      actor.personId,
      actor.role,
      operation,
      details?.fieldName ?? null,
      oldValue,
      newValue,
      outcome,
      details?.denialReason ?? null,
      requestId,
      now,
      now,
      1
    )
    .run();
}

export async function listAuditForEntity(entityType: string, entityId: string, limit = 100): Promise<Record<string, unknown>[]> {
  const db = financeDb();
  const result = await db
    .prepare('SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT ?')
    .bind(entityType, entityId, limit)
    .all();
  return result.results as Record<string, unknown>[];
}
