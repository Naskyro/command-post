import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {allThemes,themes,defaultTheme} from '../../lib/preferences/themes.ts';
import {themeArtStyle,themeArtStyles,matchesThemeQuery} from '../../lib/site-themes/model.ts';
import {retiredThemeIds} from '../../lib/site-themes/catalog.ts';
import {readUserSettings,writeUserSettings} from '../../lib/preferences/storage.ts';
import {themeCatalog,prepareThemeChange,siteThemeData,assertThemeSelectable,effectiveUserSettings,themeRecordId} from '../../lib/site-themes/rules.ts';
const now=new Date('2026-11-01T12:00:00.000Z');
const owner={id:'verified-admin',person:'admin',name:'Site Administrator',owner:true,role:'Owner',department:'Administration',access:[]};
const employee={...owner,id:'verified-employee',person:'employee',name:'Employee',owner:false,role:'Employee',access:[]};
const reviewer={...employee,access:[{module:'Admin',tab:'site-themes',level:'View'}]};
const editor={...employee,access:[{module:'Admin',tab:'site-themes',level:'Edit'}]};
const id='seasonal-christmas-evergreen';
const save=(extra={})=>({action:'save',id,version:0,status:'Available',reason:'Release the seasonal library.',...extra});
const record=(extra={})=>({id:themeRecordId(id),kind:'siteTheme',themeId:id,version:1,status:'Scheduled',startsAt:'2026-11-01T12:00:00.000Z',endsAt:'2026-11-02T12:00:00.000Z',updatedBy:'Administrator',reason:'Test window',...extra});
function database(t){const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec('CREATE TABLE user_settings(person_id TEXT PRIMARY KEY,theme TEXT NOT NULL,version INTEGER NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL)');return {prepare(q){const stmt=sqlite.prepare(q);let args=[];return {bind(...v){args=v;return this},async first(){return stmt.get(...args)||null},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}}}}}};}
function contrast(a,b){const l=c=>c.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);return (Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05)}

