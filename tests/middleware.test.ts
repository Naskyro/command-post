import { describe, it, expect, vi } from 'vitest';
import { checkAdminPermission } from '@/lib/admin';

let mockResults: Record<string, unknown>[] = [];

function createStmt() {
  return {
    all: vi.fn().mockImplementation(async () => ({ results: mockResults })),
    first: vi.fn().mockImplementation(async () => mockResults[0] || null),
    bind: vi.fn().mockImplementation(() => createStmt()),
  };
}

const mockDb = {
  prepare: vi.fn().mockImplementation(() => createStmt()),
};

vi.mock('@/db/finance', () => ({
  financeDb: () => mockDb,
}));

function setResults(results: Record<string, unknown>[]) {
  mockResults = results;
}

describe('checkAdminPermission', () => {
  it('allows Owner for any action', async () => {
    const result = await checkAdminPermission({ person: 'owner-1', name: 'Owner', role: 'Owner', owner: true }, 'finance', 'Payroll', 'Create');
    expect(result.allowed).toBe(true);
  });

  it('allows Employee to view CCR when admin tables are not seeded', async () => {
    setResults([]);
    const result = await checkAdminPermission({ person: 'emp-1', name: 'Employee', role: 'Employee', owner: false }, 'ccr', null, 'View');
    expect(result.allowed).toBe(true);
  });

  it('denies Employee finance posting when admin tables are not seeded', async () => {
    setResults([]);
    const result = await checkAdminPermission({ person: 'emp-1', name: 'Employee', role: 'Employee', owner: false }, 'finance', 'Payroll', 'Post');
    expect(result.allowed).toBe(false);
  });

  it('allows COO finance posting when admin tables are not seeded', async () => {
    setResults([]);
    const result = await checkAdminPermission({ person: 'coo-1', name: 'COO', role: 'COO', owner: false }, 'finance', 'Payroll', 'Post');
    expect(result.allowed).toBe(true);
  });

  it('denies Employee when admin tables are seeded but no permission exists', async () => {
    setResults([{ c: 1 }]);
    const result = await checkAdminPermission({ person: 'emp-1', name: 'Employee', role: 'Employee', owner: false }, 'ccr', null, 'View');
    expect(result.allowed).toBe(false);
  });

  it('allows when admin tables are seeded and a matching permission exists', async () => {
    setResults([{ c: 1 }, { role_id: 'role-employee', module: 'ccr', tab: null, actions: 'View' }]);
    const result = await checkAdminPermission({ person: 'emp-1', name: 'Employee', role: 'Employee', owner: false }, 'ccr', null, 'View');
    expect(result.allowed).toBe(true);
  });
});
