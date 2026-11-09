import type {FinRecord,Viewer} from '@/lib/finance/model';
import {canAccess} from '@/lib/finance/access';
import {requireSourceAccess} from '@/lib/source-files/authorization';
import {ForbiddenError} from '@/lib/shared/errors';
import {docketAccess,CCR} from './docket-model';
export async function sourceDeskGrants(v:Viewer,roster:FinRecord[]){
 if(!v?.person||!v.id||v.id.startsWith('preview:')||v.onboardingOnly||!['damage','hearings','tdlr'].some(t=>canAccess(v,CCR,t)))throw new ForbiddenError();
 const scope=async(k:'damage'|'hearings'|'tdlr',edit=true)=>{try{await requireSourceAccess(v,k,edit,roster);return true;}catch(e){if(e instanceof ForbiddenError)return false;throw e;}};
 const [courtExec,canViewCounsel,tdlr,damageExec]=await Promise.all([scope('hearings'),canAccess(v,CCR,'court-counsel')?scope('hearings',false):false,scope('tdlr'),scope('damage')]);
 return {name:v.name,hearings:docketAccess(v),courtEdit:docketAccess(v,true),property:docketAccess(v,true)&&canAccess(v,'Account Management','accounts'),counsel:canViewCounsel,counselEdit:courtExec&&canAccess(v,CCR,'court-counsel',true),tdlr,damage:!!v.owner&&canAccess(v,CCR,'damage',true),drive:courtExec||tdlr||damageExec};
}
export type DeskGrants=Awaited<ReturnType<typeof sourceDeskGrants>>;
