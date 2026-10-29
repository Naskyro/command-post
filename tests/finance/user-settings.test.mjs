import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { themes, defaultTheme, validateTheme, validateSettings } from '../../lib/preferences/themes.ts';
import { readUserSettings, writeUserSettings } from '../../lib/preferences/storage.ts';

function settingsDatabase(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const folder = new URL('../../drizzle/', import.meta.url);
  for (const file of readdirSync(folder).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file, folder), 'utf8'));
  const db = {prepare(query) {
    const statement = sqlite.prepare(query);
    let args = [];
    return {
      bind(...values) {args = values; return this;},
      async first() {return statement.get(...args) ?? null;},
      async run() {return {meta:{changes:Number(statement.run(...args).changes)}};},
    };
  }};
  return {db,sqlite};
}
const first = {person:'person-one',id:'verified-user-one'};
const second = {person:'person-two',id:'verified-user-two'};

test('theme payload accepts only a known theme and a valid concurrency version', () => {
  for (const theme of themes) assert.equal(validateTheme(theme.id), theme.id);
  for (const theme of [null, '', 'garden; color:red', '<script>', '__proto__', {}, 1]) assert.throws(() => validateTheme(theme));
  for (const version of [-1, 1.5, NaN, Infinity, '0', null, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => validateSettings({theme:'garden',version}));
  for (const override of ['person','person_id','userId','role','access','css']) assert.throws(() => validateSettings({theme:'garden',version:0,[override]:'other'}), /Only your appearance/);
  assert.deepEqual(validateSettings({theme:'garden',version:0}), {theme:'garden',version:0});
});

test('themes persist separately for each authenticated person and preserve the verified actor', async t => {
  const {db,sqlite} = settingsDatabase(t);
  assert.deepEqual(await readUserSettings(db, first), {theme:defaultTheme,version:0,updatedAt:null});
  const saved = await writeUserSettings(db, first, 'garden', 0);
  assert.equal(saved.version, 1);
  assert.ok(Number.isFinite(Date.parse(saved.updatedAt)));
  assert.deepEqual(await readUserSettings(db, first), saved);
  assert.equal((await readUserSettings(db, second)).theme, defaultTheme);
  await writeUserSettings(db, second, 'sunset', 0);
  const updated = await writeUserSettings(db, first, 'night-sky', 1);
  assert.equal(updated.version, 2);
  assert.equal((await readUserSettings(db, second)).theme, 'sunset');
  assert.deepEqual(sqlite.prepare('SELECT person_id, updated_by, theme FROM user_settings ORDER BY person_id').all().map(row=>({...row})), [
    {person_id:first.person,updated_by:first.id,theme:'night-sky'},
    {person_id:second.person,updated_by:second.id,theme:'sunset'},
  ]);
});

test('simultaneous saves and stale tabs cannot overwrite a newer theme', async t => {
  const {db} = settingsDatabase(t);
  const creates = await Promise.allSettled([writeUserSettings(db,first,'coast',0),writeUserSettings(db,first,'ember',0)]);
  assert.deepEqual(creates.map(result=>result.status), ['fulfilled','rejected']);
  assert.equal(creates[1].reason.status, 409);
  assert.equal((await readUserSettings(db,first)).theme, 'coast');
  await writeUserSettings(db,first,'woodland',1);
  await assert.rejects(writeUserSettings(db,first,'ember',1), error=>error.status===409);
  assert.equal((await readUserSettings(db,first)).theme, 'woodland');
});

test('broken storage and invalid saved themes surface an error instead of a false successful save', async t => {
  const {db,sqlite} = settingsDatabase(t);
  await writeUserSettings(db,first,'coast',0);
  sqlite.prepare('UPDATE user_settings SET theme = ? WHERE person_id = ?').run('invalid-theme',first.person);
  await assert.rejects(readUserSettings(db,first), error=>error.status===503);
  const failed = {prepare(){throw new Error('D1_ERROR: database unavailable');}};
  await assert.rejects(readUserSettings(failed,first), /database unavailable/);
  await assert.rejects(writeUserSettings(failed,first,'coast',0), /database unavailable/);
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(pair=>parseInt(pair,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
function contrast(a,b) {const first=luminance(a),second=luminance(b);return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);}

test('every palette keeps normal text and primary navigation readable on its actual surfaces', () => {
  assert.equal(new Set(themes.map(theme=>theme.id)).size, themes.length);
  for (const {name,tokens} of themes) {
    for (const color of Object.values(tokens)) assert.match(color, /^#[0-9a-f]{6}$/i);
    for (const surface of ['surface','canvas','soft','softAlt']) {
      for (const text of ['ink','muted','accent','nav']) {
        const ratio = contrast(tokens[text],tokens[surface]);
        assert.ok(ratio>=4.5, `${name}: ${text} on ${surface} = ${ratio.toFixed(2)}`);
      }
    }
    for (const surface of ['nav','navEnd','accent']) assert.ok(contrast('#ffffff',tokens[surface])>=4.5, `${name}: white on ${surface}`);
  }
});
