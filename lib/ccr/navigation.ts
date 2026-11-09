import type {Viewer} from '../finance/model';
import {canAccess} from '../finance/access.ts';
import {canOpenYearHistory} from '../year-history/access.ts';
export const ccrModule='Compliance, Claims & Recovery';
export function directoryTab(module:string|null,tab?:string|null){
 return module===ccrModule&&(tab==='hearings'||tab==='damage')?tab:undefined;
}
export function directoryPath(tab:'hearings'|'damage',outcome?:import('./court-outcomes').OutcomeFilter){
 return '/?module='+encodeURIComponent(ccrModule)+'&tab='+tab+(tab==='hearings'&&outcome&&outcome!=='all'?'&outcome='+outcome:'');
}
export const ccrNavigation=[
 {id:'command',title:'Command Center',group:'Workspace'},
 {id:'calendar',title:'Compliance Calendar',group:'Workspace'},
 {id:'hearings',title:'Court Docket',group:'Casework'},
 {id:'damage',title:'Damage Claims',group:'Casework'},
 {id:'tdlr',title:'TDLR Complaints',group:'Casework'},
 {id:'recovery',title:'Chargebacks & Recovery',group:'Casework'},
 {id:'legal',title:'Legal Notices & Correspondence',group:'Casework'},
 {id:'licenses',title:'Licenses & Testing',group:'Compliance'},
 {id:'people',title:'Personnel Review',group:'Compliance'},
 {id:'reports',title:'CCR Reports',group:'History'},
 {id:'year-history',title:'Archive & Year in Review',group:'History'},
] as const;
export type CcrTab=typeof ccrNavigation[number]['id'];
export function isCcrTab(id:unknown):id is CcrTab{return ccrNavigation.some(section=>section.id===id);}
export function ccrSections(viewer:Viewer|undefined){
 if(!viewer||viewer.onboardingOnly||viewer.id.startsWith('preview:'))return [];
 return ccrNavigation.filter(t=>t.id==='year-history'?canOpenYearHistory(viewer,ccrModule):canAccess(viewer,ccrModule,t.id));
}
export const ccrSearchTerms:Record<string,string>={legal:'legal notices correspondence cease desist threats demand sent received attorney certified mail response deadline',hearings:'tow hearing court lawsuit judge motion appearance docket upload document petition judgment police incident officer restitution victim witness settlement counsel attorney lawyer representation co-respondent law firm self-represented',recovery:'chargeback processor dispute loss balance demand collections upload document certified mail postage cash receipts square godaddy response deadline pre-arbitration',calendar:'obligation due deadline renewal schedule',tdlr:'complaint agency regulatory response redacted complaint opening letter upload',people:'personnel human resources twc workforce commission screening',licenses:'tdlr apd vsf testing mvr license credential expiry renewal',damage:'damage claims property asset incidents estimates repair settlement upload document insurer police report',reports:'report analytics charts outcomes lawsuits claims court complaints chargebacks recovery export',command:'dashboard overview command center'};
