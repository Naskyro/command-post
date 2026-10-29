import type {Row, Field} from './model';

const wholeNumbers = new Set(['units','parkingSpaces','vehiclesPerLeaseholder','visitorVisitsPerMonth','visitorConsecutiveDays','cancellationDays','propertyNightLimit','propertyWeekLimit','internalNightLimit','internalWeekLimit','approximateAge','industryStartYear','parkingGarageFloors','commercialUnits']);
const measurements = new Set(['miles','mileageRate','visitorPermitHours','yearsInRole','customerTimeLimitMinutes']);
export function numberStep(key:string):number|'any' { return wholeNumbers.has(key)?1:measurements.has(key)?'any':0.01; }
export function numberError(field:Pick<Field,'key'|'label'>,value:unknown):string {
 if(value===''||value===undefined||value===null)return '';
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>1e9)return field.label+': enter a valid nonnegative number.';
 if(wholeNumbers.has(field.key)&&!Number.isInteger(n))return field.label+': use a whole number (0, 1, 2…).';
 return '';
}
export const isMixed=(r:Row)=>['Mixed','Mixed use'].includes(String(r.propertyType));
export const hasDigital=(r:Row)=>['Digital only','Physical and digital'].includes(String(r.permitSystem));
export const hasPhysical=(r:Row)=>['Physical only','Physical and digital'].includes(String(r.permitSystem));
export function fieldVisible(r:Row,key:string):boolean {
 if(!['account','opportunity'].includes(r.kind))return true;
 if(key.startsWith('leasingOfficeParking')&&key!=='leasingOfficeParking')return ['Enforced','Do not tow'].includes(String(r.leasingOfficeParking))&&(key!=='leasingOfficeParkingHours'&&key!=='leasingOfficeParkingAuthority'||r.leasingOfficeParking==='Enforced');
 if(['physicalPermitType','physicalPermitDisplay'].includes(key))return hasPhysical(r);
 if(['permitPlatform','visitorApproval'].includes(key))return hasDigital(r);
 if(key==='visitorSectionLocation')return r.visitorSection==='Yes';
 if(key==='evParkingRules')return ['Yes','Call-in only'].includes(String(r.evParkingEnforcement));
 if(['carportEnforcement','carportRules'].includes(key))return r.carportParking==='Yes';
 if(['garageEnforcement','garageRules'].includes(key))return r.garageParking==='Yes';
 if(key.startsWith('parkingGarage')&&key!=='parkingGarage') {
   if(r.parkingGarage!=='Yes')return false;
   if(key==='parkingGarageVisitorLocation')return ['Designated areas / floors','Other'].includes(String(r.parkingGarageVisitorParking));
 }
 if(key==='residentialBuildingType')return r.propertyType==='Residential'||isMixed(r);
 if(['mixedUseLayout','commercialUnits','commercialTenantParking','customerParking'].includes(key)||key.startsWith('residentialParking'))return isMixed(r);
 if(key.startsWith('commercialTenantParking')&&key!=='commercialTenantParking')return isMixed(r)&&r.commercialTenantParking==='Yes';
 if((key.startsWith('customerParking')&&key!=='customerParking')||key==='customerTimeLimitMinutes')return isMixed(r)&&r.customerParking==='Yes';
 if(key==='units')return r.propertyType!=='Commercial';
 return true;
}
