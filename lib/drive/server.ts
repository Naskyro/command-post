import {financeDb} from '@/db/finance';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {canAccess} from '@/lib/finance/access';
import {decode,encryptBytes} from '@/lib/hr/server';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import {seedFolders} from './seed';
import {access,type DriveState,type DriveNode} from './model';
import type {Viewer,FinRecord} from '@/lib/finance/model';
export async function context(headers:Headers){const people=await allRecords();return contextForViewer(financeIdentity(headers,people),people);}
export async function contextForViewer(v:Viewer,people:FinRecord[]){
 const p=people.find(p=>p.id===v.person);if(!p||!['Active'].includes(String(p.status))||!canAccess(v,'Company Drive'))throw new ForbiddenError();const manager=v.owner||canAccess(v,'Company Drive','manage',true);const row=await financeDb().prepare('SELECT version FROM drive_state WHERE id=?').bind('company').first<{version:number}>();const stored=await financeDb().prepare('SELECT payload FROM drive_nodes').all<{payload:string}>();const saved=await Promise.all(stored.results.map(r=>decode(r.payload) as Promise<DriveNode>));const ids=new Set(saved.map(n=>n.id));const state:DriveState={nodes:[...seedFolders().filter(n=>!ids.has(n.id)),...saved]};return {v,manager,people,state,version:row?.version||0};}
export function requireAccess(c:Awaited<ReturnType<typeof context>>,id:string,edit=false){const level=access(c.state.nodes,id,c.v.person,c.manager);if(level==='None'||edit&&level!=='Edit')throw new ForbiddenError('You do not have access to this folder or file.');const node=c.state.nodes.find(n=>n.id===id);if(!node)throw new AppError('Item not found.',404);return node;}
export async function saveState(state:DriveState,version:number,v:Viewer,action:string,node:DriveNode,reason=''){
 const encoded=new TextEncoder().encode(JSON.stringify(node));if(encoded.length>1024*1024)throw new AppError('This file has reached its version-history capacity. Save the new document as a separate file.',413);
 const previous=await financeDb().prepare('SELECT payload FROM drive_nodes WHERE id=?').bind(node.id).first<{payload:string}>();
 const priorNode=previous?await decode(previous.payload) as DriveNode:undefined;
 const snapshot=(n:DriveNode|undefined)=>n?JSON.stringify({id:n.id,kind:n.kind,name:n.name,parent:n.parent,grants:n.grants,inherit:n.inherit,deletedAt:n.deletedAt,deleteReason:n.deleteReason,fileVersions:n.versions?.length,updatedAt:n.updatedAt,updatedBy:n.updatedBy}):null;
 const bytes=await encryptBytes(encoded);let binary='';for(const n of bytes)binary+=String.fromCharCode(n);const payload='v1:'+btoa(binary),db=financeDb(),at=new Date().toISOString(),guard=crypto.randomUUID();
 const write=version?db.prepare('UPDATE drive_state SET payload=?,version=? WHERE id=? AND version=?').bind('revision',version+1,'company',version):db.prepare('INSERT OR IGNORE INTO drive_state (id,payload,version) VALUES (?,?,?)').bind('company','revision',1);
 try{await db.batch([write,db.prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(guard),db.prepare('INSERT INTO drive_nodes (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(node.id,payload),db.prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'drive:'+node.id,v.name,v.id,at,'Company Drive — '+action+(reason?': '+reason:''),snapshot(priorNode),snapshot(node)),db.prepare('DELETE FROM hr_write_guard WHERE id=?').bind(guard)]);}catch{throw new ConflictError('The drive changed while saving. Refresh and retry. Your change was not saved.');}
}
