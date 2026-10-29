import { env } from 'cloudflare:workers';
import { financeDb } from '@/db/finance';
import { AppError } from '@/lib/shared/errors';
import type { Viewer } from '@/lib/finance/model';
import type { Row } from './model';
import { fileBytes } from './server';
const config = () => env as unknown as Record<string, string>;
export const configured = () => ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_TOKEN_ENCRYPTION_KEY'].every(k => !!config()[k]);
export function base64(bytes: Uint8Array) { let text = ''; for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.slice(i, i + 8192)); return btoa(text); }
export function unbase64(s: string) { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
const wrap = (s: string) => s.match(/.{1,76}/g)?.join('\r\n') || '';
const utf = (s: string) => base64(new TextEncoder().encode(s));
export async function googleFetch(url: string, init: RequestInit = {}) {
    try {
        const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
        if (!response.ok) {
            console.error(JSON.stringify({ event: 'accounts.google_failure', status: response.status }));
            throw new AppError(response.status === 429 ? 'Google is busy. Try again shortly.' : response.status === 401 ? 'Reconnect your Google account.' : 'Google could not complete the request.', response.status === 429 ? 429 : 503);
        }
        return response;
    }
    catch (e) {
        if (e instanceof AppError)
            throw e;
        throw new AppError('Google could not be reached. Try again shortly.', 503);
    }
}
async function crypt(text: string, decrypt = false) {
    const secret = config().GOOGLE_TOKEN_ENCRYPTION_KEY;
    if (!secret || secret.length < 32)
        throw new AppError('Google Workspace setup is incomplete.', 503);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
    if (decrypt) {
        const bytes = unbase64(text);
        return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
    }
    const iv = crypto.getRandomValues(new Uint8Array(12)), cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))), bytes = new Uint8Array(12 + cipher.length);
    bytes.set(iv);
    bytes.set(cipher, 12);
    return base64(bytes);
}
export async function connection(v: Viewer) { const row = await financeDb().prepare('SELECT email FROM account_google WHERE person_id=?').bind(v.person).first<{
    email: string;
}>(); return { configured: configured(), connected: !!row, email: row?.email || v.email }; }
export async function authorize(v: Viewer) {
    if (!configured())
        throw new AppError('Google Workspace setup is required.', 503);
    const c = config(), state = crypto.randomUUID();
    await financeDb().prepare('DELETE FROM account_oauth WHERE expires_at<?').bind(Date.now()).run();
    await financeDb().prepare('INSERT INTO account_oauth (state,person_id,expires_at) VALUES (?,?,?)').bind(state, v.person, Date.now() + 600000).run();
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: c.GOOGLE_CLIENT_ID, redirect_uri: c.GOOGLE_REDIRECT_URI, response_type: 'code', access_type: 'offline', prompt: 'consent', state, scope: 'openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send' });
}
export async function finish(v: Viewer, code: string, state: string) {
    const db = financeDb(), s = await db.prepare('SELECT person_id,expires_at FROM account_oauth WHERE state=?').bind(state).first<{
        person_id: string;
        expires_at: number;
    }>();
    if (!s || s.person_id !== v.person || s.expires_at < Date.now())
        throw new AppError('The Google sign-in expired. Connect again.');
    const consumed = await db.prepare('DELETE FROM account_oauth WHERE state=?').bind(state).run();
    if (consumed.meta.changes !== 1)
        throw new AppError('The Google sign-in was already used.');
    const c = config(), token = await (await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: c.GOOGLE_CLIENT_ID, client_secret: c.GOOGLE_CLIENT_SECRET, redirect_uri: c.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }) })).json() as {
        access_token: string;
        refresh_token?: string;
    };
    const profile = await (await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: 'Bearer ' + token.access_token } })).json() as {
        emailAddress: string;
    };
    if (profile.emailAddress.toLowerCase() !== v.email.toLowerCase())
        throw new AppError('Connect the Google account matching your Command Post email.');
    if (!token.refresh_token)
        throw new AppError('Google did not grant continuing access. Reconnect and grant the requested access.');
    await db.prepare('INSERT INTO account_google (person_id,email,encrypted_token,updated_at) VALUES (?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET email=excluded.email,encrypted_token=excluded.encrypted_token,updated_at=excluded.updated_at').bind(v.person, profile.emailAddress, await crypt(token.refresh_token), new Date().toISOString()).run();
}
export async function mailbox(v: Viewer) {
    if (!configured())
        throw new AppError('Google Workspace setup is required.', 503);
    const row = await financeDb().prepare('SELECT encrypted_token FROM account_google WHERE person_id=?').bind(v.person).first<{
        encrypted_token: string;
    }>();
    if (!row)
        throw new AppError('Connect your Google account.');
    const c = config(), token = await (await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.GOOGLE_CLIENT_ID, client_secret: c.GOOGLE_CLIENT_SECRET, refresh_token: await crypt(row.encrypted_token, true), grant_type: 'refresh_token' }) })).json() as {
        access_token: string;
    };
    return token.access_token;
}
export type Part = {
    mimeType?: string;
    filename?: string;
    headers?: {
        name: string;
        value: string;
    }[];
    body?: {
        data?: string;
        attachmentId?: string;
        size?: number;
    };
    parts?: Part[];
};
export type Message = {
    id: string;
    threadId: string;
    internalDate?: string;
    snippet?: string;
    payload: Part;
};
export function header(m: Message, key: string) { return m.payload.headers?.find(h => h.name.toLowerCase() === key.toLowerCase())?.value || ''; }
export function messageText(p: Part): string { if (p.mimeType === 'text/plain' && p.body?.data)
    return new TextDecoder().decode(unbase64(p.body.data)); const text = (p.parts || []).map(messageText).filter(Boolean).join('\n'); if (text)
    return text; if (p.mimeType === 'text/html' && p.body?.data)
    return new TextDecoder().decode(unbase64(p.body.data)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '); return ''; }
export async function thread(token: string, id: string) { if (!/^[A-Za-z0-9_-]{1,100}$/.test(id))
    throw new AppError('Choose a valid Google conversation.'); return await (await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/threads/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + token } })).json() as {
    messages: Message[];
}; }
export async function mime(v: Viewer, r: Row, files: Row[]) {
    for (const value of [r.to, r.cc, r.subject, r.inReplyTo])
        if (/[\r\n]/.test(String(value || '')))
            throw new AppError('Email headers cannot contain line breaks.');
    const recipients = (value: unknown) => String(value || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!r.to || [...recipients(r.to), ...recipients(r.cc)].some(v => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))
        throw new AppError('Use comma-separated email addresses.');
    if (!r.subject || !r.body)
        throw new AppError('Complete the subject and message.');
    if (files.some(f => f.category === 'Internal policy'))
        throw new AppError('Internal release policies cannot be sent to properties.');
    if (files.reduce((sum, f) => sum + Number(f.size || 0), 0) > 18 * 1024 * 1024)
        throw new AppError('Keep email attachments below 18 MB.');
    const boundary = 'cp-' + crypto.randomUUID(), lines = ['From: ' + v.email, 'To: ' + r.to, ...(r.cc ? ['Cc: ' + r.cc] : []), 'Subject: =?UTF-8?B?' + utf(String(r.subject)) + '?=', 'Message-ID: <' + r.id.replace(/[^A-Za-z0-9]/g, '') + '@command-post.local>', ...(r.inReplyTo ? ['In-Reply-To: ' + r.inReplyTo, 'References: ' + r.inReplyTo] : []), 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="' + boundary + '"', '', '--' + boundary, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(utf(String(r.body)))];
    for (const file of files) {
        const bytes = await fileBytes(file);
        lines.push('--' + boundary, 'Content-Type: ' + bytes.mime, 'Content-Disposition: attachment; filename="' + file.name.replace(/[^A-Za-z0-9._ -]/g, '_') + '"', 'Content-Transfer-Encoding: base64', '', wrap(base64(bytes.body)));
    }
    lines.push('--' + boundary + '--');
    return utf(lines.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
