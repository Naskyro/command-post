import type { Row } from './model';
import { contactName } from './work';

// Repair only a single valid email surrounded by recognizable phone numbers.
// Keep the original value, never label an unknown phone as personal or move it to a new employer.
export function normalizeContact(row: Row): Row {
  const result: Row = {...row, name: contactName(row.name)};
  for (const key of ['email','alternateEmail']) {
    const raw = String(row[key] || '');
    const emails = raw.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi) || [];
    if (emails.length !== 1 || raw === emails[0]) continue;
    const rest = raw.replace(emails[0], ''), phones = rest.match(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?:\s*\([^)]*\))?/g) || [];
    let residue = rest; for (const phone of phones) residue = residue.replace(phone, '');
    if (!phones.length || residue.replace(/[\s/;,|]/g, '')) continue;
    result[key] = emails[0];
    result[key+'Original'] = row[key+'Original'] || raw;
    // Preserve labels and all extracted numbers for review if ownership is not known.
    if (!result.phone) result.phone = phones.join('\n');
  }
  return result;
}
export function profilePhoto(all: Row[], entity: Row) {
  const file = all.filter(f=>f.kind==='file' && f.status==='Current' && (entity.kind==='contact' ? f.category==='Contact photo' && f.contactId===entity.id : f.category==='Account photo' && f.accountId===entity.id)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')) || b.id.localeCompare(a.id))[0];
  return file ? '/api/accounts/files?id='+encodeURIComponent(file.id)+'&preview=1' : String(entity.kind==='account' ? entity.photo||'' : '');
}
export function contactAge(row: Row, day: string) {
  if (row.dateOfBirth) {
    const birth=String(row.dateOfBirth);const age=Number(day.slice(0,4))-Number(birth.slice(0,4))-(day.slice(5)<birth.slice(5)?1:0);
    return age>=0 ? String(age) : '';
  }
  return typeof row.approximateAge==='number' ? `About ${row.approximateAge}${row.ageAsOf ? ' (as of '+row.ageAsOf+')':''}` : '';
}
