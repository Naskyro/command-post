import { financeDb } from '@/db/finance';
import { logAudit } from '@/lib/audit';
import { checkAdminPermission } from '@/lib/admin';
import type { Viewer } from '@/lib/finance/model';

export type VehicleActor = Pick<Viewer, 'person' | 'name' | 'role' | 'owner'>;

export type VehicleInput = {
  vin?: string;
  license_plate?: string;
  license_plate_state?: string;
  year?: number;
  make?: string;
  model?: string;
  color?: string;
  mileage?: number;
  has_keys?: boolean;
  runs?: boolean;
  condition_notes?: string;
  first_notice_date?: string;
  first_notice_sent_by?: string;
  second_notice_date?: string;
  second_notice_due_date?: string;
  vtr_265_picked_up?: boolean;
  vtr_265_pickup_date?: string;
  recommended_disposition?: string;
  recommended_by?: string;
  approved_disposition?: string;
  approved_by?: string;
  retail_estimate?: number;
  auction_estimate?: number;
  part_out_estimate?: number;
  scrap_estimate?: number;
  sale_price?: number;
  sale_platform?: string;
  buyer_name?: string;
  sale_date?: string;
  days_on_market?: number;
  towing_cost?: number;
  storage_cost?: number;
  listing_cost?: number;
  marketing_cost?: number;
  commission?: number;
  other_costs?: number;
  towbook_call_number?: string;
  released_from_towbook?: boolean;
  status?: string;
  assigned_to?: string;
};

async function requirePermission(actor: VehicleActor, action: string) {
  const perm = await checkAdminPermission(actor, 'vehicles', null, action);
  if (!perm.allowed) throw new Error(perm.reason || `No permission for action: ${action}`);
}

function computeNetRecovery(r: Partial<VehicleInput>): number | null {
  const sale = r.sale_price ?? null;
  if (sale === null) return null;
  const costs = ['towing_cost', 'storage_cost', 'listing_cost', 'marketing_cost', 'commission', 'other_costs']
    .reduce((sum, k) => sum + (Number(r[k as keyof VehicleInput]) || 0), 0);
  return Math.round((sale - costs) * 100) / 100;
}

function computeDaysOnMarket(r: Partial<VehicleInput>): number | null {
  if (!r.first_notice_date) return null;
  const start = new Date(r.first_notice_date).getTime();
  const end = r.sale_date ? new Date(r.sale_date).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 86400000));
}

export async function createVehicle(actor: VehicleActor, input: VehicleInput) {
  await requirePermission(actor, 'Create');
  const db = financeDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const netRecovery = computeNetRecovery(input);
  const daysOnMarket = computeDaysOnMarket(input);

  await db.prepare(
    `INSERT INTO vehicle_dispositions (
      id, vin, license_plate, license_plate_state, year, make, model, color, mileage,
      has_keys, runs, condition_notes,
      first_notice_date, first_notice_sent_by, second_notice_date, second_notice_due_date,
      vtr_265_picked_up, vtr_265_pickup_date,
      recommended_disposition, recommended_by, approved_disposition, approved_by,
      retail_estimate, auction_estimate, part_out_estimate, scrap_estimate,
      sale_price, sale_platform, buyer_name, sale_date, days_on_market,
      towing_cost, storage_cost, listing_cost, marketing_cost, commission, other_costs, net_recovery,
      towbook_call_number, released_from_towbook,
      status, assigned_to,
      version, is_active, created_by, created_at, updated_at, updated_by
    ) VALUES (
      ?,?,?,?,?,?,?,?,?,?,
      ?,?,?,
      ?,?,?,?,
      ?,?,
      ?,?,?,?,
      ?,?,?,?,
      ?,?,?,?,?,
      ?,?,?,?,?,?,?,
      ?,?,
      ?,?,
      ?,?,?,?,?,?
    )`
  ).bind(
    id,
    input.vin ?? null,
    input.license_plate ?? null,
    input.license_plate_state ?? null,
    input.year ?? null,
    input.make ?? null,
    input.model ?? null,
    input.color ?? null,
    input.mileage ?? null,
    input.has_keys ? 1 : 0,
    input.runs ? 1 : 0,
    input.condition_notes ?? null,
    input.first_notice_date ?? null,
    input.first_notice_sent_by ?? null,
    input.second_notice_date ?? null,
    input.second_notice_due_date ?? null,
    input.vtr_265_picked_up ? 1 : 0,
    input.vtr_265_pickup_date ?? null,
    input.recommended_disposition ?? null,
    actor.person,
    null, // approved_disposition
    null, // approved_by
    input.retail_estimate ?? null,
    input.auction_estimate ?? null,
    input.part_out_estimate ?? null,
    input.scrap_estimate ?? null,
    input.sale_price ?? null,
    input.sale_platform ?? null,
    input.buyer_name ?? null,
    input.sale_date ?? null,
    daysOnMarket,
    input.towing_cost ?? null,
    input.storage_cost ?? null,
    input.listing_cost ?? null,
    input.marketing_cost ?? null,
    input.commission ?? null,
    input.other_costs ?? null,
    netRecovery,
    input.towbook_call_number ?? null,
    input.released_from_towbook ? 1 : 0,
    input.status ?? 'intake',
    input.assigned_to ?? null,
    1, // version
    1, // is_active
    actor.person,
    now,
    now,
    actor.person
  ).run();

  await logAudit(
    { personId: actor.person, personName: actor.name, role: actor.role },
    'vehicle_disposition', id, 'Create', 'Success', { newValue: input }
  );

  return { id, created_at: now };
}

