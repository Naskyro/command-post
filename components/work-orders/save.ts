import { forms, type Row } from '@/lib/accounts/model';
import { requestJson } from '@/lib/shared/client';
// Send only editable form fields; the server owns authorship, audit stamps and closure annotations.
export function saveWO(record: Record<string, unknown>) {
  const fields = forms[record.kind as Row['kind']] || [];
  return requestJson<{ records: Row[] }>('/api/accounts', { action: 'save', record: Object.fromEntries(Object.entries(record).filter(([k, v]) => v !== undefined && !(k === 'accountId' && !v) && (['id', 'kind', 'version', 'name', 'accountId'].includes(k) || fields.some(f => f.key === k))).map(([k, v]) => [k, fields.find(f => f.key === k)?.type === 'checkbox' ? v === true || v === 'true' : v])) });
}
