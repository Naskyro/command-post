'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, LogOut } from 'lucide-react';
import {requestJson, timedFetch, delegatedUrl} from '@/lib/shared/client';
import './delegated-access.css';

export type DelegatedView =
  | { state: 'active'; subjectId: string; subjectName: string; actorName: string; expiresAt: string }
  | { state: 'ended'; reason: string };

const sessionEvent = 'command-delegated-view-changed';
export const returnToAdminUrl = '/?module=Admin&tab=delegated-access';

// Cross-tab messages invalidate cached UI only. They never establish a session
// or carry names, identifiers, tokens, or reasons.
export function reloadAfterDelegation(destination: 'home' | 'admin') {
  try {
    localStorage.setItem(sessionEvent, JSON.stringify({ id: crypto.randomUUID(), destination }));
  } catch { /* The server cookie remains authoritative when storage is disabled. */ }
  window.location.replace(destination === 'admin' ? returnToAdminUrl : '/');
}

export function DelegatedAccessTabSync() {
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== sessionEvent || !event.newValue) return;
      let destination = '/';
      try {
        if (JSON.parse(event.newValue).destination === 'admin') destination = returnToAdminUrl;
      } catch { return; }
      window.location.replace(delegatedUrl(destination));
    };
    // A back/forward-cached page can contain the previous account's UI.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.replace(delegatedUrl(window.location.href));
    };
    window.addEventListener('storage', sync);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('pageshow', restore);
    };
  }, []);
  return null;
}

export function DelegatedAccessBanner({ delegation }: { delegation: DelegatedView }) {
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const banner = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = banner.current, stage = element?.closest<HTMLElement>('.stage');
    if (!element || !stage) return;
    const update = () => stage.style.setProperty('--cp-delegated-bar', element.offsetHeight + 'px');
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => { observer?.disconnect(); stage.style.removeProperty('--cp-delegated-bar'); };
  }, []);
  const active = delegation.state === 'active';
  const expiresAt = active ? delegation.expiresAt : '';
  useEffect(() => {
    if (!expiresAt) return;
    const expires = Date.parse(expiresAt);
    if (!Number.isFinite(expires)) return;
    // Re-fetch the server session at expiry, including after a laptop wakes.
    // Never re-enable an admin workflow inside a still-mounted employee view.
    let live = true, checking = false;
    let timer: number;
    const check = async () => {
      if (Date.now() < expires || checking || !live) return;
      checking = true;
      try {
        const response = await timedFetch('/api/session', { headers: { 'x-command-read-only':'1' } }, 5000);
        const body = await response.json() as { delegation?: DelegatedView };
        if (!live) return;
        if (!response.ok || body.delegation?.state !== 'active' || body.delegation.expiresAt !== expiresAt) {
          window.location.replace(delegatedUrl('/'));
          return;
        }
        // The workstation clock may be ahead. Trust server expiry, never loop reloads.
        window.clearTimeout(timer);
        timer = window.setTimeout(check, 15000);
      } catch { if (live) window.location.replace(delegatedUrl('/')); }
      finally { checking = false; }
    };
    const onVisible = () => { if (!document.hidden) void check(); };
    timer = window.setTimeout(check, Math.max(0, expires - Date.now() + 150));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [expiresAt]);

  async function returnToAdmin() {
    if (pending.current) return;
    pending.current = true;
    setReturning(true);
    setError('');
    try {
      await requestJson('/api/delegated-access', { action: 'end' });
      reloadAfterDelegation('admin');
    } catch (e) {
      pending.current = false;
      setReturning(false);
      setError(e instanceof Error ? e.message : 'Could not return to your account. Try again.');
    }
  }

  return (
    <aside ref={banner} className={'command-delegated-banner' + (!active ? ' ended' : '')} aria-label="Delegated Access">
      <span className="command-delegated-identity">
        <Eye size={18} aria-hidden="true" />
        <span>{active ? <>Viewing as <strong>{delegation.subjectName}</strong> <span aria-hidden="true">·</span> <strong>Read-Only</strong><small>Employee screens and permitted details · Changes are disabled</small></> : <><strong>Delegated View Ended</strong>{delegation.reason && <small>{delegation.reason}</small>}</>}</span>
      </span>
      <button type="button" onClick={returnToAdmin} disabled={returning}><LogOut size={16} aria-hidden="true" />{returning ? 'Returning…' : 'Return to My Account'}</button>
      {error && <span role="alert" className="command-delegated-error">{error}</span>}
    </aside>
  );
}
