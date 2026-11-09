import {requestRoster} from '@/lib/finance/server';
import {canAccess} from '@/lib/finance/access';
import {hrCan} from '@/lib/hr/permissions';
import type {FinRecord,Viewer} from '@/lib/finance/model';
import {ForbiddenError} from '@/lib/shared/errors';
import type {SourceScope} from './model';
export async function requireSourceAccess(v:Viewer,scope:SourceScope,edit=false,verifiedRoster?:FinRecord[]){if(!v?.person||!v.id||v.id.startsWith('preview:')||v.onboardingOnly)throw new ForbiddenError();if(v.owner)return;
 const module=scope==='hr'?'People & HR':'Compliance, Claims & Recovery',tab=scope==='hr'?'people':scope;
 if(!canAccess(v,module,tab,edit)||!v.access?.some(g=>g.module===module&&g.tab===tab&&(!edit||g.level==='Edit')))throw new ForbiddenError();
 const roster=verifiedRoster??await requestRoster(),self=roster.find(r=>r.id===v.person&&r.kind==='person');if(!self||![self.authorityLevel,self.organizationalLevel,self.role].includes('Executive'))throw new ForbiddenError();
 if(scope==='hr'&&!(edit?['managePersonnel']:['viewPersonnel','managePersonnel']).some(a=>hrCan(v,a,undefined,roster)))throw new ForbiddenError();
}
