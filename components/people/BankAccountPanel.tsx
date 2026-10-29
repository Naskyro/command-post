'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { X, Banknote, ShieldCheck, Trash2, AlertCircle } from 'lucide-react';
import { requestJson, timedFetch } from '@/lib/shared/client';
import type { FinRecord } from '@/lib/finance/model';
import '@/components/finance/finance.css';
import './bank-account.css';

type BankInfo = {
  last_4?: string;
  bank_name?: string;
  account_type?: string;
  verified?: boolean;
  added_at?: string;
  status?: string;
};

type Onboarding = { url: string; submitted: boolean };

type Props = { person: FinRecord; onClose: () => void; onSaved?: () => void };

export default function BankAccountPanel({ person, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<BankInfo | null | undefined>(undefined);
  const [onboarding, setOnboarding] = useState<Onboarding | null | undefined>(undefined);
  const [form, setForm] = useState({ account_holder_name: String(person.name || ''), account_number: '', routing_number: '', account_type: 'checking' });

  async function load() {
    try {
      const res = await requestJson<{ bank_account?: BankInfo; onboarding?: Onboarding; message?: string }>(`/api/employees/${person.id}/bank-account`);
      setInfo(res.bank_account || null);
      setOnboarding(res.onboarding || null);
      if (res.message) setError(res.message);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await requestJson<{ onboarding_url?: string; bank_info?: BankInfo }>(`/api/employees/${person.id}/bank-account`, form);
      setOnboarding(res.onboarding_url ? { url: res.onboarding_url, submitted: false } : null);
      setInfo(res.bank_info?.status === 'ready' ? res.bank_info as unknown as BankInfo : null);
      onSaved?.();
      setForm(f => ({ ...f, account_number: '', routing_number: '' }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('Remove this bank account from Command Post?')) return;
    setBusy(true); setError('');
    try {
      const res = await timedFetch(`/api/employees/${person.id}/bank-account`, { method: 'DELETE' });
      const value = await res.json() as { error?: string; deleted?: boolean };
      if (!res.ok) throw new Error(value.error || 'Delete failed');
      setInfo(null);
      setOnboarding(null);
      onSaved?.();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const loading = info === undefined && onboarding === undefined;
  const needsOnboarding = !info && onboarding?.url;

  return <div className="f-overlay" onClick={onClose}>
    <section className="f-payment-dialog" role="dialog" aria-modal="true" aria-label={`Bank and payments for ${person.name}`} onClick={e => e.stopPropagation()}>
      <header className="f-dialog-heading">
        <h2><Banknote size={18} /> Bank and payments</h2>
        <button className="f-icon" aria-label="Close" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="f-dialog-body">
        {loading && <p>Loading…</p>}

        {needsOnboarding && <div className="f-form">
          <div className="f-bank-info pending">
            <AlertCircle size={18} />
            <div>
              <b>Stripe Connect setup required</b>
              <span>We created a secure connected account for you. Finish Stripe's hosted onboarding to add your bank and identity details.</span>
            </div>
          </div>
          {error && <p className="f-error" role="alert">{error}</p>}
          <a className="f-button primary" href={onboarding!.url} target="_blank" rel="noopener" onClick={() => setTimeout(() => void load(), 5000)}>Finish Stripe setup</a>
          <button className="f-button" onClick={() => void load()}>Refresh status</button>
          <footer className="f-dialog-footer">
            <button type="button" className="f-button" onClick={onClose}>Close</button>
            <button className="f-button danger" disabled={busy} onClick={remove}><Trash2 size={15} />{busy ? 'Removing…' : 'Remove account'}</button>
          </footer>
        </div>}

        {!loading && !needsOnboarding && !info && <form onSubmit={save} className="f-form">
          <p className="f-muted">Enter your bank details. We store only a Stripe Connect account ID — never the full account number.</p>
          <label><span>Account holder name</span><input value={form.account_holder_name} onChange={e => setForm(f => ({ ...f, account_holder_name: e.target.value }))} required /></label>
          <label><span>Account number</span><input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} required inputMode="numeric" /></label>
          <label><span>Routing number</span><input value={form.routing_number} onChange={e => setForm(f => ({ ...f, routing_number: e.target.value }))} required inputMode="numeric" /></label>
          <label><span>Account type</span>
            <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
          </label>
          {error && <p className="f-error" role="alert">{error}</p>}
          <footer className="f-dialog-footer">
            <button type="button" className="f-button" onClick={onClose}>Close</button>
            <button className="f-button primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Set up bank payments'}</button>
          </footer>
        </form>}

        {info && <div className="f-form">
          <div className={`f-bank-info${info.verified ? ' verified' : ''}`}>
            {info.verified && <ShieldCheck size={18} />}
            <div>
              <b>{info.bank_name || 'Bank account'}</b> ·•••{info.last_4}
              <span>{info.verified ? `Ready for direct deposit · added ${info.added_at ? new Date(info.added_at).toLocaleDateString() : '—'}` : 'Saved — payouts will be sent once processing is complete'}</span>
            </div>
          </div>
          {error && <p className="f-error" role="alert">{error}</p>}
          <footer className="f-dialog-footer">
            <button className="f-button" onClick={onClose}>Close</button>
            <button className="f-button danger" disabled={busy} onClick={remove}><Trash2 size={15} />{busy ? 'Removing…' : 'Remove account'}</button>
          </footer>
        </div>}
      </div>
    </section>
  </div>;
}
