import type {FinRecord} from '../finance/model';
import {departmentFor} from './departments.ts';

/** Driving eligibility follows the saved department identity, including renamed departments. */
export function isDriverPerson(person:FinRecord,records:FinRecord[]=[]):boolean {
 const department=departmentFor(records,person.departmentId||person.department);
 const labels=[person.departmentKey,person.department,department?.name,...(Array.isArray(department?.aliases)?department.aliases:[])].map(value=>String(value||'').trim().toLowerCase());
 return person.departmentId==='department-2'||department?.id==='department-2'||labels.includes('drivers')||person.coverageRole==='Driver';
}
