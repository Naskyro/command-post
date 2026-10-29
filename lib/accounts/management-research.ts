import research from './management-research.json';
import type {Row} from './model';
const companyId=(name:string)=>'company:research-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
export const researchedCompanies:Row[]=[...new Set(research.map(r=>r.company))].map(name=>({id:companyId(name),kind:'company',version:0,name,type:'Management company'}));
export function researchedManagement(row:Row):Partial<Row>{const found=research.find(r=>r.accountId===row.id);return found&&!row.companyId?{companyId:companyId(found.company),managementSource:found.source,managementCheckedOn:found.checkedOn}:{};}
