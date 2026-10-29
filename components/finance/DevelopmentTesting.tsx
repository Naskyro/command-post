'use client';
import { useState, useEffect } from 'react';
import { Banknote, AlertTriangle, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { requestJson } from '@/lib/shared/client';
import type { FinRecord, Viewer } from '@/lib/finance/model';
import './finance.css';
import './development-testing.css';

type Props = { viewer: Viewer; records: FinRecord[]; onNotify: (msg: string) => void };

type BankInfo = { last_4?: string; bank_name?: string; account_type?: string; verified?: boolean; status?: string };

type Onboarding = { url: string; submitted: boolean };

export default function DevelopmentTesting({ viewer, records, onNotify }: Props) {
  const person = records.find(r => r.kind === 'person' && r.id === viewer.person);
  const [amount, setAmount] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; transfer_id?: string; status?: string } | null>(null);
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);

  async function loadBank() {
    try {
      const res = await requestJson<{ bank_account?: BankInfo; onboarding?: Onboarding }>(`/api/employees/${viewer.person}/bank-account`);
      setBank(res.bank_account || null);
      setOnboarding(res.onboarding || null);
    } catch { setBank(null); setOnboarding(null); }
  }

  useEffect(() => { void loadBank(); }, []);

  async function pay() {
    setBusy(true); setResult(null);
    try {
      const res = await requestJson<{ transfer_id: string; status: string; message: string }>('/api/finance/development-payout', { amount_cents: amount, confirm: true });
      setResult({ ok: true, ...res });
      onNotify(res.message);
    } catch (e) {
      const msg = (e as Error).message;
      setResult({ ok: false, message: msg });
    } finally { setBusy(false); setConfirming(false); }
  }

  const canPay = Boolean(bank?.last_4 && bank?.status === 'ready');

  return <section className="f-card dev-card">
    <header className="f-card-heading"><h2><Banknote size={18} /> Development payout test</h2></header>
    <div className="dev-body">
      <div className="dev-warning"><AlertTriangle size={18} /> This is a <b>LIVE</b> transfer. Real money will move.</div>

      {onboarding && <div className="dev-bank">
        <b>Stripe Connect onboarding required</b>
        <span>Finish the hosted onboarding to add your bank and identity before testing.</span>
        <a className="f-button primary" href={onboarding.url} target="_blank" rel="noopener"><ExternalLink size={15} /> Finish Stripe setup</a>
      </div>}

      {!onboarding && <div className="dev-bank">
        <b>Account on file</b>
        {bank ? <span>{bank.bank_name || 'Bank account'} · •••{bank.last_4} · {bank.status === 'ready' ? 'Ready' : 'Not ready'}</span> : <span>Not set</span>}
      </div>}

      <label className="dev-amount"><span>Amount (cents, 1–99)</span><input type="number" min={1} max={99} value={amount} onChange={e => setAmount(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} disabled={busy} /></label>
      <button className="f-button primary" disabled={busy || !canPay} onClick={() => setConfirming(true)}>{busy ? 'Sending…' : 'Send test transfer'}</button>
      {confirming && <div className="dev-confirm"><p>Send {amount} cents to your connected account? This is a real transaction.</p><div className="dev-confirm-actions"><button className="f-button" onClick={() => setConfirming(false)}>Cancel</button><button className="f-button danger" onClick={() => void pay()} disabled={busy}>Yes, send real money</button></div></div>}
      {result && <div className={`dev-result ${result.ok ? 'ok' : 'bad'}`}>{result.ok ? <CheckCircle size={18} /> : <XCircle size={18} />} <p>{result.message}{result.ok && result.transfer_id ? <><br /><small>ID: {result.transfer_id} · Status: {result.status}</small></> : null}</p></div>}
    </div>
  </section>;
}
