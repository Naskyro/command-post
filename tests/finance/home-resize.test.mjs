import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDimensions, cardRows, placementUnits, resizeDimensions, visibleUnits } from '../../lib/home/dimensions.ts';
import { validateLayout, restoreLayout, defaultLayout } from '../../lib/home/widgets.ts';

const available = [{id:'inbox',title:'Email inbox',group:'My day'}, {id:'shifts',title:'My shifts',group:'My day'}];
const origin = {widthUnits:4, widthPx:386, heightPx:208, gridWidth:1186, gap:14};

test('corner resizing changes both dimensions and stays within the grid and height limits', () => {
  assert.deepEqual(resizeDimensions(origin, 200, 72), {widthUnits:6,heightPx:280});
  assert.deepEqual(resizeDimensions(origin, 10000, 10000), {widthUnits:12,heightPx:960});
  const smallest = resizeDimensions(origin, -10000, -10000);
  assert.equal(smallest.heightPx,128);
  assert.ok((origin.gridWidth + origin.gap) * smallest.widthUnits / 12 - origin.gap >= 260);
  assert.throws(() => resizeDimensions({...origin,gridWidth:0}, 10, 10), /unavailable/);
  assert.throws(() => resizeDimensions(origin, Infinity, 10), /unavailable/);
});
test('a height-only change on a phone preserves the saved desktop width', () => {
  const phone = {...origin,gridWidth:390,widthPx:390};
  assert.equal(visibleUnits(4,390,14),12);
  const resized = resizeDimensions(phone, 0, 48);
  assert.equal(resized.widthUnits,4);
  assert.equal(resized.heightPx,256);
  assert.equal(visibleUnits(resized.widthUnits,1186,14),4);
});
test('fine row sizing fits the requested height without a full empty row of cards', () => {
  for (const gap of [10,14]) for (const height of [128,192,249,320,600,960]) {
    const rows=cardRows(height,gap), actual=rows*4+(rows-1)*gap;
    assert.ok(actual>=height && actual-height<4+gap);
  }
});
test('resized dimensions survive validation and serialization while other widgets stay intact', () => {
  const before=[{id:'inbox',size:'Standard'},{id:'shifts',size:'Wide',span:2,height:'Tall'}];
  const updated=applyDimensions(before,'inbox',{widthUnits:5,heightPx:224});
  assert.equal(updated[1],before[1]);
  assert.deepEqual(restoreLayout(JSON.parse(JSON.stringify(validateLayout(updated,available))),available),updated);
  assert.equal(before[0].heightPx,undefined);
  const fitted=applyDimensions(updated,'inbox',{widthUnits:5});
  assert.equal('heightPx' in fitted[0],false);
  assert.equal(fitted[0].widthUnits,5);
});
test('untrusted dimensions cannot inject CSS, create huge cards or bypass widget access', () => {
  for (const widthUnits of [0,13,1.5,'4',NaN]) assert.throws(()=>validateLayout([{id:'inbox',size:'Standard',widthUnits}],available),/width/);
  for (const heightPx of [0,127,961,200.5,'200',Infinity]) assert.throws(()=>validateLayout([{id:'inbox',size:'Standard',heightPx}],available),/height/);
  assert.throws(()=>validateLayout([{id:'payroll',size:'Standard',widthUnits:4,heightPx:200}],available),/access/);
});
test('existing widths remain usable and new defaults let content determine card height', () => {
  assert.equal(placementUnits({id:'inbox',size:'Standard',span:2},3),8);
  assert.equal(placementUnits({id:'inbox',size:'Wide'},4),12);
  assert.equal(placementUnits({id:'inbox',size:'Wide',widthUnits:5},4),5);
  const defaults=defaultLayout({owner:false,role:'Employee',department:'Dispatch'},available);
  assert.ok(defaults.every(item=>item.height===undefined && item.heightPx===undefined && item.span===1));
});
