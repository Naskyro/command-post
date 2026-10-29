import type {Field} from './model';
const yesNo=['Yes','No','Not confirmed'];
const enforcement=['Patrol permitted','Authorized call-in only','No enforcement','Not confirmed'];
const select=(key:string,label:string,options:string[],group:string):Field=>({key,label,type:'select',options,group});
const note=(key:string,label:string,group:string):Field=>({key,label,type:'textarea',group});
export const layoutFields:Field[]=[
 select('leasingOfficeParking','Parking in front of the leasing office',['Enforced','Do not tow','Not applicable','Not confirmed'],'Leasing office parking'),
 note('leasingOfficeParkingHours','Leasing office area enforcement hours','Leasing office parking'),
 note('leasingOfficeParkingAuthority','Who may authorize towing in the leasing office area','Leasing office parking'),
 note('leasingOfficeParkingRules','Leasing office parking boundary & exceptions','Leasing office parking'),
 select('residentialBuildingType','Residential building type',['Garden / low rise','Mid rise','High rise','Townhomes','Other','Not confirmed'],'Property layout'),
 note('mixedUseLayout','Mixed-use building layout','Property layout'),
 {key:'commercialUnits',label:'Commercial units',type:'number',group:'Property layout'},
 note('carportRules','Carport locations & exceptions','Parking & enforcement'),
 select('garageParking','Individual / private garages',yesNo,'Parking & enforcement'),
 select('garageEnforcement','Private garage enforcement',enforcement,'Parking & enforcement'),
 note('garageRules','Private garage access & towing rules','Parking & enforcement'),
 select('parkingGarage','Shared parking garage / parking structure',yesNo,'Parking garage'),
 {key:'parkingGarageFloors',label:'Parking garage floors',type:'number',group:'Parking garage'},
 select('parkingGarageEnforcement','Parking garage enforcement',enforcement,'Parking garage'),
 select('parkingGarageVisitorParking','Where may visitors park in the parking garage?',['Anywhere permitted in the garage','Top floor — uncovered spaces only','Designated areas / floors','Visitors not allowed','Other','Not confirmed'],'Parking garage'),
 note('parkingGarageVisitorLocation','Visitor floors / areas','Parking garage'),
 note('parkingGarageRules','Garage entrances, access restrictions & exceptions','Parking garage'),
 select('commercialTenantParking','Commercial tenant / employee parking',yesNo,'Commercial tenant parking'),
 select('customerParking','Commercial customer parking',yesNo,'Customer parking'),
 ...([['residentialParking','Residential parking'],['commercialTenantParking','Commercial tenant parking'],['customerParking','Customer parking']] as const).flatMap(([key,group])=>[
   note(key+'Location','Parking location / boundary',group),
   note(key+'Permits','Permit / validation requirements',group),
   note(key+'Hours','Enforcement hours for this area',group),
   note(key+'Authority','Who may authorize a tow in this area',group),
   note(key+'Rules','Parking rules & exceptions for this area',group),
 ]),
 {key:'customerTimeLimitMinutes',label:'Customer parking time limit (minutes)',type:'number',group:'Customer parking'},
];
export const layoutFieldKeys=layoutFields.map(f=>f.key);
