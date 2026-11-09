import test from 'node:test';
import assert from 'node:assert/strict';
import {fitSearchHint} from '../../lib/shared/search-hint.ts';

test('a directory can grow and shrink without showing half a search instruction',()=>{
 const hint='Name, property, or company',short='Find a Contact';
 const measure=t=>[...t].reduce((n,c)=>n+(/[mw]/i.test(c)?11:c===' '?3:7),0);
 for(let width=0;width<=380;width++){
  const selected=fitSearchHint(hint,short,width,measure);
  assert.ok(measure(selected)<=width);
  if(width>=measure(hint))assert.equal(selected,hint);
  if(width<measure(hint)&&width>=measure(short))assert.equal(selected,short);
 }
 assert.equal(fitSearchHint(hint,short,16,measure),'');
});
