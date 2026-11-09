import test from 'node:test';
import assert from 'node:assert/strict';
import {allThemes} from '../../lib/preferences/themes.ts';

const channels=hex=>hex.slice(1).match(/../g).map(part=>parseInt(part,16));
function luminance(hex){
 return channels(hex).map(channel=>channel/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4).reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index],0);
}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);}
function mix(a,b,ratio){const second=channels(b);return '#'+channels(a).map((v,i)=>Math.round(v+(second[i]-v)*ratio).toString(16).padStart(2,'0')).join('');}

test('every design keeps content, buttons, and the full navigation gradient readable',()=>{
 assert.equal(allThemes.length,261,'audit every available design, including personal birthday themes');
 for(const theme of allThemes){
  const colors=theme.tokens;
  assert.equal(colors.surface,'#ffffff',`${theme.name}: content panels remain solid white`);
  for(const background of ['surface','canvas','soft','softAlt']){
   for(const foreground of ['ink','muted','accent']){
    const ratio=contrast(colors[foreground],colors[background]);
    assert.ok(ratio>=4.5,`${theme.name}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
   }
  }
  assert.ok(contrast('#ffffff',colors.accent)>=4.5,`${theme.name}: white button labels`);
  // Checking endpoints alone can miss a bad intermediate gradient stop.
  for(let step=0;step<=20;step++){
   const background=mix(colors.nav,colors.navEnd,step/20);
   for(const foreground of ['#ffffff',colors.highlight]){
    const ratio=contrast(foreground,background);
    assert.ok(ratio>=4.5,`${theme.name}: navigation at ${step*5}% is ${ratio.toFixed(2)}:1`);
   }
  }
 }
});

test('seasonal supporting text stays strong without desaturating the illustrations',()=>{
 for(const theme of allThemes.filter(t=>t.seasonal)){
  assert.equal(theme.tokens.ink,'#17212b');
  assert.equal(theme.tokens.muted,'#3f4b57');
  for(const background of ['surface','canvas','soft','softAlt'])assert.ok(contrast(theme.tokens.muted,theme.tokens[background])>=7,`${theme.name}: supporting text on ${background}`);
 }
 const christmas=allThemes.filter(t=>t.category==='Christmas');
 assert.equal(christmas.length,14);
 for(const theme of christmas.filter(t=>t.decoration.variant<=10)){
  assert.equal(theme.decoration.colors[1],'#d6283d','ribbons keep a saturated Christmas red');
  assert.equal(theme.decoration.colors[2],'#147546','foliage keeps a saturated evergreen');
 }
});

test('decorative workspace cards keep white text legible between navigation and the active accent in every theme',()=>{
 for(const theme of allThemes){
  const {nav,navEnd,accent}=theme.tokens;
  for(const [a,b] of [[navEnd,nav],[nav,accent]]){
   for(let i=0;i<=20;i++)assert.ok(contrast('#ffffff',mix(a,b,i/20))>=4.5,theme.name+' header contrast');
  }
 }
 const t=allThemes.find(w=>w.id==='command').tokens;
 for(const stop of [t.navEnd,t.nav,t.accent])assert.equal(new Set(channels(stop)).size,1,'Command header must be achromatic');
});