test('all 9 existing themes stay permanent; 18 seasonal and personal collections each have 14 distinct designs in four styles',()=>{
 assert.equal(themes.length,9);assert.equal(new Set(allThemes.map(t=>t.id)).size,allThemes.length);
 const groups=new Map();for(const t of allThemes.filter(t=>t.seasonal))groups.set(t.category,(groups.get(t.category)||0)+1);
 assert.equal(groups.size,18);for(const count of groups.values())assert.equal(count,14);
 assert.equal(allThemes.length,261);for(const category of groups.keys()){const variants=allThemes.filter(t=>t.category===category);assert.equal(new Set(variants.map(t=>t.name)).size,14);assert.equal(new Set(variants.map(t=>JSON.stringify(t.tokens))).size,14);assert.equal(new Set(variants.map(t=>t.decoration.variant)).size,14);assert.equal(new Set(variants.map(t=>t.decoration.layout)).size,14);}
 const catalog=themeCatalog([],now);assert.equal(catalog.filter(t=>t.available&&!t.personalOnly).length,9);assert.ok(catalog.filter(t=>t.seasonal&&!t.personalOnly).every(t=>t.status==='Hidden'));
 for(const theme of allThemes){for(const color of Object.values(theme.tokens))assert.match(color,/^#[a-f0-9]{6}$/i);for(const bg of ['canvas','surface','soft','softAlt'])for(const text of ['ink','muted','accent','nav'])assert.ok(contrast(theme.tokens[bg],theme.tokens[text])>=4.5,`${theme.name}: ${text} on ${bg}`);for(const bg of ['accent','nav','navEnd'])assert.ok(contrast('#ffffff',theme.tokens[bg])>=4.5,`${theme.name}: white on ${bg}`)}
});
test('style filters expose all four editions per occasion and Fourth of July aliases identify the same designs',()=>{
 const groups=Map.groupBy(allThemes.filter(t=>t.seasonal),t=>t.category);
 for(const entries of groups.values()){
  assert.deepEqual(themeArtStyles.map(style=>entries.filter(t=>themeArtStyle(t.decoration)===style).length),[5,5,2,2]);
  for(const theme of entries){const {style,...legacy}=theme.decoration;assert.equal(themeArtStyle(legacy),style);}
 }
 assert.ok(themes.every(t=>themeArtStyle(t.decoration)==='Classic Color'));
 const expected=groups.get('Independence Day').map(t=>t.id);
 for(const phrase of ['Fourth of July','4th of July','Independence Day'])assert.deepEqual(allThemes.filter(t=>matchesThemeQuery(t,phrase)).map(t=>t.id),expected);
 assert.equal(allThemes.filter(t=>matchesThemeQuery(t,'July engrav')).length,2);
 const added=groups.get('Independence Day').find(t=>t.decoration.variant===12);
 assert(!siteThemeData([],employee,false,now).themes.some(t=>t.id===added.id));
 const published=record({id:themeRecordId(added.id),themeId:added.id});
 const live=siteThemeData([published],employee,false,now).themes.find(t=>t.id===added.id);
 assert.equal(themeArtStyle(live.decoration),'Nature & Realistic');assert.equal(live.id,added.id);
});
test('availability is inclusive at start, exclusive at end, and archived/hidden never leak',()=>{
 const row=record();assert.equal(themeCatalog([row],new Date(now-1)).find(t=>t.id===id).available,false);
 assert.equal(assertThemeSelectable(id,[row],now).id,id);
 assert.throws(()=>assertThemeSelectable(id,[row],new Date(row.endsAt)),/no longer available/);
 for(const status of ['Hidden','Archived'])assert.throws(()=>assertThemeSelectable(id,[{...row,status}],now));
 const result=siteThemeData([row],employee,false,new Date(now-1));assert.equal(result.themes.some(t=>t.id===id),false);assert.equal(result.nextChangeAt,row.startsAt);
 const active=siteThemeData([row],employee,false,now).themes.find(t=>t.id===id);assert.equal(active.reason,undefined);assert.equal(active.updatedBy,undefined);
});
test('specific Admin View/Edit checkbox governs every administration action',()=>{
 assert.throws(()=>siteThemeData([],employee,true,now),e=>e.status===403);
 assert.equal(siteThemeData([],reviewer,true,now).canManage,false);
 assert.throws(()=>prepareThemeChange([],reviewer,save(),now),e=>e.status===403);
 assert.throws(()=>prepareThemeChange([],{...employee,canManage:true},save(),now),e=>e.status===403);
 assert.equal(prepareThemeChange([],editor,save(),now).next.status,'Available');
 assert.throws(()=>prepareThemeChange([],{...owner,onboardingOnly:true},save(),now),e=>e.status===403);
});
test('everyday designs immutable; stale writes, missing reasons, forged metadata and invalid schedules rejected',()=>{
 assert.throws(()=>prepareThemeChange([],owner,save({id:'command'}),now),/Everyday/);
 assert.throws(()=>prepareThemeChange([],owner,save({id:'made-up'}),now),/library/);
 assert.throws(()=>prepareThemeChange([record()],owner,save(),now),e=>e.status===409);
 assert.throws(()=>prepareThemeChange([],owner,save({reason:''}),now),/reason/);
 assert.throws(()=>prepareThemeChange([],owner,{...save(),updatedBy:'Someone Else'},now),/availability/);
 assert.throws(()=>prepareThemeChange([],owner,save({status:'Scheduled',startsAt:'2026-12-01T12:00'}),now),/timezone/);
 assert.throws(()=>prepareThemeChange([],owner,save({status:'Scheduled',startsAt:'2026-10-01T12:00:00Z'}),now),/future/);
 assert.throws(()=>prepareThemeChange([],owner,save({status:'Scheduled',startsAt:'2026-12-01T12:00:00Z',endsAt:'2026-11-15T12:00:00Z'}),now),/after the start/);
 const changed=prepareThemeChange([],owner,save({status:'Scheduled',startsAt:'2026-12-01T08:00:00-06:00',endsAt:'2026-12-30T18:00:00-06:00'}),now);
 assert.equal(changed.next.startsAt,'2026-12-01T14:00:00.000Z');assert.match(changed.reason,/Release the seasonal library/);
});
test('restore preserves design but never silently publishes, and expired publication starts a new opt-in window',()=>{
 const archived=prepareThemeChange([record()],owner,save({action:'archive',version:1}),now).next;assert.equal(archived.status,'Archived');
 const restore=prepareThemeChange([archived],owner,save({action:'restore',version:1}),now).next;assert.equal(restore.status,'Hidden');assert.equal(restore.startsAt,'');
 assert.throws(()=>prepareThemeChange([archived],owner,save({version:1}),now),/Restore/);
 const later=new Date('2027-12-01T12:00:00Z'),released=prepareThemeChange([record()],owner,save({version:1}),later).next;assert.equal(released.startsAt,later.toISOString());
});
test('seasonal choice and prior permanent fallback persist atomically, without affecting another user',async t=>{
 const db=database(t);await writeUserSettings(db,employee,'garden',0);
 const end=new Date(Date.now()+86400000).toISOString();const selected=await writeUserSettings(db,employee,id,1,{fallbackTheme:'garden',endsAt:end});
 assert.deepEqual(await readUserSettings(db,employee),selected);assert.equal((await readUserSettings(db,owner)).theme,defaultTheme);
 assert.equal(selected.fallbackTheme,'garden');await assert.rejects(()=>writeUserSettings(db,employee,'coast',1),e=>e.status===409);
 const chosenAt=new Date(selected.seasonalSelectedAt),row=record({status:'Available',startsAt:chosenAt.toISOString(),endsAt:end});
 assert.equal(effectiveUserSettings(selected,[row],chosenAt).theme,id);
 const expired=effectiveUserSettings(selected,[row],new Date(Date.parse(end)+1));assert.equal(expired.theme,'garden');assert.match(expired.notice,/restored/);
 const nextSeason=new Date(Date.parse(end)+366*86400000);const renewed=record({status:'Available',startsAt:nextSeason.toISOString(),endsAt:new Date(nextSeason.getTime()+86400000).toISOString()});
 assert.equal(effectiveUserSettings(selected,[renewed],new Date(nextSeason.getTime()+60000)).theme,'garden','a fresh admin publication must not silently reselect a previous seasonal theme');
 await writeUserSettings(db,employee,'coast',2);assert.deepEqual(Object.keys(await readUserSettings(db,employee)).sort(),['theme','updatedAt','version']);
});
test('changing a published schedule cannot extend the duration originally selected by the employee',()=>{
 const settings={theme:id,version:1,updatedAt:null,fallbackTheme:'coast',seasonalSelectedAt:'2026-11-01T12:00:00Z',seasonalExpiresAt:'2026-11-02T12:00:00Z'};
 const long=record({endsAt:'2026-12-31T12:00:00Z'});assert.equal(effectiveUserSettings(settings,[long],new Date('2026-11-03T12:00:00Z')).theme,'coast');
 const hidden=record({status:'Hidden'});assert.equal(effectiveUserSettings(settings,[hidden],now).theme,'coast');
});


test('company-selected holiday collections exclude all three withdrawn occasions',()=>{
 const actual=new Set(allThemes.flatMap(t=>t.federalHoliday?[t.federalHoliday]:[]));
 for(const holiday of ['New Year’s Day','Birthday of Martin Luther King, Jr.','Memorial Day','Juneteenth National Independence Day','Independence Day','Labor Day','Veterans Day','Thanksgiving Day','Christmas Day'])assert.ok(actual.has(holiday),holiday);
 for(const excluded of ['Columbus Day','Inauguration Day','Washington’s Birthday'])assert.equal(actual.has(excluded),false,excluded);
 assert.equal(retiredThemeIds.size,30);
 for(const id of retiredThemeIds){
  assert.equal(allThemes.some(t=>t.id===id),false,id);
  const row={...record(),id:themeRecordId(id),themeId:id,status:'Available'};
  assert.equal(siteThemeData([row],owner,true,now).themes.some(t=>t.id===id),false,'old availability records cannot restore a retired theme');
  assert.throws(()=>assertThemeSelectable(id,[row],now),/no longer available/);
  assert.throws(()=>prepareThemeChange([row],owner,save({id,version:1}),now),/library/);
 }
});

test('retired selections restore the saved everyday design without changing other preferences',async t=>{
 const db=database(t),retiredId='seasonal-presidents-presidential-navy';
 await db.prepare('INSERT INTO user_settings(person_id,theme,version,updated_by,updated_at) VALUES (?, ?, ?, ?, ?)').bind(employee.person,JSON.stringify({theme:retiredId,fallback:'coast',selectedAt:'2026-10-30T12:00:00Z',birthdayThemeId:'seasonal-birthday-cake',birthdayDismissedDay:'2026-10-31'}),3,employee.id,now.toISOString()).run();
 const restored=await readUserSettings(db,employee);
 assert.equal(restored.theme,'coast');assert.equal(restored.version,3);
 assert.equal(restored.birthdayThemeId,'seasonal-birthday-cake');assert.equal(restored.birthdayDismissedDay,'2026-10-31');assert.match(restored.notice,/restored/);
 assert.equal(effectiveUserSettings(restored,[],now).theme,'coast');
 assert.equal(effectiveUserSettings({theme:retiredId,version:3,updatedAt:null,fallbackTheme:'garden'},[],now).theme,'garden');
 const stored=await db.prepare('SELECT theme FROM user_settings WHERE person_id = ?').bind(employee.person).first();assert.equal(JSON.parse(stored.theme).theme,retiredId,'reading does not overwrite stored history');
 await db.prepare('UPDATE user_settings SET theme = ? WHERE person_id = ?').bind('seasonal-inauguration-blue',employee.person).run();assert.equal((await readUserSettings(db,employee)).theme,defaultTheme);
 await db.prepare('UPDATE user_settings SET theme = ? WHERE person_id = ?').bind('made-up-invalid-theme',employee.person).run();await assert.rejects(()=>readUserSettings(db,employee),e=>e.status===503);
});


test('all original seasonal IDs survive the larger illustrated library',()=>{
 const originals=['christmas-evergreen','christmas-cranberry','thanksgiving-harvest','thanksgiving-cranberry','valentine-rose','valentine-plum','independence-liberty','independence-stars','black-history-heritage','black-history-unity','easter-meadow','easter-sky','halloween-pumpkin','halloween-plum','newyear-midnight','newyear-silver','fall-maple','fall-cedar','summer-coast','summer-citrus','spring-bloom','spring-rain','winter-frost','winter-cabin'];
 for(const id of originals)assert.ok(allThemes.some(t=>t.id==='seasonal-'+id),id);
 assert.equal(allThemes.find(t=>t.id==='seasonal-christmas-evergreen').tokens.nav,'#064b32');
 assert.equal(allThemes.find(t=>t.id==='seasonal-winter-cabin').tokens.accent,'#76533e');
});

test('birthday designs have a private eligible pool with archive/restore but no company-wide release',()=>{
 const pool=themeCatalog([],now).filter(t=>t.personalOnly&&t.available);assert.equal(pool.length,14);
 const birthday=pool[0];assert.equal(siteThemeData([],employee,false,now).themes.some(t=>t.personalOnly),false);
 assert.throws(()=>assertThemeSelectable(birthday.id,[],now),/no longer available/);
 assert.throws(()=>prepareThemeChange([],owner,save({id:birthday.id}),now),/birthday/);
 const archived=prepareThemeChange([],owner,save({id:birthday.id,action:'archive'}),now).next;
 assert.equal(themeCatalog([archived],now).filter(t=>t.personalOnly&&t.available).length,13);
 const restored=prepareThemeChange([archived],owner,save({id:birthday.id,action:'restore'}),now).next;
 assert.equal(restored.status,'Available');assert.equal(restored.startsAt,'');assert.equal(restored.endsAt,'');
 assert.equal(themeCatalog([restored],now).filter(t=>t.personalOnly&&t.available).length,14);
 assert.equal(effectiveUserSettings({theme:'garden',version:0,updatedAt:null},[],now).availableThemes.some(t=>t.personalOnly),false);
});
