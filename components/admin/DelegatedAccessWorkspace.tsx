'use client';
import ResponsiveSearchInput from '@/components/shared/ResponsiveSearchInput';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Eye, RefreshCw, Search, UserRound } from 'lucide-react';
import { delegationMinutes } from '@/lib/admin/delegated-policy';
import { requestJson } from '@/lib/shared/client';
import { reloadAfterDelegation } from './DelegatedAccessBanner';
import './delegated-access.css';

type Target = {
  person: string;
  name: string;
  department?: string;
  role?: string;
  title?: string;
  status?: string;
};

type Directory = { targets: Target[] };

export default function DelegatedAccessWorkspace() {
  const [directory, setDirectory] = useState<Target[]>([]);
  const [query, setQuery] = useState('');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [startError, setStartError] = useState('');
  const pending = useRef(false);
  const serial = useRef(0);

  const load = useCallback(async () => {
    const run = ++serial.current;
    setLoading(true);
    setLoadError('');
    try {
      const { targets } = await requestJson<Directory>('/api/delegated-access');
      if (serial.current !== run) return;
      const eligible = targets.slice().sort((a, b) => a.name.localeCompare(b.name));
      setDirectory(eligible);
      setTargetId(id => eligible.some(target => target.person === id) ? id : '');
    } catch (err) {
      if (serial.current !== run) return;
      setDirectory([]);
      setTargetId('');
      setLoadError(err instanceof Error ? err.message : 'Could not load employees. Try again.');
    } finally {
      if (serial.current === run) setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); return () => { ++serial.current; }; }, [load]);

  const selected = directory.find(target => target.person === targetId);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return directory.filter(target => [target.name, target.department, target.title, target.role].filter(Boolean).join(' ').toLocaleLowerCase().includes(term));
  }, [directory, query]);
  const valid = Boolean(selected && reason.trim().length >= 4 && reason.trim().length <= 240);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!valid || !selected || pending.current || loading) return;
    pending.current = true;
    setStarting(true);
    setStartError('');
    try {
      await requestJson('/api/delegated-access', { action: 'start', person: selected.person, reason: reason.trim() });
      reloadAfterDelegation('home');
    } catch (err) {
      pending.current = false;
      setStarting(false);
      setStartError(err instanceof Error ? err.message : 'Could not start the delegated view. Try again.');
    }
  }

  return (
    <section className="da-workspace" aria-labelledby="da-heading">
      <header className="adminx-page-heading">
        <div><span className="adminx-eyebrow">ADMINISTRATION</span><h1 id="da-heading">Delegated Access</h1></div>
        <button type="button" className="adminx-icon" title="Refresh Employee List" aria-label="Refresh Employee List" onClick={load} disabled={loading || starting}><RefreshCw size={18} aria-hidden="true" /></button>
      </header>
      <p className="da-intro">Choose an employee to see how Command looks with their assigned access.</p>
      <div className="da-layout">
        <section className="da-panel da-picker" aria-labelledby="da-choose">
          <div className="da-panel-heading"><span className="da-section-icon"><UserRound size={19} aria-hidden="true" /></span><h2 id="da-choose">Choose an Employee</h2></div>
          <label className="da-search"><Search size={17} aria-hidden="true" /><ResponsiveSearchInput type="search" aria-label="Search Employees" placeholder="Search by name, department, or role" value={query} onChange={e => setQuery(e.target.value)} disabled={starting} /></label>
          {loading ? <p className="da-empty" role="status">Loading eligible employees…</p>
            : loadError ? <div className="da-empty" role="alert"><p>{loadError}</p><button type="button" className="adminx-button" onClick={load}>Try Again</button></div>
            : !directory.length ? <p className="da-empty">There are no eligible employee accounts in your scope.</p>
            : !visible.length ? <div className="da-empty"><p>No employees match “{query}”.</p><button className="adminx-button" type="button" onClick={() => setQuery('')}>Clear Search</button></div>
            : <fieldset className="da-results" disabled={starting}><legend className="da-visually-hidden">Employee to View</legend>{visible.map(target => {
              const checked = target.person === targetId;
              const initials = target.name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).filter((_, i, arr) => i === 0 || i === arr.length - 1).join('');
              const detail = [target.title || target.role, target.department].filter(Boolean).join(' · ');
              return <label key={target.person} className={'da-row' + (checked ? ' is-selected' : '')}>
                <input type="radio" name="delegatedEmployee" value={target.person} checked={checked} onChange={() => { setTargetId(target.person); setStartError(''); }} />
                <span className="da-avatar" aria-hidden="true">{initials}</span><span className="da-person"><b>{target.name}</b>{detail && <small>{detail}</small>}</span>
                {target.status === 'Onboarding' && <span className="da-badge">Onboarding</span>}
                <span className="da-radio-indicator" aria-hidden="true">{checked && <Check size={13} />}</span>
              </label>;
            })}</fieldset>}
        </section>
        <form className="da-panel da-session" onSubmit={start} aria-labelledby="da-session-title">
          <div className="da-panel-heading"><span className="da-section-icon"><Eye size={19} aria-hidden="true" /></span><h2 id="da-session-title">Session Details</h2></div>
          <dl className="da-facts"><div><dt>Viewing Account</dt><dd aria-live="polite">{selected?.name || 'No employee selected'}</dd></div><div><dt>Session Limit</dt><dd>{delegationMinutes} minutes · Read-only</dd></div></dl>
          <p className="da-guidance">Open the employee’s actual screens, search records, and inspect details allowed by their account. Saving, sending, uploading, and approvals are disabled. Use <strong>Return to My Account</strong> at any time.</p>
          <label className="da-reason" htmlFor="da-reason">Reason for Access</label>
          <textarea id="da-reason" rows={2} maxLength={240} required minLength={4} value={reason} onChange={e => { setReason(e.target.value); setStartError(''); }} aria-describedby="da-reason-hint" placeholder="For example, check a missing menu option" disabled={starting} />
          <p id="da-reason-hint" className="da-hint">Your name, the employee, and this reason are recorded in the activity log.</p>
          {startError && <p className="adminx-error" role="alert">{startError}</p>}
          <button className="adminx-button primary da-start" type="submit" disabled={!valid || loading || starting}>{starting ? 'Opening Employee View…' : 'Open Employee View'}<ArrowRight size={16} aria-hidden="true" /></button>
        </form>
      </div>
    </section>
  );
}
