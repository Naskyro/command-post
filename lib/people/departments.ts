import type { FinRecord, Viewer } from '../finance/model';
import { canAccess } from '../finance/access.ts';
import { hrCan } from '../hr/permissions.ts';

export function departmentFor(records: FinRecord[], nameOrId: unknown): FinRecord | undefined {
  const value = String(nameOrId || '').trim().toLowerCase();
  return records.find(r => r.kind === 'department' && [r.id, r.name, ...(Array.isArray(r.aliases) ? r.aliases : [])].some(n => String(n).toLowerCase() === value));
}
export function activeDepartments(records: FinRecord[]) {
  return records.filter(r => r.kind === 'department' && r.status !== 'Retired').sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
export function resolveDepartmentLabels(records: FinRecord[]): FinRecord[] {
  return records.map(r => {
    if (!r.department || r.kind === 'department') return r;
    const department = departmentFor(records, r.departmentId || r.department);
    if (!department) return r;
    const seedKey = ['Operations', 'Dispatch', 'Drivers', 'Account Managers'][Number(department.id.match(/^department-(\d)$/)?.[1])];
    return { ...r, department: department.name, departmentId: department.id, departmentKey: seedKey || department.name };
  });
}
export function canManageDepartments(viewer: Viewer, records: FinRecord[]) {
  return viewer.owner || canAccess(viewer, 'Admin', 'departments', true) && hrCan(viewer, 'manageSettings', undefined, records);
}
