import {contactPhotoVersions} from '@/lib/relationships/portrait-storage';
import {NextResponse} from 'next/server';
import {readPractice} from '@/lib/sales/practice';
import {context} from '@/lib/accounts/server';
import {salesProjection,saveSales} from '@/lib/sales/server';
import {ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){try{const ctx=await context(req);const own=await readPractice(ctx.viewer.person,ctx.all),data=salesProjection(ctx,own.dismissed,own.rows);
const ids=[...new Set(data.records.filter(r=>(r.kind==='salesRelationship'||r.kind==='opportunity')&&r.contactId&&!r.example).map(r=>String(r.contactId)))];
const photos=await contactPhotoVersions(ids,ctx.all);
return json({...data,contacts:data.contacts.map(c=>Object.hasOwn(photos,c.id)?{...c,relationshipPhotoVersion:photos[c.id]}:c)});}catch(e){const f=safeFailure(e,'sales.read');return json(f.body,f.status);}}
export async function POST(req:Request){try{const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new ForbiddenError('Cross-origin request rejected.');return json({records:await saveSales(await readPayload(req),await context(req))});}catch(e){const f=safeFailure(e,'sales.write');return json(f.body,f.status);}}
