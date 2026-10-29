import { env } from 'cloudflare:workers';
import { AppError } from './shared/errors';

const BASE = 'https://api.stripe.com/v1';

export function getKey(): string | undefined {
  const key = (env as unknown as Record<string, unknown>).STRIPE_SECRET_KEY as string | undefined;
  return key && key !== 'sk_test_replace_me' ? key : undefined;
}

export function isConfigured(): boolean {
  return Boolean(getKey());
}

function auth() {
  const key = getKey();
  if (!key) throw new AppError('Stripe is not configured. Add STRIPE_SECRET_KEY to .dev.vars or Cloudflare bindings.', 400);
  return { Authorization: `Bearer ${key}` };
}

function flatten(prefix: string, obj: unknown, out: Record<string, string>) {
  if (obj === undefined || obj === null) return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) flatten(`${prefix}[${i}]`, obj[i], out);
  } else if (typeof obj === 'object' && !(obj instanceof Date)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(`${prefix}[${k}]`, v, out);
  } else {
    out[prefix] = String(obj);
  }
}

function formBody(body: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) flatten(k, v, out);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(out)) params.set(k, v);
  return params.toString();
}

async function request(method: string, path: string, body?: Record<string, unknown>, idempotencyKey?: string) {
  const headers: Record<string, string> = { ...auth(), 'Content-Type': 'application/x-www-form-urlencoded' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(BASE + path, { method, headers, ...(body ? { body: formBody(body) } : {}) });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new AppError(String((data.error as Record<string, unknown>)?.message || data.error || `Stripe ${method} failed`), 400);
  return data;
}

export const stripe = {
  createCustomer: (body: Record<string, unknown>) => request('POST', '/customers', body),
  retrieveCustomer: (id: string) => request('GET', `/customers/${id}`),
  createSource: (customerId: string, source: Record<string, unknown>) => request('POST', `/customers/${customerId}/sources`, { source }),
  verifySource: (customerId: string, sourceId: string, amounts: number[]) => request('POST', `/customers/${customerId}/sources/${sourceId}/verify`, { amounts }),
  deleteSource: (customerId: string, sourceId: string) => request('DELETE', `/customers/${customerId}/sources/${sourceId}`),
  createPayout: (body: Record<string, unknown>, idempotencyKey?: string) => request('POST', '/payouts', body, idempotencyKey),
  retrievePayout: (id: string) => request('GET', `/payouts/${id}`),
  createAccount: (body: Record<string, unknown>) => request('POST', '/accounts', body),
  retrieveAccount: (id: string) => request('GET', `/accounts/${id}`),
  createAccountLink: (body: Record<string, unknown>) => request('POST', '/account_links', body),
  createTransfer: (body: Record<string, unknown>, idempotencyKey?: string) => request('POST', '/transfers', body, idempotencyKey),
};
