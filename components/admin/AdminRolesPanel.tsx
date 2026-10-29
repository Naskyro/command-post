'use client';
import { useCallback, useEffect, useState } from 'react';
import { Shield, Users, Plus, CheckCircle, Loader, X } from 'lucide-react';
import { requestJson } from '@/lib/shared/client';
import type { Viewer } from '@/lib/finance/model';
import '@/components/finance/finance.css';
import '@/components/finance/timeclock.css';

type Role = Record<string, unknown>;
type Permission = Record<string, unknown>;

export default function AdminRolesPanel({ viewer }: { viewer: Viewer }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [r, p] = await Promise.all([
        requestJson<{ roles: Role[] }>('/api/admin/roles'),
        requestJson<{ permissions: Permission[] }>('/api/admin/permissions'),
      ]);
      setRoles(r.roles || []);
      setPermissions(p.permissions || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    setSeeding(true);
    setError('');
    try {
      await requestJson('/api/admin/seed', {});
      setSuccess('Base roles seeded successfully.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setCreating(true);
    setError('');
    try {
      await requestJson('/api/admin/roles', { name: newRoleName.trim(), description: newRoleDesc.trim() });
      setSuccess(`Role "${newRoleName.trim()}" created.`);
      setNewRoleName('');
      setNewRoleDesc('');
      setShowCreate(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const permsByRole = (roleId: unknown) => permissions.filter(p => p.role_id === roleId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>

      {error && <p className="f-error">{error}</p>}
      {success && (
        <div className="f-toast-inline" role="status">
          <CheckCircle size={15} /> {success}
          <button className="f-icon" onClick={() => setSuccess('')}><X size={13} /></button>
        </div>
      )}

      {/* Roles card */}
      <section className="f-card">
        <header>
          <h2><Shield size={17} style={{ verticalAlign: 'middle' }} /> Roles</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {viewer.owner && (
              <>
                <button className="f-button" onClick={() => void seed()} disabled={seeding}>
                  {seeding ? <><Loader size={13} /> Seeding…</> : 'Seed base roles'}
                </button>
                <button className="f-button primary" onClick={() => setShowCreate(v => !v)}>
                  <Plus size={14} /> New role
                </button>
              </>
            )}
          </div>
        </header>

        {showCreate && (
          <form onSubmit={createRole} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1.5rem', alignItems: 'flex-end', borderBottom: '1px solid var(--f-border)', flexWrap: 'wrap' }}>
            <label className="f-label" style={{ flex: '1 1 160px' }}>
              <span>Role name</span>
              <input type="text" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="e.g. Dispatcher" required />
            </label>
            <label className="f-label" style={{ flex: '2 1 240px' }}>
              <span>Description</span>
              <input type="text" value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} placeholder="Brief description of role responsibilities" />
            </label>
            <button type="submit" className="f-button primary" disabled={creating} style={{ marginBottom: '0.25rem' }}>
              {creating ? <Loader size={13} /> : <Plus size={13} />} Create
            </button>
            <button type="button" className="f-button" onClick={() => setShowCreate(false)} style={{ marginBottom: '0.25rem' }}>Cancel</button>
          </form>
        )}

        <div className="tc-table-wrap" style={{ maxHeight: '45vh', overflow: 'auto' }}>
          <table className="tc-table">
            <thead>
              <tr>
                <th>Role name</th>
                <th>Description</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--f-muted)' }}>
                  No roles found. {viewer.owner && <button className="f-text" onClick={() => void seed()}>Seed base roles.</button>}
                </td></tr>
              )}
              {roles.map(r => (
                <tr key={String(r.id)}>
                  <td><b>{String(r.name)}</b></td>
                  <td><small>{String(r.description || '—')}</small></td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {permsByRole(r.id).length === 0
                        ? <small style={{ color: 'var(--f-muted)' }}>No permissions</small>
                        : permsByRole(r.id).map((p, i) => (
                          <span key={i} className="f-badge">
                            {String(p.module)}{p.tab ? ` / ${p.tab}` : ''}
                          </span>
                        ))
                      }
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* All permissions card */}
      <section className="f-card">
        <header><h2><Users size={17} style={{ verticalAlign: 'middle' }} /> All permissions ({permissions.length})</h2></header>
        <div className="tc-table-wrap" style={{ maxHeight: '40vh', overflow: 'auto' }}>
          <table className="tc-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Module</th>
                <th>Tab</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {permissions.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--f-muted)' }}>No permissions defined</td></tr>
              )}
              {permissions.map((p, i) => {
                const role = roles.find(r => r.id === p.role_id);
                return (
                  <tr key={String(p.id || i)}>
                    <td><b>{String(role?.name || p.role_id)}</b></td>
                    <td>{String(p.module)}</td>
                    <td><small>{String(p.tab || '—')}</small></td>
                    <td>
                      {String(p.actions).split(',').map((a, j) => (
                        <span key={j} className="f-badge" style={{ marginRight: '0.2rem' }}>{a.trim()}</span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
