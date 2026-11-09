// Server only: build the representation before search, HTML, PDF, onboarding or signature generation.
import type {FinRecord} from '@/lib/finance/model';
import {verifiedOwnerRecord} from '@/lib/finance/identity';
import {authorityLevelOf} from '@/lib/people/policy';
import {ConflictError} from '@/lib/shared/errors';
import {employeeCorrectiveContent,isCorrectivePolicy} from './corrective-content';
import {withImportedCorrectiveSections} from './corrective-import';
import type {StoredEdition} from './publication';
import {publicPublication} from './publication';
import type {CorrectiveEdition} from './model';

export const allEmployees=()=>({all:true,people:[] as string[],departments:[] as string[],levels:[] as string[]});
export function canManageCorrectiveContent(person:FinRecord){
 if(person.kind!=='person'||person.accountStatus==='Disabled'||!['Active','Onboarding'].includes(String(person.status)))return false;
 const tier=authorityLevelOf(person);return ['Manager','Department Lead / Director','Executive'].includes(tier)||!tier&&verifiedOwnerRecord(person)&&person.status==='Active';
}
export function correctiveEdition(person:FinRecord):CorrectiveEdition{return canManageCorrectiveContent(person)?'management':'employee';}
export function validateAccessEdition(actual:CorrectiveEdition|undefined,requested:unknown){
 if(actual&&actual!==requested)throw new ConflictError('Your policy edition changed. Refresh and open the current edition before acknowledging.');
}
export function correctiveView<P extends StoredEdition>(raw:P,person:FinRecord,employeeOnly=false):StoredEdition{
 if(!isCorrectivePolicy(raw))return raw;
 const p=withImportedCorrectiveSections(raw) as StoredEdition,accessEdition=employeeOnly?'employee':correctiveEdition(person);
 if(accessEdition==='management')return {...p,originalPdf:false,audience:allEmployees(),accessEdition};
 // Whitelist the public fields. Future fields in stored drafts and metadata cannot leak by default.
 const pub=publicPublication(p.publication);
 const view:StoredEdition={id:p.id,code:p.code,topicId:p.topicId,version:p.version,etag:p.etag,status:p.status,updatedAt:p.updatedAt,updatedBy:p.updatedBy,
  audience:allEmployees(),content:employeeCorrectiveContent(p),accessEdition,canEditPolicy:false,originalPdf:false,requireOnboardingSignature:p.requireOnboardingSignature!==false,
  ...(pub?{publication:pub}:{}),pdfEdition:{topicLabel:'Corrective Action',related:[],...(pub?{revisedBy:pub.signerName,publishedAt:pub.publishedAt}:{})}};
 return view;
}
