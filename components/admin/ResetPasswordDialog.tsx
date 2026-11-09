'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { requestJson } from '@/lib/shared/client';
import { AdminStamp } from '@/components/finance/AdminAuditFields';
import { AdminModal } from './AccessTemplateStudio';

type CheckResult = { eligible: boolean; configured: boolean };
type ResetLink = { resetUrl: string; username: string; expiresAt: string };
const endpoint = '/api/admin/password-resets';

export default function ResetPasswordDialog({ person, name, onClose }: { person: string; name: string; onClose: () => void }) {
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<ResetLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [checkError, setCheckError] = useState('');
  const pending = useRef(false);
  const linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    setCheck(null);
    setCheckError('');
    void requestJson<CheckResult>(endpoint + '?person=' + encodeURIComponent(person))
      .then(result => { if (live) setCheck(result); })
      .catch(err => { if (live) setCheckError(err.message || 'Could not check password reset access.'); });
    return () => { live = false; };
  }, [person, refresh]);
  useEffect(() => {
    if (link) linkInput.current?.focus();
  }, [link]);

  async function issue(event: FormEvent) {
    event.preventDefault();
    if (!check?.eligible || !check.configured || pending.current || link || reason.trim().length < 4) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await requestJson<ResetLink>(endpoint, { person, reason: reason.trim() });
      if (!result.resetUrl || !result.username || !Number.isFinite(Date.parse(result.expiresAt)) || new URL(result.resetUrl).protocol !== 'https:') {
        throw new Error('The sign-in service did not return a usable reset link. No link can be copied from this screen.');
      }
      setLink(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not issue a reset link.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function copy() {
    if (!link) return;
    setError('');
    try { await navigator.clipboard.writeText(link.resetUrl); setCopied(true); }
    catch { linkInput.current?.focus(); linkInput.current?.select(); setError('Clipboard access is unavailable. The link is selected; copy it directly.'); }
  }

  return <AdminModal title="Reset Password" eyebrow="Command Account Access" onClose={() => { if (!pending.current) onClose(); }}
    footer={<><button className="adminx-button" type="button" onClick={onClose} disabled={busy}>{link ? 'Done' : 'Close'}</button>
      {check?.eligible && check.configured && !link && <button type="submit" form="issue-command-reset" className="adminx-button primary" disabled={busy || reason.trim().length < 4}>{busy ? 'Creating Link…' : 'Create Reset Link'}</button>}</>}>
    <div className="adminx-lifecycle-title"><span className="adminx-stat-icon lilac"><KeyRound size={22} aria-hidden="true" /></span><div><h3>{name}</h3><p>{link ? 'One-time password reset link' : 'Command password recovery'}</p></div></div>
    {!check && (checkError ? <p role="alert" className="adminx-error">{checkError} <button className="adminx-button" type="button" onClick={() => setRefresh(n => n + 1)}>Try Again</button></p> : <p role="status" className="adminx-note">Checking recovery access…</p>)}
    {check && !check.eligible && <p className="adminx-note" role="status">A password reset is not available for this account under your access.</p>}
    {check?.eligible && !check.configured && <div className="adminx-notice"><KeyRound size={17} aria-hidden="true" /><p>Password resets are not connected to the company sign-in service yet. No password was changed and no link was issued.</p></div>}
    {check?.eligible && check.configured && !link && <form id="issue-command-reset" onSubmit={issue}>
      <p className="adminx-note">Verify the employee’s identity, then create a one-time link. Give it directly to {name}; they choose their own password. No company email or current password is needed.</p>
      <label className="adminx-reason">Reason for Reset<textarea rows={2} required minLength={4} maxLength={240} placeholder="For example, employee requested a reset" value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
      <small className="adminx-reset-hint">This request is recorded in Activity &amp; Change History.</small>
    </form>}
    {link && <><p role="status" className="adminx-note"><strong>Link created.</strong> Copy it before closing; it is only shown here once. It has not been emailed.</p>
      <dl className="adminx-reset-meta"><div><dt>Username</dt><dd>{link.username}</dd></div><div><dt>Expires</dt><dd><AdminStamp value={link.expiresAt} /></dd></div></dl>
      <label className="adminx-reason">One-Time Reset Link<input ref={linkInput} type="text" autoComplete="off" spellCheck={false} readOnly value={link.resetUrl} onFocus={event => event.target.select()} /></label>
      <button type="button" className="adminx-button" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Link Copied' : 'Copy Reset Link'}</button></>}
    {error && <p className="adminx-error" role="alert">{error}</p>}
  </AdminModal>;
}
