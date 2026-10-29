'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Wallet, ArrowDownLeft, ArrowUpRight, Plus, RefreshCw,
  DollarSign, BookOpen, Loader, CheckCircle, X, FileText,
} from 'lucide-react';
import { requestJson } from '@/lib/shared/client';
import { money } from '@/lib/finance/model';
import './finance.css';
import './timeclock.css';

type Account = Record<string, unknown>;
type PayrollRun = Record<string, unknown>;
type GlEntry = Record<string, unknown>;

function fmtDate(s: unknown) {
  if (!s) return '—';
  try { return new Date(String(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return String(s); }
}

function AccountTypeBadge({ type }: { type: unknown }) {
  const t = String(type || '');
  const cls = /Asset/.test(t) ? 'green' : /Liability/.test(t) ? 'red' : /Revenue/.test(t) ? '' : 'amber';
  return <span className={`f-badge ${cls}`}>{t}</span>;
}

export default function FinanceNewPanel() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [register, setRegister] = useState<Record<string, unknown> | null>(null);
  const [withdrawals, setWithdrawals] = useState<Record<string, unknown>[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [glEntries, setGlEntries] = useState<GlEntry[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // GL form
  const [glForm, setGlForm] = useState({ debit_account: '1010', credit_account: '2010', amount: 100, description: '' });
  const [glViewAccount, setGlViewAccount] = useState('1010');
  // Cash form
  const [cashForm, setCashForm] = useState({ amount: 50, purpose: '' });
  // Payroll form
  const [payForm, setPayForm] = useState({ employee_id: '', gross_pay: 2500, period_start: '', period_end: '', pay_date: '' });

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [a, r, p, gl, w] = await Promise.all([
        requestJson<{ accounts: Account[] }>('/api/finance/chart-of-accounts').catch(() => ({ accounts: [] })),
        requestJson<Record<string, unknown>>('/api/finance/cash/register-balance').catch(() => ({})),
        requestJson<{ payroll_runs: PayrollRun[] }>('/api/finance/payroll-runs').catch(() => ({ payroll_runs: [] })),
        requestJson<{ entries: GlEntry[] }>(`/api/finance/general-ledger?account=${encodeURIComponent(glViewAccount)}`).catch(() => ({ entries: [] })),
        requestJson<{ withdrawals: Record<string, unknown>[] }>('/api/finance/cash/withdrawals').catch(() => ({ withdrawals: [] })),
      ]);
      setAccounts(a.accounts || []);
      setRegister(r);
      setRuns(p.payroll_runs || []);
      setGlEntries(gl.entries || []);
      setWithdrawals(w.withdrawals || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [glViewAccount]);

  useEffect(() => { load(); }, [load]);

  const notify = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 5000); };

  const postGl = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const txId = crypto.randomUUID();
      await requestJson(`/api/finance/transactions/${txId}/post-to-gl`, {
        debit_account: glForm.debit_account,
        debit_amount: glForm.amount,
        credit_account: glForm.credit_account,
        credit_amount: glForm.amount,
        description: glForm.description || 'Manual GL entry',
      });
      notify('GL entry posted successfully.');
      setGlForm(f => ({ ...f, description: '' }));
      setGlViewAccount(glForm.debit_account);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const withdrawCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashForm.purpose.trim()) { setError('Purpose is required.'); return; }
    try {
      await requestJson('/api/finance/cash/withdrawal', { amount: cashForm.amount, purpose: cashForm.purpose });
      notify(`Withdrawal of ${money(cashForm.amount)} recorded.`);
      setCashForm(f => ({ ...f, purpose: '' }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const runPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payForm.employee_id.trim()) { setError('Employee ID is required.'); return; }
    try {
      await requestJson('/api/finance/payroll-run', {
        employee_id: payForm.employee_id,
        gross_pay: payForm.gross_pay,
        ...(payForm.period_start ? { period_start: payForm.period_start } : {}),
        ...(payForm.period_end   ? { period_end:   payForm.period_end   } : {}),
        ...(payForm.pay_date     ? { pay_date:      payForm.pay_date     } : {}),
      });
      notify(`Payroll run created for ${payForm.employee_id}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0 1.5rem 2rem' }}>

      {error && <p className="f-error">{error}</p>}
      {success && (
        <div className="f-toast-inline" role="status">
          <CheckCircle size={15} /> {success}
          <button className="f-icon" onClick={() => setSuccess('')}><X size={13} /></button>
        </div>
      )}

      {/* Cash register */}
      <section className="f-card">
        <header>
          <h2><Wallet size={17} style={{ verticalAlign: 'middle' }} /> Cash register</h2>
          <button className="f-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </header>
        <div className="f-stats" style={{ borderBottom: '1px solid var(--f-border)' }}>
          <div>
            <DollarSign size={19} />
            <strong>{register ? money(register.balance ?? 0) : '—'}</strong>
            <span>Current balance</span>
          </div>
          <div>
            <ArrowUpRight size={19} />
            <strong>{withdrawals.length}</strong>
            <span>Withdrawals on record</span>
          </div>
        </div>

        <div style={{ padding: '1rem 1.5rem' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--f-muted)' }}>RECORD WITHDRAWAL</h3>
          <form onSubmit={withdrawCash} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="f-label" style={{ flex: '0 0 120px' }}>
              <span>Amount ($)</span>
              <input type="number" min={1} step={0.01} value={cashForm.amount} onChange={e => setCashForm(f => ({ ...f, amount: Number(e.target.value) }))} />
            </label>
            <label className="f-label" style={{ flex: '1 1 240px' }}>
              <span>Purpose / reason</span>
              <input type="text" value={cashForm.purpose} onChange={e => setCashForm(f => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Office supplies, vendor payment" required />
            </label>
            <button type="submit" className="f-button primary" style={{ marginBottom: '0.25rem' }}>
              <ArrowUpRight size={14} /> Withdraw
            </button>
          </form>
        </div>

        {withdrawals.length > 0 && (
          <div className="tc-table-wrap" style={{ maxHeight: '20vh', overflow: 'auto' }}>
            <table className="tc-table">
              <thead><tr><th>Amount</th><th>Purpose</th><th>By</th><th>Date</th></tr></thead>
              <tbody>
                {withdrawals.map((w, i) => (
                  <tr key={String(w.id || i)}>
                    <td><b>{money(w.amount)}</b></td>
                    <td>{String(w.purpose)}</td>
                    <td><small>{String(w.withdrawn_by || '—')}</small></td>
                    <td><small>{fmtDate(w.created_at)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* GL posting */}
      <section className="f-card">
        <header>
          <h2><BookOpen size={17} style={{ verticalAlign: 'middle' }} /> General ledger</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--f-muted)' }}>View account:</label>
            <select value={glViewAccount} onChange={e => setGlViewAccount(e.target.value)} style={{ fontSize: '0.82rem' }} aria-label="View GL account">
              {accounts.length > 0
                ? accounts.map(a => <option key={String(a.id)} value={String(a.account_number)}>{String(a.account_number)} – {String(a.name)}</option>)
                : ['1010', '1100', '2010', '3000', '4000', '5000'].map(n => <option key={n} value={n}>{n}</option>)
              }
            </select>
          </div>
        </header>

        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--f-border)' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--f-muted)' }}>POST JOURNAL ENTRY</h3>
          <form onSubmit={postGl} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="f-label" style={{ flex: '0 0 110px' }}>
              <span>Debit account</span>
              <input type="text" value={glForm.debit_account} onChange={e => setGlForm(f => ({ ...f, debit_account: e.target.value }))} placeholder="1010" />
            </label>
            <label className="f-label" style={{ flex: '0 0 110px' }}>
              <span>Credit account</span>
              <input type="text" value={glForm.credit_account} onChange={e => setGlForm(f => ({ ...f, credit_account: e.target.value }))} placeholder="2010" />
            </label>
            <label className="f-label" style={{ flex: '0 0 110px' }}>
              <span>Amount ($)</span>
              <input type="number" min={0.01} step={0.01} value={glForm.amount} onChange={e => setGlForm(f => ({ ...f, amount: Number(e.target.value) }))} />
            </label>
            <label className="f-label" style={{ flex: '1 1 200px' }}>
              <span>Description</span>
              <input type="text" value={glForm.description} onChange={e => setGlForm(f => ({ ...f, description: e.target.value }))} placeholder="Journal entry memo" />
            </label>
            <button type="submit" className="f-button primary" style={{ marginBottom: '0.25rem' }}>
              <Plus size={14} /> Post
            </button>
          </form>
        </div>

        <div className="tc-table-wrap" style={{ maxHeight: '25vh', overflow: 'auto' }}>
          <table className="tc-table">
            <thead><tr><th>Debit</th><th>Credit</th><th>Amount</th><th>Description</th><th>Posted</th></tr></thead>
            <tbody>
              {glEntries.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--f-muted)' }}>No GL entries yet</td></tr>}
              {glEntries.map((e, i) => (
                <tr key={String(e.id || i)}>
                  <td>{String(e.debit_account)}</td>
                  <td>{String(e.credit_account)}</td>
                  <td><b>{money(e.debit_amount ?? e.amount)}</b></td>
                  <td><small>{String(e.description || '—')}</small></td>
                  <td><small>{fmtDate(e.created_at)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Chart of accounts */}
      <section className="f-card">
        <header><h2><FileText size={17} style={{ verticalAlign: 'middle' }} /> Chart of accounts ({accounts.length})</h2></header>
        <div className="tc-table-wrap" style={{ maxHeight: '30vh', overflow: 'auto' }}>
          <table className="tc-table">
            <thead><tr><th>#</th><th>Account name</th><th>Type</th><th>Sub-type</th></tr></thead>
            <tbody>
              {accounts.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--f-muted)' }}>No accounts in chart of accounts</td></tr>}
              {accounts.map(a => (
                <tr key={String(a.id)}>
                  <td><b>{String(a.account_number)}</b></td>
                  <td>{String(a.name)}</td>
                  <td><AccountTypeBadge type={a.account_type} /></td>
                  <td><small>{String(a.sub_type || '—')}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payroll runs */}
      <section className="f-card">
        <header><h2><ArrowDownLeft size={17} style={{ verticalAlign: 'middle' }} /> Payroll runs ({runs.length})</h2></header>

        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--f-border)' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--f-muted)' }}>CREATE PAYROLL RUN</h3>
          <form onSubmit={runPayroll} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="f-label" style={{ flex: '1 1 200px' }}>
              <span>Employee ID</span>
              <input type="text" value={payForm.employee_id} onChange={e => setPayForm(f => ({ ...f, employee_id: e.target.value }))} placeholder="Employee identifier" required />
            </label>
            <label className="f-label" style={{ flex: '0 0 130px' }}>
              <span>Gross pay ($)</span>
              <input type="number" min={1} step={0.01} value={payForm.gross_pay} onChange={e => setPayForm(f => ({ ...f, gross_pay: Number(e.target.value) }))} />
            </label>
            <label className="f-label" style={{ flex: '0 0 140px' }}>
              <span>Period start</span>
              <input type="date" value={payForm.period_start} onChange={e => setPayForm(f => ({ ...f, period_start: e.target.value }))} />
            </label>
            <label className="f-label" style={{ flex: '0 0 140px' }}>
              <span>Period end</span>
              <input type="date" value={payForm.period_end} onChange={e => setPayForm(f => ({ ...f, period_end: e.target.value }))} />
            </label>
            <label className="f-label" style={{ flex: '0 0 140px' }}>
              <span>Pay date</span>
              <input type="date" value={payForm.pay_date} onChange={e => setPayForm(f => ({ ...f, pay_date: e.target.value }))} />
            </label>
            <button type="submit" className="f-button primary" style={{ marginBottom: '0.25rem' }}>
              <Plus size={14} /> Run payroll
            </button>
          </form>
        </div>

        <div className="tc-table-wrap" style={{ maxHeight: '25vh', overflow: 'auto' }}>
          <table className="tc-table">
            <thead><tr><th>Employee</th><th>Gross</th><th>Federal tax</th><th>Net</th><th>Pay date</th></tr></thead>
            <tbody>
              {runs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--f-muted)' }}>No payroll runs on record</td></tr>}
              {runs.map(r => (
                <tr key={String(r.id)}>
                  <td><b>{String(r.employee_id)}</b></td>
                  <td>{money(r.gross_pay)}</td>
                  <td><small style={{ color: 'var(--f-muted)' }}>{money(r.federal_income_tax)}</small></td>
                  <td><b>{money(r.net_pay)}</b></td>
                  <td><small>{fmtDate(r.pay_date)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
