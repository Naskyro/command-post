import { financeDb } from '@/db/finance';

export type W4Values = { filingStatus?: string; federalAllowances?: number; stateAllowances?: number };

export async function getW4(employeeId: string): Promise<W4Values> {
  const db = financeDb();
  const row = await db.prepare('SELECT payload FROM finance_records WHERE id = ? AND kind = ?').bind(employeeId, 'person').first() as { payload: string } | null;
  if (!row) return {};
  const payload = JSON.parse(row.payload) as Record<string, unknown>;
  return {
    filingStatus: payload.filing_status as string | undefined,
    federalAllowances: typeof payload.federal_allowances === 'number' ? Number(payload.federal_allowances) : undefined,
    stateAllowances: typeof payload.state_allowances === 'number' ? Number(payload.state_allowances) : undefined,
  };
}

export async function setW4(employeeId: string, values: W4Values): Promise<W4Values> {
  const db = financeDb();
  const row = await db.prepare('SELECT payload FROM finance_records WHERE id = ? AND kind = ?').bind(employeeId, 'person').first() as { payload: string } | null;
  if (!row) throw new Error('Employee person record not found');
  const payload = JSON.parse(row.payload) as Record<string, unknown>;
  if (values.filingStatus !== undefined) payload.filing_status = values.filingStatus;
  if (values.federalAllowances !== undefined) payload.federal_allowances = values.federalAllowances;
  if (values.stateAllowances !== undefined) payload.state_allowances = values.stateAllowances;
  await db.prepare('UPDATE finance_records SET payload = ?, version = version + 1, updated_at = ? WHERE id = ? AND kind = ?').bind(JSON.stringify(payload), new Date().toISOString(), employeeId, 'person').run();
  return { ...payload } as W4Values;
}
