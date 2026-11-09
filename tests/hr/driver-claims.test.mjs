import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewDriverClaims,driverClaimReferences} from '../../lib/hr/driver-claims.ts';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const driver={id:'driver',kind:'person',version:1,name:'Former Driver',department:'Drivers',supervisor:'manager',status:'Former',accountStatus:'Disabled'};
const people=[driver,{id:'manager',kind:'person',version:1,status:'Active',department:'Operations'},{id:'other',kind:'person',version:1,status:'Active',department:'Drivers'}];
const manager={id:'manager-auth',person:'manager',name:'Manager',access:[{module:'People & HR',tab:'people',level:'View'}],hrResponsibilities:[{action:'viewPersonnel',scope:'Team'}]};

test('personnel references preserve former-worker access without granting ordinary self or cross-team claim access',()=>{
 assert.equal(canViewDriverClaims(manager,driver.id,people),true);
 assert.equal(canViewDriverClaims(manager,'other',people),false);
 assert.equal(canViewDriverClaims({...manager,id:'preview:manager'},driver.id,people),false);
 assert.equal(canViewDriverClaims({...manager,onboardingOnly:true},driver.id,people),false);
 assert.equal(canViewDriverClaims({...manager,hrResponsibilities:[]},driver.id,people),false);
 const self={...manager,person:driver.id,id:'driver-auth',hrResponsibilities:[]};
 assert.equal(canViewDriverClaims(self,driver.id,people),false);
 assert.equal(canViewDriverClaims({...self,access:[...self.access,{module:'Compliance, Claims & Recovery',tab:'damage',level:'View'}]},driver.id,people),true);
 assert.equal(driver.status,'Former');assert.equal(driver.accountStatus,'Disabled');
});
test('all linked registers project only reference, date, status and authorized navigation, excluding narratives and medical details',()=>{
 const claim={id:'property-1',kind:'claim',name:'Private description',driverId:driver.id,insurerClaimNumber:'CL-100',date:'2026-10-29',status:'Investigating',medicalDiagnosis:'Private',photos:['secret'],summary:'Private summary'};
 const assets=[{id:'asset-1',kind:'assetClaim',personId:driver.id,data:{title:'Private title',reportedDate:'2026-10-28',status:'Open',doctor:'Private'}},{id:'asset-2',kind:'assetClaim',personId:'other',data:{driverId:driver.id,reportedDate:'2026-10-27',status:'Resolved'}},{id:'sample',kind:'assetClaim',personId:driver.id,data:{sample:true}}];
 const imports=[{id:'import-1',driverId:driver.id,reportedOn:'2026-10-30',status:'Open',claimReference:'CL-200',summary:'Private',references:['secret']},{id:'other-import',driverId:'other',reportedOn:'2026-10-30',status:'Open'}];
 const rows=driverClaimReferences(driver.id,[claim,{...claim,id:'other',driverId:'other'},{...claim,id:'deleted',deletedAt:'2026-10-31'}],assets,imports);
 assert.equal(rows.length,4);assert.equal(rows[0].key,'intake:import-1');assert.equal(rows[1].reference,'CL-100');
 assert.equal(rows.every(row=>row.canOpen===false),true);
 assert.equal(JSON.stringify(rows).includes('Private'),false);assert.equal(JSON.stringify(rows).includes('secret'),false);
 for(const row of rows)assert.deepEqual(Object.keys(row).sort(),['id','key','source','reference','date','status','canOpen'].sort());
 assert.equal(driverClaimReferences(driver.id,[claim],assets,imports,true).every(row=>row.canOpen),true);
 assert.equal(driverClaimReferences('unlinked',[claim],assets,imports,true).length,0);
});

test('personnel server authorizes the exact driver before loading claims and derives detail access from CCR permissions',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'personnel-driver-claims-'));
 const state=globalThis.personnelDriverClaimsTest={reads:0};
 t.after(async()=>{delete globalThis.personnelDriverClaimsTest;await rm(dir,{recursive:true,force:true});});
 const mocks=new Map([
  ['../accounts/server',`export const yearCaseRows=async()=>{globalThis.personnelDriverClaimsTest.reads++;return [{id:'claim-1',kind:'claim',driverId:'driver',name:'Private claim detail',date:'2026-10-30',status:'Investigating',medicalReport:'private'}]}`],
  ['./server','export const readAssetClaims=async()=>{globalThis.personnelDriverClaimsTest.reads++;return []}'],
  ['../ccr/damage-intake-server',`export const damageIntakeReferencesForDriver=async driverId=>{globalThis.personnelDriverClaimsTest.reads++;return [{id:'intake-1',driverId,reportedOn:'2026-10-29',status:'Open',claimReference:'CL-100'}]}`]
 ]);
 const outfile=join(dir,'server.mjs');
 await build({entryPoints:['lib/hr/driver-claims-server.ts'],outfile,platform:'node',format:'esm',bundle:true,plugins:[{name:'fixtures',setup(builder){builder.onResolve({filter:/.*/},value=>mocks.has(value.path)?{path:value.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},value=>({contents:mocks.get(value.path)}));}}]});
 const {personnelDriverClaims}=await import(pathToFileURL(outfile));
 await assert.rejects(()=>personnelDriverClaims(manager,'other',people),error=>error.status===403);
 await assert.rejects(()=>personnelDriverClaims(manager,'missing',people),error=>error.status===404);
 assert.equal(state.reads,0);
 const result=await personnelDriverClaims(manager,'driver',people);
 assert.equal(result.rows.length,2);assert.equal(result.rows.every(row=>!row.canOpen),true);assert.equal(JSON.stringify(result).includes('private'),false);
 const reader={...manager,access:[...manager.access,{module:'Compliance, Claims & Recovery',tab:'damage',level:'View'}]};
 assert.equal((await personnelDriverClaims(reader,'driver',people)).rows.every(row=>row.canOpen),true);
 assert.equal(driver.status,'Former');assert.equal(driver.accountStatus,'Disabled');
});
