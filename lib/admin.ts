import { financeDb } from '@/db/finance';
import { logAudit } from '@/lib/audit';
import type { Viewer } from '@/lib/finance/model';

export type AdminActor = Pick<Viewer, 'person' | 'name' | 'role' | 'owner'>;

const BASE_ROLES = [
  { id: 'role-owner', name: 'Owner', description: 'Full access' },
  { id: 'role-coo', name: 'COO', description: 'Operations + Finance approval' },
  { id: 'role-dept-head', name: 'Department Head', description: 'Department recovery approval' },
  { id: 'role-supervisor', name: 'Supervisor', description: 'Incident triage + evidence' },
  { id: 'role-employee', name: 'Employee', description: 'Self-service + reporting' },
];

export async function ensureBaseRoles(actor: AdminActor) {
  const db = financeDb();
  const existing = await db.prepare('SELECT id FROM admin_roles WHERE id IN (?, ?, ?, ?, ?)').bind(...BASE_ROLES.map(r => r.id)).all();
  const existingIds = new Set((existing.results || []).map((r: any) => r.id));
  const now = new Date().toISOString();
  for (const role of BASE_ROLES) {
    if (!existingIds.has(role.id)) {
      await db.prepare('INSERT INTO admin_roles (id, name, description, created_at, is_active) VALUES (?, ?, ?, ?, ?)').bind(role.id, role.name, role.description, now, 1).run();
    }
  }
  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'admin_roles', 'seed', 'Create', 'Success', { newValue: BASE_ROLES });
  return BASE_ROLES;
}

export async function createRole(actor: AdminActor, input: { id?: string; name: string; description?: string }) {
  const db = financeDb();
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO admin_roles (id, name, description, created_at, is_active) VALUES (?, ?, ?, ?, ?)').bind(id, input.name, input.description ?? null, now, 1).run();
  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'admin_roles', id, 'Create', 'Success', { newValue: input });
  return { id, name: input.name, created_at: now };
}

export async function listRoles(actor: AdminActor) {
  const db = financeDb();
  const result = await db.prepare('SELECT * FROM admin_roles WHERE is_active = 1 ORDER BY created_at DESC').all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function createPermission(actor: AdminActor, input: { role_id: string; module: string; tab?: string; actions: string; scope?: string }) {
  const db = financeDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO admin_permissions (id, role_id, module, tab, actions, scope, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, input.role_id, input.module, input.tab ?? null, input.actions, input.scope ?? null, 1).run();
  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'admin_permissions', id, 'Create', 'Success', { newValue: input });
  return { id, ...input };
}

export async function assignRole(actor: AdminActor, input: { user_id: string; role_id: string; department_id?: string; effective_date?: string }) {
  const db = financeDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const effective = input.effective_date ?? now.slice(0, 10);
  await db.prepare('INSERT INTO admin_role_assignments (id, user_id, role_id, department_id, effective_date, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, input.user_id, input.role_id, input.department_id ?? null, effective, 1, now).run();
  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'admin_role_assignments', id, 'Create', 'Success', { newValue: input });
  return { id, ...input, created_at: now };
}

function fallbackPermission(actor: AdminActor, module: string, _tab: string | null, action: string): { allowed: boolean; reason?: string } {
  const role = actor.role;
  if (role === 'Owner') return { allowed: true };
  if (module === 'me') return { allowed: true }; // employee self-service
  if (module === 'admin' && role === 'Owner') return { allowed: true };

  const ccrView = ['Owner', 'COO', 'Department Head', 'Supervisor', 'Employee'];
  const ccrCreate = ['Owner', 'COO', 'Department Head', 'Supervisor', 'Employee'];
  const ccrEdit = ['Owner', 'COO', 'Department Head', 'Supervisor'];
  const ccrApprove = ['Owner', 'COO', 'Department Head'];
  const finance = ['Owner', 'COO'];

  if (module === 'ccr') {
    if (action === 'View') return { allowed: ccrView.includes(role) };
    if (action === 'Create' || action === 'Upload' || action === 'Download') return { allowed: ccrCreate.includes(role) };
    if (action === 'Edit') return { allowed: ccrEdit.includes(role) };
    if (action === 'Approve') return { allowed: ccrApprove.includes(role) };
  }

  if (module === 'finance') {
    if (['View', 'Post', 'Withdraw', 'Deposit', 'Create'].includes(action)) return { allowed: finance.includes(role) };
  }

  return { allowed: false, reason: `No permission for action: ${action}` };
}

