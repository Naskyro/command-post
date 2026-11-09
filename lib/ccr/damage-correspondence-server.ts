import {createHash} from 'node:crypto';
import {financeDb} from '@/db/finance';
import {decode,encode} from '@/lib/hr/server';
import {assertDamageIntakeAccess,damageImport,getDamageIntake} from './damage-intake-server';
import {historicalManifest,matchHistoricalMessages,readHistoricalGroup,type HistoricalMessage} from './damage-correspondence';
import type {DamageIntake} from './damage-intake-model';
import type {Viewer} from '@/lib/finance/model';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
type Saved=HistoricalMessage&{filedAt:string;filedBy:string;filedById:string};
export function grantHistorical(v:Viewer,write=false){assertDamageIntakeAccess(v,write);if(!v.owner)throw new ForbiddenError();}
export async function historicalByCase(v:Viewer,id:string):Promise<Saved[]>{grantHistorical(v);await getDamageIntake(id);const rows=await financeDb().prepare('SELECT payload FROM ccr_damage_mail WHERE case_id=?').bind(id).all<{payload:string}>();const list=await Promise.all(rows.results.map(x=>decode(x.payload) as Promise<Saved>));return list.sort((a,b)=>a.sentAt.localeCompare(b.sentAt)||a.messageId.localeCompare(b.messageId));}
export async function fileHistoricalGroup(v:Viewer,raw:unknown,save:boolean){
 grantHistorical(v,true);const g=readHistoricalGroup(raw),id='dmi_'+hash('support@gtowingtransport.com:'+g.threadId);
 let claim:DamageIntake;try{claim=await getDamageIntake(id);}catch(e){if(!(e instanceof AppError)||e.status!==404)throw e;if(!save)return {id,caseSaved:false,sourcesComplete:false,matched:0,total:g.messages.length};const made=await damageImport(v,historicalManifest(g));if(!made.id)throw new ConflictError('No identifiable claim was filed.');claim=await getDamageIntake(made.id);}
 matchHistoricalMessages(claim,g);const db=financeDb(),mail=g.messages.map(m=>({m,key:hash('support@gtowingtransport.com:mail:'+m.messageId),fingerprint:hash(JSON.stringify(m))})),keys=mail.map(x=>x.key);
 const read=async()=>{const ret=new Map<string,{case_id:string;fingerprint:string}>();for(let i=0;i<keys.length;i+=60){const k=keys.slice(i,i+60);const r=await db.prepare('SELECT message_key,case_id,fingerprint FROM ccr_damage_mail WHERE message_key IN ('+k.map(()=>'?').join(',')+')').bind(...k).all<{message_key:string;case_id:string;fingerprint:string}>();for(const x of r.results)ret.set(x.message_key,x);}return ret;};
 function compare(old:Map<string,{case_id:string;fingerprint:string}>){for(const {key,fingerprint} of mail){const p=old.get(key);if(p&&(p.case_id!==claim.id||p.fingerprint!==fingerprint))throw new ConflictError('Existing evidence has different text or attribution. No existing correspondence was replaced.');}return mail.filter(x=>!old.has(x.key));}
 const missing=compare(await read());
 const manifest=historicalManifest(g,claim);let sourcesComplete=(await damageImport(v,manifest,true)).status==='confirmed';
 if(save&&!sourcesComplete){await damageImport(v,manifest);sourcesComplete=(await damageImport(v,manifest,true)).status==='confirmed';if(!sourcesComplete)throw new ConflictError('Source references could not be verified. Check receipts before filing the originals.');}
 if(save&&missing.length){const filedAt=new Date().toISOString(),prepared=await Promise.all(missing.map(async({key,m,fingerprint})=>db.prepare('INSERT OR IGNORE INTO ccr_damage_mail(message_key,case_id,payload,fingerprint,filed_at) VALUES(?,?,?,?,?)').bind(key,claim.id,await encode({...m,filedAt,filedBy:v.name,filedById:v.id}),fingerprint,filedAt)));for(let i=0;i<prepared.length;i+=40)await db.batch(prepared.slice(i,i+40));}
 const remaining=save&&missing.length?compare(await read()).length:missing.length;return {id:claim.id,caseSaved:true,sourcesComplete,total:mail.length,matched:mail.length-remaining};
}
