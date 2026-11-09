import test from 'node:test';
import assert from 'node:assert/strict';
import {ccrSections,ccrModule,directoryPath,directoryTab} from '../../lib/ccr/navigation.ts';
import {personnelReview,reviewPermissions} from '../../lib/ccr/personnel-review.ts';
const grants=[{module:ccrModule,tab:'people',level:'View'},{module:'People & HR',tab:'credentials',level:'View'}];
const viewer={id:'m',person:'m',name:'Supervisor',role:'Supervisor',owner:false,customAccess:true,access:grants,department:'Ops',hrResponsibilities:[{action:'manageTwc',scope:'Department'}]};
const staff=['m','one','two'].map(id=>({id,kind:'person',department:id==='two'?'Outside':'Ops',name:id.toUpperCase(),status:'Active'}));
const task=(id,personId)=>({id,kind:'task',personId,data:{category:'TWC',status:'Open',title:'Private allegations',notes:'Never disclose notes',dueDate:'2026-11-15'},updatedAt:'2026-11-01T10:00:00Z'});
test('CCR navigation uses actual tab grants, keeps delegation and onboarding out, and safely lands a restricted employee on their own first section',()=>{
 assert.deepEqual(ccrSections(viewer).map(t=>t.id),['people']);
 assert.deepEqual(ccrSections({...viewer,access:[{module:ccrModule,tab:'damage',level:'View'}]}).map(r=>r.id),['damage','year-history']);
 assert.deepEqual(ccrSections({...viewer,id:'preview:manager'}),[]); assert.deepEqual(ccrSections({...viewer,onboardingOnly:true}),[]);
});
test('CCR personnel referrals require both permissions, obey HR responsibility scope, and return no sensitive details',()=>{
 const hr=[task('a','one'),task('outside','two'),{...task('x','one'),kind:'screening',data:{status:'Private finding',report:'secret'}},{...task('other','one'),data:{category:'Personnel'}}];
 const list=personnelReview(viewer,staff,hr);
 assert.deepEqual(list.map(x=>x.id),['a']);assert.deepEqual(Object.keys(list[0]).sort(),['id','type','employee','due','updated','closed'].sort());
 assert.deepEqual(reviewPermissions(viewer,staff),{twc:true,screening:false});
 for(const access of [[grants[0]],[grants[1]]]) assert.deepEqual(personnelReview({...viewer,access},staff,hr),[]);
 assert.deepEqual(personnelReview({...viewer,hrResponsibilities:[]},staff,hr),[]);
});

test('a verified HR screening no longer appears as open; results and findings never cross into the directory',()=>{
 const v={...viewer,hrResponsibilities:[{action:'reviewScreening',scope:'Company'}]},r={...task('screen','one'),kind:'screening',data:{status:'Verified',medicalResult:'restricted'}};
 const [item]=personnelReview(v,staff,[r]);assert.equal(item.closed,true);assert.equal(JSON.stringify(item).includes('restricted'),false);
});

test('directory bookmarks round-trip without record identifiers, do not expand grants, and ignore unrelated or arbitrary targets',()=>{
 const claimsOnly={...viewer,access:[{module:ccrModule,tab:'damage',level:'View'}]};
 for(const tab of ['hearings','damage']){
  const url=new URL(directoryPath(tab),'https://example.test');
  assert.deepEqual([...url.searchParams.keys()],['module','tab']);
  const chosen=directoryTab(url.searchParams.get('module'),url.searchParams.get('tab'));
  assert.equal(chosen,tab);assert.equal(ccrSections(claimsOnly).some(t=>t.id===chosen),tab==='damage');
 }
 for(const [mod,tab] of [['Admin','damage'],[ccrModule,'upload:example'],[ccrModule,'../hearings'],[ccrModule,null]])assert.equal(directoryTab(mod,tab),undefined);
});