export async function checkAdminPermission(actor: AdminActor, module: string, tab: string | null, action: string): Promise<{ allowed: boolean; reason?: string }> {
  if (actor.owner || actor.role === 'Owner') return { allowed: true };

  const db = financeDb();
  const now = new Date().toISOString().slice(0, 10);
  const roleCount = await db.prepare('SELECT COUNT(*) as c FROM admin_roles WHERE is_active = 1').all();
  const seeded = Number((roleCount.results?.[0] as Record<string, unknown> | undefined)?.c ?? 0) > 0;

  const assignments = await db.prepare(
    'SELECT a.role_id, p.module, p.tab, p.actions, p.scope FROM admin_role_assignments a JOIN admin_permissions p ON a.role_id = p.role_id WHERE a.user_id = ? AND a.is_active = 1 AND (a.end_date IS NULL OR a.end_date > ?) AND (a.effective_date IS NULL OR a.effective_date <= ?) AND p.module = ? AND p.is_active = 1'
  ).bind(actor.person, now, now, module).all();

  const perms = assignments.results as Record<string, unknown>[];
  if (!seeded || !perms.length) return fallbackPermission(actor, module, tab, action);

  for (const p of perms) {
    const tabMatch = !tab || !p.tab || p.tab === tab;
    const actions = String(p.actions).split(',').map(s => s.trim());
    if (tabMatch && actions.includes(action)) return { allowed: true };
  }

  return { allowed: false, reason: `No permission for action: ${action}` };
}

export async function getRoleById(actor: AdminActor, id: string) {
  const db = financeDb();
  const role = await db.prepare('SELECT * FROM admin_roles WHERE id = ? AND is_active = 1').bind(id).first() as Record<string, unknown> | null;
  if (!role) return null;
  const permissions = await db.prepare('SELECT * FROM admin_permissions WHERE role_id = ? AND is_active = 1').bind(id).all();
  return { role, permissions: permissions.results || [] };
}

export async function listPermissions(actor: AdminActor) {
  const db = financeDb();
  const result = await db.prepare('SELECT * FROM admin_permissions WHERE is_active = 1').all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function getUserRoles(actor: AdminActor, userId: string) {
  const db = financeDb();
  const result = await db.prepare(
    `SELECT a.*, r.name as role_name, r.description as role_description
    FROM admin_role_assignments a
    JOIN admin_roles r ON a.role_id = r.id
    WHERE a.user_id = ? AND a.is_active = 1 AND r.is_active = 1`
  ).bind(userId).all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function listAudit(actor: AdminActor, filters: { entity_type?: string; entity_id?: string; actor_id?: string; limit?: number }) {
  const db = financeDb();
  const limit = Math.min(filters.limit ?? 100, 1000);
  let query = 'SELECT * FROM audit_log WHERE is_active = 1';
  const params: (string | number)[] = [];
  if (filters.entity_type) { query += ' AND entity_type = ?'; params.push(filters.entity_type); }
  if (filters.entity_id) { query += ' AND entity_id = ?'; params.push(filters.entity_id); }
  if (filters.actor_id) { query += ' AND actor_id = ?'; params.push(filters.actor_id); }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const result = await db.prepare(query).bind(...params).all();
  return (result.results || []) as Record<string, unknown>[];
}
