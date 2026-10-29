import type { Row } from './model';
import type { Viewer, FinRecord } from '@/lib/finance/model';
import { canAccess } from '@/lib/finance/access';
import { access, canEdit, assigned, head } from './policy';
import { AppError } from '@/lib/shared/errors';
export const photoCategories=['Account photo','Contact photo'];
export function mayUpload(v:Viewer,all:Row[],staff:FinRecord[],category:string,accountId:string,contactId='') {
  const account=all.find(r=>r.kind==='account'&&r.id===accountId);
  if(category==='Contact photo') {const contact=all.find(r=>r.kind==='contact'&&r.id===contactId); return !!contact && !accountId && canEdit(v,contact,all,staff);}
  if(!account || contactId) return false;
  if(category==='Account photo') return canEdit(v,account,all,staff);
  if(category==='Claim evidence') return access(v,'claims',true) && (head(v,staff)||assigned(v,account));
  if(['Release request','Release approval'].includes(category)&&canAccess(v,'Accounts','courtesy',true))return true;
  return canEdit(v,account,all,staff)&&access(v,'files',true);
}
export function uploadMime(file:{name:string;type:string},bytes:Uint8Array,category:string) {
  const s=String.fromCharCode(...bytes.slice(0,32)); let mime='';
  if(s.startsWith('%PDF-'))mime='application/pdf';
  else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
  else if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))mime='image/png';
  else if(s.startsWith('RIFF')&&s.slice(8,12)==='WEBP')mime='image/webp';
  else if(s.slice(4,8)==='ftyp' && /^video\//.test(file.type))mime=file.type;
  else if([0x1a,0x45,0xdf,0xa3].every((v,i)=>bytes[i]===v) && /^video\//.test(file.type))mime=file.type;
  else if(category==='Claim evidence'&&/\.eml$/i.test(file.name)) {
    const headers=new TextDecoder().decode(bytes.slice(0,64000)).split(/\r?\n\r?\n/)[0];
    if(/^(From|To|Subject|Date|MIME-Version):[^\r\n]+/im.test(headers)&&!headers.includes('\0'))mime='message/rfc822';
  } else if(category==='Claim evidence'&&/\.msg$/i.test(file.name)&&[208,207,17,224,161,177,26,225].every((v,i)=>bytes[i]===v))mime='application/vnd.ms-outlook';
  const ok=mime && (mime.startsWith('image/') || mime==='application/pdf' || (category==='Signage' && mime.startsWith('video/')));
  if(!ok) throw new AppError(category==='Claim evidence'?'Choose a valid photo, PDF, EML or MSG file.':category==='Signage'?'Choose a valid JPEG, PNG, WebP, PDF or video (MP4, MOV, WebM).':'Choose a valid JPEG, PNG, WebP or PDF; photos require an image.');
  return mime;
}