export async function listVehicles(actor: VehicleActor, filters: { status?: string; assigned_to?: string; limit?: number } = {}) {
  await requirePermission(actor, 'View');
  const db = financeDb();
  const limit = Math.min(filters.limit ?? 50, 200);

  let sql = 'SELECT * FROM vehicle_dispositions WHERE is_active = 1';
  const params: (string | number)[] = [];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.assigned_to) { sql += ' AND assigned_to = ?'; params.push(filters.assigned_to); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const result = await db.prepare(sql).bind(...params).all();
  return result.results;
}

export async function getVehicle(actor: VehicleActor, id: string) {
  await requirePermission(actor, 'View');
  const db = financeDb();
  const result = await db.prepare('SELECT * FROM vehicle_dispositions WHERE id = ? AND is_active = 1').bind(id).first();
  if (!result) throw new Error('Vehicle record not found.');
  return result;
}

export async function updateVehicle(actor: VehicleActor, id: string, patch: Partial<VehicleInput>, version: number) {
  await requirePermission(actor, 'Update');
  const db = financeDb();
  const now = new Date().toISOString();

  // Fetch current row to merge patch and compute derived fields
  const existing = await db.prepare('SELECT * FROM vehicle_dispositions WHERE id = ? AND is_active = 1').bind(id).first<Record<string, unknown>>();
  if (!existing) throw new Error('Vehicle record not found.');
  if (existing.version !== version) throw new Error('This record was changed by someone else. Refresh and try again.');

  const merged = { ...existing, ...patch };
  const netRecovery = computeNetRecovery(merged as VehicleInput);
  const daysOnMarket = computeDaysOnMarket(merged as VehicleInput);

  const result = await db.prepare(
    `UPDATE vehicle_dispositions SET
      vin=?, license_plate=?, license_plate_state=?, year=?, make=?, model=?, color=?, mileage=?,
      has_keys=?, runs=?, condition_notes=?,
      first_notice_date=?, first_notice_sent_by=?, second_notice_date=?, second_notice_due_date=?,
      vtr_265_picked_up=?, vtr_265_pickup_date=?,
      recommended_disposition=?, recommended_by=?, approved_disposition=?, approved_by=?,
      retail_estimate=?, auction_estimate=?, part_out_estimate=?, scrap_estimate=?,
      sale_price=?, sale_platform=?, buyer_name=?, sale_date=?, days_on_market=?,
      towing_cost=?, storage_cost=?, listing_cost=?, marketing_cost=?, commission=?, other_costs=?, net_recovery=?,
      towbook_call_number=?, released_from_towbook=?,
      status=?, assigned_to=?,
      version=version+1, updated_at=?, updated_by=?
    WHERE id=? AND version=?`
  ).bind(
    merged.vin ?? null,
    merged.license_plate ?? null,
    merged.license_plate_state ?? null,
    merged.year ?? null,
    merged.make ?? null,
    merged.model ?? null,
    merged.color ?? null,
    merged.mileage ?? null,
    merged.has_keys ? 1 : 0,
    merged.runs ? 1 : 0,
    merged.condition_notes ?? null,
    merged.first_notice_date ?? null,
    merged.first_notice_sent_by ?? null,
    merged.second_notice_date ?? null,
    merged.second_notice_due_date ?? null,
    merged.vtr_265_picked_up ? 1 : 0,
    merged.vtr_265_pickup_date ?? null,
    merged.recommended_disposition ?? null,
    merged.recommended_by ?? null,
    merged.approved_disposition ?? null,
    merged.approved_by ?? null,
    merged.retail_estimate ?? null,
    merged.auction_estimate ?? null,
    merged.part_out_estimate ?? null,
    merged.scrap_estimate ?? null,
    merged.sale_price ?? null,
    merged.sale_platform ?? null,
    merged.buyer_name ?? null,
    merged.sale_date ?? null,
    daysOnMarket,
    merged.towing_cost ?? null,
    merged.storage_cost ?? null,
    merged.listing_cost ?? null,
    merged.marketing_cost ?? null,
    merged.commission ?? null,
    merged.other_costs ?? null,
    netRecovery,
    merged.towbook_call_number ?? null,
    merged.released_from_towbook ? 1 : 0,
    merged.status ?? 'intake',
    merged.assigned_to ?? null,
    now,
    actor.person,
    id,
    version
  ).run();

  if (!result.meta.changes) throw new Error('Save conflicted. Refresh and retry.');

  await logAudit(
    { personId: actor.person, personName: actor.name, role: actor.role },
    'vehicle_disposition', id, 'Update', 'Success', { newValue: patch }
  );

  return { id, updated_at: now };
}

export async function approveDisposition(actor: VehicleActor, id: string, disposition: string, version: number) {
  await requirePermission(actor, 'Approve');
  const db = financeDb();
  const now = new Date().toISOString();

  const existing = await db.prepare('SELECT * FROM vehicle_dispositions WHERE id = ? AND is_active = 1').bind(id).first<Record<string, unknown>>();
  if (!existing) throw new Error('Vehicle record not found.');
  if (existing.version !== version) throw new Error('Record was changed. Refresh and retry.');

  await db.prepare(
    `UPDATE vehicle_dispositions SET approved_disposition=?, approved_by=?, status='listed', version=version+1, updated_at=?, updated_by=? WHERE id=? AND version=?`
  ).bind(disposition, actor.person, now, actor.person, id, version).run();

  await logAudit(
    { personId: actor.person, personName: actor.name, role: actor.role },
    'vehicle_disposition', id, 'ApproveDisposition', 'Success', { newValue: { disposition } }
  );

  return { id, approved_disposition: disposition };
}
