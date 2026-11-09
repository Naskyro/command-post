import {createHash} from 'node:crypto';
import type {Viewer} from '@/lib/finance/model';
import {AppError,ForbiddenError} from '@/lib/shared/errors';
import {docket,insertEdition} from './docket-server';
import {readAuthorizedCourtOriginal} from './court-files-server';
import {verifiedPdfPages} from './court-page-metrics';
import {docketAccess,type CourtDocument,type Matter} from './docket-model';
import {canonCause,jurisdiction,plain,terminalEvidence,verifiedPteParty} from './docket-import';
import {currentHearingFacts,factKey,hearingCourtKey,readHearingPacket,type HearingFactInput,type HearingFact} from './hearing-facts';
const fingerprint=(id:string,f:HearingFactInput)=>'hf_'+createHash('sha256').update(JSON.stringify([id,factKey(f)])).digest('hex');
const assess=(m:Matter,d:Map<string,CourtDocument>,fact:HearingFactInput)=>{
 const docs=fact.evidence.map(x=>d.get(x.sha256));if(docs.some(x=>!x||x.type!=='application/pdf'||!x.sha256))return 'A cited original PDF is not on this exact court record.';
 const originals=docs as CourtDocument[];
 if((fact.prevailingParty||fact.losingParty)&&!terminalEvidence(originals,{result:'Other Disposition'}))return 'Party outcomes must cite a final judgment, signed ruling or findings, not a notice or proposed order.';
 if(fact.kind==='hearing'&&fact.status==='Held'&&originals.every(x=>/(?:notice|petition|proposed|offer|hearing prep)/i.test(x.documentType)))return 'A setting notice or petition does not prove that a hearing took place.';
 if(fact.kind==='order'&&fact.judgeRole==='Signing'&&originals.every(x=>/(?:notice|petition|proposed|offer|hearing prep)/i.test(x.documentType)))return 'The judge signing an order needs a signed order or ruling as evidence.';
 if(fact.kind==='case'&&fact.precinct){const p=fact.precinct.match(/(?:^|\b)([1-8])(?:\b|$)/)?.[1],court=jurisdiction(m.courtName||'').split('|');if(court[1]==='jp'&&p&&p!==court[2])return 'The reported case precinct conflicts with the docket. Verify the court before filing.';}
 const out=m.statements.findLast(s=>s.outcome)?.outcome;if(out&&((out.result==='PTE Lost'&&fact.prevailingParty&&verifiedPteParty(fact.prevailingParty))||(out.result==='PTE Won'&&fact.losingParty&&verifiedPteParty(fact.losingParty))))return 'A party result contradicts the existing recorded disposition. Review the native docket first.';
 return '';
};
export async function sourcePageCount(v:Viewer,m:Matter,doc:CourtDocument){
 // Page counting reads the immutable, decrypted original through the ordinary access-checked court store.
 // Common judgments and settings are small. Larger source documents need a separate reviewed court extract.
 if(!v?.person||!v.id||v.id.startsWith('preview:')||!docketAccess(v)||!m.files?.some(f=>f.id===doc.id&&f.sha256===doc.sha256&&f.bytes===doc.bytes))throw new ForbiddenError();
 if(doc.bytes>24*1024*1024)throw new AppError('Cited PDF exceeds the page-verification limit. Cite a separately filed court order or notice.',422);
 return verifiedPdfPages(doc.sha256,doc.bytes,async()=>{const {bytes}=await readAuthorizedCourtOriginal(m,doc.id),raw=bytes instanceof Uint8Array?new Uint8Array(bytes):new Uint8Array(await new Response(bytes).arrayBuffer());const {getDocumentProxy}=await import('unpdf');
 let pdf;try{pdf=await getDocumentProxy(raw,{maxImageSize:1048576,disableFontFace:true,useSystemFonts:false});if(!Number.isSafeInteger(pdf.numPages)||pdf.numPages<1)throw Error();return pdf.numPages;}catch{throw new AppError('The original PDF page count could not be confirmed. Verify or repair the original before filing.',422);}finally{if(pdf)await pdf.loadingTask.destroy();}});
}
export async function fileHearingFacts(v:Viewer,action:unknown,raw:unknown,snapshot?:Matter[]){
 if(!v?.person||!v.id||v.id.startsWith('preview:')||!docketAccess(v,action==='import'))throw new ForbiddenError();
 if(!['preview','import','receipt'].includes(String(action)))throw new AppError('Choose preview, import, or receipt.');
 const b=readHearingPacket(raw),jur=hearingCourtKey(b.courtName),num=canonCause(b.number),list=snapshot??await docket(v);
 const expected=b.facts.length,base={matchedFacts:0,expectedFacts:expected},sameNumber=list.filter(r=>canonCause(r.number)===num),candidates=sameNumber.filter(r=>hearingCourtKey(r.courtName||'')===jur);if(candidates.length>1||sameNumber.some(r=>!hearingCourtKey(r.courtName||'')))return {...base,status:'review',reason:'The case number matches duplicate or incompletely identified court records.'};const m=candidates[0];
 if(!m)return {...base,status:'missing',reason:'No saved matter matches this court and cause number. No case was created.'};
 if(plain(m.title).includes('city of austin parking enforcement')&&!plain(m.title).includes('parking and towing enforcement'))return {...base,status:'review',reason:'The case title identifies City of Austin Parking Enforcement. Check the party before filing.'};
 const id=m.id,docs=new Map((m.files||[]).filter(f=>f.sha256).map(f=>[f.sha256!,f])),old=m.hearingFacts||[],known=new Map(old.map(f=>[f.id,f])),unique=new Map(b.facts.map(f=>[fingerprint(id,f),f])),newFacts=[...unique].filter(([k])=>!known.has(k)),matchedFacts=unique.size-newFacts.length,expectedFacts=unique.size,summary={id,expectedFacts,matchedFacts};
 const active=new Map(currentHearingFacts(old).map(f=>[f.id,f])),retired=new Set<string>();for(const [key,f] of unique){const error=assess(m,docs,f);if(error)return {...summary,status:'review',reason:error};
 if(!known.has(key)&&f.supersedes){const prior=active.get(f.supersedes);if(!prior||prior.kind!==f.kind||retired.has(f.supersedes))return {...summary,status:'review',reason:'Only a current fact on this record of the same kind can be corrected once in a batch.'};retired.add(f.supersedes);}}
 if(!newFacts.length)return {...summary,status:'confirmed',addedFacts:0,supersededFacts:[...unique.keys()].filter(k=>!active.has(k)).length};
 if(action==='receipt')return {...summary,status:'ready',reason:'These facts are not yet on file.'};
 if(old.length+newFacts.length>600)throw new AppError('This case reached its hearing history limit.',413);const pages=new Map<string,number>();for(const f of old)for(const e of f.evidence)if(e.pageCount)pages.set(e.sha256,e.pageCount);
 const additions:HearingFact[]=[],now=new Date().toISOString();for(const [key,f] of newFacts){const citations:HearingFact['evidence']=[];for(const c of f.evidence){const doc=docs.get(c.sha256)!;if(!pages.has(c.sha256)){try{pages.set(c.sha256,await sourcePageCount(v,m,doc));}catch(e){if(e instanceof AppError&&e.status===422)return {...summary,status:'review',reason:e.message};throw e;}}
 const pageCount=pages.get(c.sha256)!;if(c.page>pageCount)return {...summary,status:'review',reason:'A cited page is outside the verified original PDF.'};citations.push({...c,fileId:doc.id,pageCount});}additions.push({...f,evidence:citations,id:key,recordedAt:now,recordedBy:v.name,recordedById:v.id});}
 if(action==='preview')return {...summary,status:'ready',reason:'The source PDF fingerprints and page numbers were verified.'};
 await insertEdition({...m,hearingFacts:[...old,...additions],version:m.version+1,updatedAt:now,updatedBy:v.name,actorId:v.id});return {status:'confirmed',id,expectedFacts,matchedFacts:expectedFacts,addedFacts:additions.length};
}

export async function manyHearingFacts(v:Viewer,action:unknown,records:unknown){
 if(!v?.person||!v.id||v.id.startsWith('preview:')||!docketAccess(v,action==='import'))throw new ForbiddenError();
 if(!['preview','receipt','import'].includes(String(action))||!Array.isArray(records)||!records.length||records.length>(action==='receipt'?32:4))throw new AppError('Use 1–4 distinct court records per filing group (up to 32 for receipts).');
 const parsed=records.map(readHearingPacket),keys=parsed.map(b=>hearingCourtKey(b.courtName)+'/'+canonCause(b.number));if(new Set(keys).size!==keys.length)throw new AppError('Duplicate case in a filing group.');
 const rows=await docket(v),results=[];for(const b of parsed){try{results.push(await fileHearingFacts(v,action,b,rows));}catch(e){if(e instanceof ForbiddenError)throw e;results.push({status:'review',expectedFacts:b.facts.length,matchedFacts:0,reason:e instanceof AppError?e.message:'The source check did not finish. Verify the saved record before trying again.'});}}return {results};
}
