import type {Viewer} from '@/lib/finance/model';
import type {SourceScope} from './model';
import {assertCcrTarget,recognizedCcrOriginal} from './ccr-target';
import {assertHrTarget,recognizedHrOriginal} from './hr-target';
export {requireSourceAccess} from './authorization';
export async function checkTarget(v:Viewer,scope:SourceScope,id?:string){if(!id)return;if(scope==='hr')await assertHrTarget(v,id);else await assertCcrTarget(v,scope,id);}
export async function nativeOriginal(v:Viewer,scope:SourceScope,id:string|undefined,digest:string,bytes:number){if(!id)return;const ref=scope==='hr'?await recognizedHrOriginal(v,id,digest,bytes):await recognizedCcrOriginal(v,scope,id,digest,bytes);
 if(ref&&(!ref.url.startsWith('/api/')||/[\\\r\n\x00-\x1f]/.test(ref.url)||!ref.fileId))throw new Error('Invalid native evidence reference.');return ref;}
