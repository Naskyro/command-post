import type {Viewer,FinRecord} from '../finance/model';
import {docket,propertyOptions} from './docket-server';
import {getRegister} from './register-server';
import {yearCaseRows} from '../accounts/server';
import {access} from '../accounts/policy';
import {readAssetClaims} from '../hr/server';
import {listDamageIntakes} from './damage-intake-server';
import {permittedReport} from './reports-catalog';
import {buildReport,type Dataset} from './reports';
export async function loadCcrReport(v:Viewer,staff:FinRecord[],id:string){
 const def=permittedReport(v,id);let data:Dataset;
 if(def.desk==='hearings'){
  const wantProperties=def.id==='court-property'&&access(v,'accounts');
  const [court,accounts]=await Promise.all([docket(v),wantProperties?propertyOptions(v):Promise.resolve([])]);
  data={court,properties:new Map(accounts.map(a=>[a.id,a.name])),propertyNamesAllowed:wantProperties};
 }else if(def.desk==='damage'){
  // Match the source of each row in Damage Claims; never read personnel notes or finance registers.
  const both=!['damage-property','damage-paid'].includes(id);
  const includeIntakes=['damage-status','damage-source','damage-month','damage-property'].includes(id);
  const [cases,assets,intakes]=await Promise.all([yearCaseRows(),both?readAssetClaims():Promise.resolve([]),includeIntakes?listDamageIntakes(v):Promise.resolve([])]);
  data={propertyClaims:cases.filter(r=>r.kind==='claim'),assets,intakes,propertyNamesAllowed:access(v,'accounts'),properties:new Map(cases.filter(r=>r.kind==='account'&&!r.deletedAt).map(a=>[a.id,a.name]))};
 }else{data={register:(await getRegister(v,def.desk,staff)).rows};}
 return buildReport(def,data);
}
