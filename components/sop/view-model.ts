import {auditDay} from '@/lib/shared/audit-format';
import type {Policy,Topic} from '@/lib/sop/model';
export type {SopData as Catalog,SopRequest as ChangeRequest,Topic} from '@/lib/sop/model';
import type {SopData as Catalog} from '@/lib/sop/model';
export const pdfUrl=(p:Policy,download=false)=>'/api/sop/pdf?'+new URLSearchParams({id:p.id,version:String(p.version),...(download?{download:'1'}:{})}).toString();
export function searchText(p:Policy,t?:Topic){const c=p.content;return [p.code,p.sourceStatus,t?.prefix,t?.name,c.title,c.shortName,c.keywords,...c.sections.map(s=>s.heading+' '+s.text)].join(' ').toLowerCase();}
export function isReady(p:Policy){return /issue.ready|completed.*issue review|ready.to.issue|ready for issue|ready for .*issuance/i.test(p.sourceStatus||'');}
export function audienceText(p:Policy,d:Catalog){return p.audience.all?'All Employees':[...p.audience.departments.map(x=>d.departments.find(y=>y.id===x)?.name||x),...p.audience.levels,...p.audience.people.map(x=>d.people.find(y=>y.id===x)?.name||x)].join(', ')||'Editors Only';}
export function when(s?:string){return auditDay(s);}
