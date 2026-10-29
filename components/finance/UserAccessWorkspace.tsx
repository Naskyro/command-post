'use client';
import { useCallback, useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import type { FinanceData, FinRecord } from '@/lib/finance/model';
import DepartmentSettings from '@/components/people/DepartmentSettings';
import { grantsFor, canAccess } from '@/lib/finance/access';
import { canEditAccess } from '@/lib/people/policy';
import { requestJson } from '@/lib/shared/client';
import PersonEditor from '@/components/people/PersonEditor';
import AdminRolesPanel from '@/components/admin/AdminRolesPanel';
import AdminAuditPanel from '@/components/admin/AdminAuditPanel';
import './finance.css';
import './timeclock.css';

const TABS: [string, string][] = [
  ['users', 'Users & access'],
  ['departments', 'Departments'],
  ['roles', 'Roles & permissions'],
  ['audit', 'Audit log'],
];

function tabVisible(viewer: FinanceData['viewer'], key: string) {
  if (key === 'roles' || key === 'audit') return viewer.owner;
  return canAccess(viewer, 'Admin', key);
}

export default function UserAccessWorkspace() {
  const [tab, setTab] = useState('users');
  const [data, setData] = useState<FinanceData | null>(null);
  const [editing, setEditing] = useState<FinRecord | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Active');

  const load = useCallback(async () => {
    try {
      setData(await requestJson<FinanceData>('/api/people?surface=admin'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!data) return <div className="f-workspace f-loading"><Users /><h2>{error || 'Loading users...'}</h2>{error && <button className="f-button" onClick={() => void load()}>Try again</button>}</div>;

  const people = data.records.filter(r =>
    r.kind === 'person' &&
    (status === 'All' || r.status === status) &&
    [r.name, r.email, r.department, r.title].join(' ').toLowerCase().includes(search.toLowerCase())
  );

  const visibleTabs = TABS.filter(([key]) => tabVisible(data.viewer, key));

  return (
    <div className="f-workspace">
      <header className="f-heading"><h1>Admin</h1></header>
      <nav className="f-tabs">
        {visibleTabs.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      {tab === 'departments' && <DepartmentSettings records={data.records} viewer={data.viewer} onSaved={load} />}

      {tab === 'roles' && <AdminRolesPanel viewer={data.viewer} />}

      {tab === 'audit' && <AdminAuditPanel viewer={data.viewer} />}

      {tab === 'users' && (
        <>
          <div className="f-toolbar">
            <label className="f-search">
              <Search size={17} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people, email, department..." aria-label="Search users" />
            </label>
            <select value={status} onChange={e => setStatus(e.target.value)} aria-label="User status">
              {['Active', 'Onboarding', 'Former', 'Leave', 'All'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <section className="f-card">
            <div className="tc-table-wrap">
              <table className="tc-table">
                <thead><tr><th>Person</th><th>Email</th><th>Department / title</th><th>Access role</th><th>Last changed</th><th /></tr></thead>
                <tbody>
                  {people.map(p => (
                    <tr key={p.id}>
                      <td><b>{String(p.name)}</b><small>{String(p.status)}</small></td>
                      <td>{String(p.email)}<small>{((p.emailAliases || []) as string[]).join(', ')}</small></td>
                      <td>{String(p.department)}<small>{String(p.title || '')}</small></td>
                      <td>{String(p.role)}<small>{p.role === 'Owner' ? 'Unrestricted' : grantsFor(p).length + ' tabs'} - {String(p.accountStatus || 'Enabled')}</small></td>
                      <td>{String(p.updatedBy || 'Initial setup')}<small>{p.updatedAt ? new Date(String(p.updatedAt)).toLocaleString() : ''}</small></td>
                      <td>{canEditAccess(data.viewer, p, data.records) && <button className="f-button" onClick={() => setEditing(p)}>Edit access</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {error && <p className="f-error">{error}</p>}
      {editing && <PersonEditor key={editing.id} person={editing} viewer={data.viewer} people={data.records.filter(r => r.kind === 'person')} mode="admin" onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
