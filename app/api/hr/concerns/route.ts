import {NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity,linkedPerson} from '@/lib/finance/identity';
import {financeDb} from '@/db/finance';
import {encode,decode,concernAlias} from '@/lib/hr/server';
import {concernData,requireRecipient} from '@/lib/hr/concerns';
import {AppError,ForbiddenError,ConflictError,readPayload,safeFailure} from '@/lib/shared/errors';
import {displayPersonName} from '@/lib/people/display-name';
import {concernExample} from '@/lib/hr/concern-examples';
export const dynamic='force-dynamic';
const json=(x:unknown,status=200)=>NextResponse.json(x,{status,headers:{'Cache-Control':'private, no-store'}});
type RecordRow={id:string;payload:string;submitted_at:string;reviewed_at:string|null};
async function identity(r:Request,hr:boolean){const people=await allRecords();const {p}=linkedPerson(r.headers,people);if(hr){const v=financeIdentity(r.headers,people);requireRecipient(v,p.status);}return p;}
function failed(e:unknown){const f=safeFailure(e,'hr.confidential_concern');return json(f.body,f.status);}
export async function GET(r:Request){try{
 const q=new URL(r.url).searchParams,hr=q.get('mine')!=='1',p=await identity(r,hr);
 const rows=await financeDb().prepare('SELECT id,payload,submitted_at,reviewed_at FROM hr_confidential_concerns ORDER BY submitted_at DESC').all<RecordRow>();
 const reports=[];let count=0;
 for(const x of rows.results){const d=await decode(x.payload),alias=await concernAlias(x.id,p.id);if(!hr&&(d.participant!==alias||d.removed))continue;
 const state=hr?d.hrViews?.[alias]:d.mineView;
 if(hr&&state!=='Removed'&&!x.reviewed_at)count++;
 reports.push({id:x.id,details:d.details,scope:d.scope,affected:d.affected,reportedBy:d.reportedBy,anonymous:d.anonymous,submitted:x.submitted_at,reviewed:x.reviewed_at,closed:!!d.closed,canReply:!!d.participant&&!d.closed&&state!=='Removed',state:state||'Active',messages:d.messages||[]});}
 if(!hr||q.get('inbox')==='1'){
 let authorized=hr;if(!hr){try{await identity(r,true);authorized=true;}catch(e){if((e as {status?:number}).status!==403)throw e;}}
 if(authorized){const sample=concernExample(hr),key=await concernAlias(sample.id,p.id);if(!await financeDb().prepare('SELECT key FROM hr_dismissed_concern_examples WHERE key=?').bind(key).first()){const pairs=await financeDb().prepare('SELECT payload FROM hr_practice_replies WHERE mailbox=? ORDER BY id').bind(key).all<{payload:string}>();for(const pair of pairs.results)sample.messages.push(...await decode(pair.payload));reports.push(sample);}}
 }
 return json(q.get('inbox')==='1'||!hr?{count,reports}:{count});
}catch(e){return failed(e);}}
export async function POST(r:Request){try{
 if(r.headers.get('origin')!==new URL(r.url).origin)throw new ForbiddenError();
 const b=await readPayload(r),a=b.action,hr=a==='review'||b.side==='hr',p=await identity(r,hr),db=financeDb(),at=new Date().toISOString();
 if(a==='reply'&&(b.id==='sample-incoming'||b.id==='sample-my-report')){await identity(r,true);const sample=concernExample(hr);if(sample.id!==b.id)throw new ForbiddenError();const key=await concernAlias(sample.id,p.id);if(typeof b.message!=='string'||!b.message.trim()||b.message.length>12000)throw new AppError('Enter a message of up to 12,000 characters.');const pair=[{at,by:hr?'HR':'Reporter',text:b.message.trim()},{at,by:'Automatic Response',text:'This is an automatic reply to your sample message. Your practice reply went through. Only you can see this exchange; it was not sent to HR or an employee.'}];const result=await db.prepare('INSERT INTO hr_practice_replies(mailbox,payload) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM hr_dismissed_concern_examples WHERE key=?)').bind(key,await encode(pair),key).run();if(!result.meta.changes)throw new AppError('This sample was deleted.');return json({ok:true});}
 if(a==='dismissExample'){await identity(r,true);const sample=concernExample(hr);if(b.id!==sample.id)throw new ForbiddenError();await db.prepare('INSERT OR IGNORE INTO hr_dismissed_concern_examples(key) VALUES(?)').bind(await concernAlias(sample.id,p.id)).run();await db.prepare('DELETE FROM hr_practice_replies WHERE mailbox=?').bind(await concernAlias(sample.id,p.id)).run();return json({ok:true});}
 if(a==='submit'){const id=crypto.randomUUID(),d=concernData(b,displayPersonName(p));await db.prepare('INSERT INTO hr_confidential_concerns(id,payload,submitted_at) VALUES(?,?,?)').bind(id,await encode({...d,participant:await concernAlias(id,p.id)}),at).run();// This projection intentionally excludes the private mailbox lookup key.
 return json({receipt:id,conversation:{id,...d,submitted:at,reviewed:null,closed:false,canReply:true,state:'Active',messages:[]}},201);}
 if(typeof b.id!=='string')throw new ForbiddenError();const row=await db.prepare('SELECT id,payload,submitted_at,reviewed_at FROM hr_confidential_concerns WHERE id=?').bind(b.id).first<RecordRow>();if(!row)throw new ForbiddenError();
 const d=await decode(row.payload),alias=await concernAlias(row.id,p.id);if(!hr&&(d.participant!==alias||d.removed))throw new ForbiddenError();
 if(a==='review'){await db.prepare('UPDATE hr_confidential_concerns SET reviewed_at=?, reviewed_by=? WHERE id=? AND reviewed_at IS NULL').bind(at,p.id,row.id).run();return json({ok:true});}
 d.messages??=[];d.hrViews??={};if(hr&&d.hrViews[alias]==='Removed')throw new ForbiddenError();
 const by=hr?'HR':'Reporter';
 if(a==='reply'){if(d.closed||!d.participant)throw new AppError('This conversation cannot receive replies.');if(typeof b.message!=='string'||!b.message.trim()||b.message.length>12000)throw new AppError('Enter a message of up to 12,000 characters.');d.messages.push({at,by,text:b.message.trim()});if(hr)d.mineView='Active';else for(const k of Object.keys(d.hrViews))if(d.hrViews[k]==='Archived')delete d.hrViews[k];}
 else if(a==='archive'||a==='restore'){const state=a==='archive'?'Archived':'Active';if(hr)d.hrViews[alias]=state;else d.mineView=state;}
 else if(a==='close'||a==='remove'){if(hr){d.hrViews[alias]='Removed';}else{d.closed=true;d.removed=a==='remove';}d.messages.push({at,by:'System',text:hr?'An HR responder left this conversation.':a==='remove'?'User deleted this chat from their inbox.':'User closed this chat.'});}
 else throw new AppError('Unknown inbox action.');
 const saved=await db.prepare('UPDATE hr_confidential_concerns SET payload=? WHERE id=? AND payload=?').bind(await encode(d),row.id,row.payload).run();if(!saved.meta.changes)throw new ConflictError();return json({ok:true});
}catch(e){return failed(e);}}
