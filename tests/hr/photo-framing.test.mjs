import test from 'node:test';
import assert from 'node:assert/strict';
import {photoCrop} from '../../lib/people/photo-framing.ts';

test('an off-center subject on a wide photo can be framed without zooming', () => {
  const w=900, h=300, subjectX=745;
  const center=photoCrop(w,h,1,50,50), right=photoCrop(w,h,1,100,50), left=photoCrop(w,h,1,0,50);
  assert.deepEqual(left,{x:0,y:0,side:300});
  assert.deepEqual(center,{x:300,y:0,side:300});
  assert.deepEqual(right,{x:600,y:0,side:300});
  assert.ok(subjectX > center.x + center.side);
  assert.ok(Math.abs((subjectX-right.x)/right.side-0.5)<0.02);
});

test('both axes work after zooming a tall portrait and all four corners stay filled', () => {
  for (const [w,h] of [[600,1000],[900,301],[1024,1024]]) {
    for (const zoom of [1,1.25,2.05,2.5]) {
      for (const x of [0,33,50,100]) for (const y of [0,42,50,100]) {
        const crop=photoCrop(w,h,zoom,x,y);
        assert.ok(crop.x>=0 && crop.y>=0);
        assert.ok(crop.x+crop.side<=w+1e-9 && crop.y+crop.side<=h+1e-9);
      }
    }
  }
  assert.deepEqual(photoCrop(600,1000,2,100,0),{x:300,y:0,side:300});
  assert.deepEqual(photoCrop(600,1000,2,0,100),{x:0,y:700,side:300});
});
