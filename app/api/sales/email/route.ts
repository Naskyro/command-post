import {NextResponse} from 'next/server';
import {context} from '@/lib/accounts/server';
import {connection,authorize,mailbox,googleFetch,thread,header,messageText} from '@/lib/accounts/google';
import {canAccess} from '@/lib/finance/access';
import {readPayload,safeFailure,ForbiddenError,AppError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(d:unknown,s=200)=>NextResponse.json(d,{status:s,headers:{'Cache-Control':'private, no-store'}});
// A Gmail Date header is RFC 5322, not an ISO instant. Honor its explicit offset.
// If it cannot identify an instant, use Gmail's actual received timestamp without guessing a zone.
function emailTime(sent:string,received?:string){
 const parsed=/(?:[+-]\d{2}:?\d{2}|\bUT|\bGMT|\bUTC)(?:\s*\([^)]*\))?\s*$/i.test(sent)?Date.parse(sent):NaN;
 if(Number.isFinite(parsed))return {date:new Date(parsed).toISOString(),dateLabel:'Sent At'};
 if(received&&/^\d{1,15}$/.test(received)){const d=new Date(Number(received));if(Number.isFinite(d.getTime()))return {date:d.toISOString(),dateLabel:'Received At'};}
 return {date:'',dateLabel:''};
}
export async function GET(req:Request){try{const c=await context(req);if(!canAccess(c.viewer,'Sales CRM','email'))throw new ForbiddenError();const url=new URL(req.url),id=url.searchParams.get('lead');if(id?.startsWith('sales-example:'))throw new AppError('Gmail is not connected to practice leads.');const status=await connection(c.viewer);if(!id||!status.connected||!status.configured)return json({...status,threads:[]});const lead=c.all.find(r=>r.kind==='opportunity'&&r.id===id);if(!lead)throw new AppError('Choose a lead.');const emails=[...new Set([lead.email,...c.all.filter(r=>r.kind==='salesRelationship'&&r.opportunityId===id).map(r=>r.email)].map(x=>String(x||'').toLowerCase()).filter(x=>/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(x)))];if(!emails.length)return json({...status,threads:[],needsEmail:true});const token=await mailbox(c.viewer);const q='{'+emails.map(e=>'from:'+e+' to:'+e).join(' ')+'}';const list=await(await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/threads?'+new URLSearchParams({q,maxResults:'20'}),{headers:{Authorization:'Bearer '+token}})).json() as {threads?:{id:string}[]};const threads=await Promise.all((list.threads||[]).map(async t=>{const full=await thread(token,t.id);return {id:t.id,messages:full.messages.map(m=>({id:m.id,subject:header(m,'subject'),from:header(m,'from'),to:header(m,'to'),...emailTime(header(m,'date'),m.internalDate),text:messageText(m.payload).slice(0,20000)}))};}));return json({...status,threads});}catch(e){const f=safeFailure(e,'sales.email.read');return json(f.body,f.status);}}
export async function POST(req:Request){try{const c=await context(req);if(!canAccess(c.viewer,'Sales CRM','email',true))throw new ForbiddenError();const b=await readPayload(req);if(b.action!=='connect')throw new AppError('Choose Connect Gmail.');return json({url:await authorize(c.viewer)});}catch(e){const f=safeFailure(e,'sales.email.connect');return json(f.body,f.status);}}
