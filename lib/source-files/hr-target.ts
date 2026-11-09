import {requestRoster} from '@/lib/finance/server';
import type {Viewer} from '@/lib/finance/model';
import {AppError} from '@/lib/shared/errors';
import {knownHistorical} from '@/lib/source-records/hr-server';
import {requireSourceAccess} from './authorization';
export async function assertHrTarget(v:Viewer,id:string){await requireSourceAccess(v,'hr');const exists=id.startsWith('history-')?await knownHistorical(id):(await requestRoster()).some(p=>p.kind==='person'&&p.id===id);if(!exists)throw new AppError('Select a verified personnel file or a historical personnel evidence holder.',404);}
export async function recognizedHrOriginal(_v:Viewer,_personId:string,_digest:string,_bytes:number):Promise<{url:string;fileId:string}|undefined>{return undefined;}
