'use client';
import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { requestJson } from '@/lib/shared/client';
import type { Viewer } from '@/lib/finance/model';
import '@/components/finance/finance.css';
import '@/components/finance/timeclock.css';

type AuditLog = Record<string, unknown>;

function OutcomeBadge({ outcome }: { outcome: unknown }) {
  const o = String(outcome || '');
  const cls = o === 'Success' ? 'green' : o === 'Denied' ? 'amber' : o === 'Error' ? 'red' : '';
  const Icon = o === 'Success' ? CheckCircle : o === 'Denied' || o === 'Error' ? XCircle : Clock;
  return <span className={`f-badge ${cls}`}><Icon size={11} style={{ verticalAlign: 'middle' }} /> {o}</span>;
}

function fmtTime(s: unknown) {
  if (!s) return '—';
  try {
    return new Date(String(s)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return String(s); }
}

export default function AdminAuditPanel({ viewer }: { viewer: Viewer }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterOp, setFilterOp] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '200' });
      const res = await requestJson<{ events: AuditLog[]; count: number }>(`/api/admin/audit-log?${params}`);
      setLogs(res.events || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // filterOp and filterOutcome are applied client-side below
  }, []);

  useEffect(() => { load(); }, [load]);

  const operations = [...new Set(logs.map(l => String(l.operation)).filter(Boolean))];
  const displayed = logs.filter(l =>
    (!filterOp || String(l.operation) === filterOp) &&
    (!filterOutcome || String(l.outcome) === filterOutcome)
  );

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {error && <p className="f-error">{error}</p>}

      <section className="f-card">
        <header>
          <h2><ClipboardList size={17} style={{ verticalAlign: 'middle' }} /> Audit log ({displayed.length}{displayed.length !== logs.length ? ` of ${logs.length}` : ''})</h2>
          <button className="f-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </header>

        <div className="f-toolbar" style={{ paddingTop: 0 }}>
          <select value={filterOp} onChange={e => setFilterOp(e.target.value)} aria-label="Filter by operation">
            <option value="">All operations</option>
            {operations.map(op => <option key={op}>{op}</option>)}
          </select>
          <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} aria-label="Filter by outcome">
            <option value="">All outcomes</option>
            {['Success', 'Denied', 'Error'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="tc-table-wrap" style={{ maxHeight: '65vh', overflow: 'auto' }}>
          <table className="tc-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Operation</th>
                <th>Entity</th>
                <th>Outcome</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--f-muted)' }}>
                  {logs.length === 0 ? 'No audit records found' : 'No records match the current filters'}
                </td></tr>
              )}
              {loading && logs.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--f-muted)' }}>Loading…</td></tr>
              )}
              {displayed.map((l, i) => {
                const id = String(l.id || i);
                const isOpen = expanded === id;
                return (
                  <>
                    <tr key={id} style={{ cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : id)}>
                      <td><small>{fmtTime(l.created_at)}</small></td>
                      <td>
                        <b>{String(l.actor_name || '—')}</b>
                        <small> {String(l.actor_role || '')}</small>
                      </td>
                      <td>{String(l.operation)}</td>
                      <td>
                        <b>{String(l.entity_type)}</b>
                        <small> {String(l.entity_id)}</small>
                      </td>
                      <td><OutcomeBadge outcome={l.outcome} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{isOpen ? '▲' : '▼'}</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${id}-detail`}>
                        <td colSpan={6} style={{ background: 'var(--f-surface-2, #f8f8f8)', padding: '0.75rem 1.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 2rem' }}>
                            {l.reason ? <div><span className="f-eyebrow">Reason</span><p>{String(l.reason)}</p></div> : null}
                            {l.entity_version ? <div><span className="f-eyebrow">Entity version</span><p>v{String(l.entity_version)}</p></div> : null}
                            {l.new_value ? (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <span className="f-eyebrow">New value</span>
                                <pre style={{ fontSize: '0.75rem', overflow: 'auto', maxHeight: 120, marginTop: '0.25rem' }}>
                                  {JSON.stringify(l.new_value, null, 2)}
                                </pre>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
