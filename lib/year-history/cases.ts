import type {FinRecord,Viewer} from '../finance/model';
import {canAccess} from '../finance/access';
import {access} from '../accounts/policy';
import {docketAccess,CCR} from '../ccr/docket-model';
import {claimAccess} from '../hr/assignments';
import {registerSections,sectionAccess} from '../ccr/register-model';
import {registerEntries} from './register-events';
import {canOpenYearHistory} from './access';
import type {YearEntry} from './model';
import {assetEntries,courtEntries,propertyClaims,releaseEntries,safetyEntries} from './case-events';

export async function caseHistory(viewer:Viewer,records:FinRecord[],requestedModule?:string):Promise<YearEntry[]>{
 if(viewer.onboardingOnly||viewer.id.startsWith('preview:'))return [];
 const am='Account Management',amAccess=(!requestedModule||requestedModule===am)&&canOpenYearHistory(viewer,am),ccrAccess=(!requestedModule||requestedModule===CCR)&&canOpenYearHistory(viewer,CCR);
 const amClaims=amAccess&&canAccess(viewer,am,'claims'),ccrClaims=ccrAccess&&claimAccess(viewer);
 const releases=amAccess&&canAccess(viewer,am,'courtesy');
 const safety=amAccess&&canAccess(viewer,am,'safety')&&records.some(p=>p.kind==='person'&&p.id===viewer.person&&p.status==='Active');
 const tasks:Promise<YearEntry[]>[]=[];
 if(ccrAccess&&registerSections.some(section=>sectionAccess(viewer,section)))tasks.push(import('../ccr/register-server').then(async s=>registerEntries(await s.registerEditions(viewer,records))));
 if(ccrAccess&&docketAccess(viewer))tasks.push(import('../ccr/docket-server').then(async s=>courtEntries(await s.docketEditions(viewer))));
 if(ccrClaims)tasks.push(import('../hr/server').then(async s=>assetEntries(await s.readAssetClaims())));
 if(amClaims||ccrClaims||releases||safety)tasks.push(import('../accounts/server').then(async s=>{
  const rows=await s.yearCaseRows(),out:YearEntry[]=[];
  if((amClaims||ccrClaims)&&access(viewer,'claims')){const scoped=s.projection(rows,viewer,'claims');if(amClaims)out.push(...propertyClaims(scoped,am));if(ccrClaims)out.push(...propertyClaims(scoped,CCR));}
  if(releases)out.push(...releaseEntries(s.projection(rows,viewer,'manager')));
  if(safety)out.push(...safetyEntries(rows));
  return out;
 }));
 return (await Promise.all(tasks)).flat();
}
