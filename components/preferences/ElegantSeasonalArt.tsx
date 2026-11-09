'use client';
import {useId} from 'react';
import type {ThemeMotif} from '@/lib/site-themes/model';

type Placement='menu'|'header'|'footer'|'preview';
type Palette={ink:string; enamel:string; metal:string; paper:string};
const colors:Partial<Record<ThemeMotif,readonly [string,string,string,string]>>={
 christmas:['#163c32','#983046','#bd9452','#fff5d9'], thanksgiving:['#402b26','#ad6234','#c99959','#fff2d9'],
 valentines:['#422339','#ac5067','#d79c83','#fff1e4'], 'black-history':['#183e37','#9c4342','#cb9c48','#fff3cc'],
 easter:['#374451','#a397b9','#beac77','#fff8e7'], halloween:['#2e233e','#b67542','#c7a775','#fff3d9'],
 'new-year':['#202a42','#49708a','#ceb060','#fff3ce'], fall:['#493629','#a65a31','#d1a166','#fff3de'],
 summer:['#1b454a','#4f8b8e','#c8a469','#fff6d8'], spring:['#304b39','#bc7b85','#b9a46a','#fff6e2'],
 winter:['#254151','#76949f','#b6c4c6','#fffdef'], mlk:['#283855','#6b7f85','#c6a465','#faf4df'],
 memorial:['#283647','#a84442','#bea575','#fff3df'], juneteenth:['#283d53','#a24247','#c8a76e','#fff5db'],
 labor:['#344449','#af7751','#bf9a64','#fff5df'], veterans:['#293d50','#536e75','#bca275','#fff6e4'],
 birthday:['#46304b','#b78078','#d4a86e','#fff5dd']
};
const seq=(n:number)=>Array.from({length:n},(_,i)=>i);
function star(n:number,R:number,r:number){return seq(n*2).map(i=>{const a=i*Math.PI/n-Math.PI/2,x=(i%2?r:R)*Math.cos(a),y=(i%2?r:R)*Math.sin(a);return `${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`;}).join(' ')+'Z';}
function Twig({p}:{p:Palette}){return <g fill="none" stroke={p.metal} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M-2 0Q12-10 16-42"/>{seq(6).map(i=><g key={i} transform={`translate(${i*2.6} ${-i*5.55}) rotate(${i*2})`}><path d="M1 0Q-8-2-7-13Q1-11 1 0ZM3-2Q6-12 16-13Q14-4 3-2Z" fill={i%2?p.ink:p.enamel}/><path d="M1-1-5-10M4-3l9-8" strokeWidth=".55"/></g>)}<path d="M15-36q-3-12 5-18 3 10-5 18Z" fill={p.enamel}/></g>}
function Wheat({p}:{p:Palette}){return <g stroke={p.metal} fill={p.metal} strokeLinecap="round"><path d="M0 25Q4 4 1-21" fill="none" strokeWidth="1.4"/>{seq(5).map(i=><g key={i} transform={`translate(0 ${12-i*5.6})`}><path d="M2 0Q-5 0-7-8q7 1 9 8ZM2-2q0-7 8-10-1 8-8 10Z"/><path d="M-6-7l-5-8m20 4 4-7" strokeWidth=".65"/></g>)}<path d="M1-17q-5-9 0-15 5 6 0 15Z"/></g>}
function Spark({x=0,y=0,r=4,color}:{x?:number;y?:number;r?:number;color:string}){return <path transform={`translate(${x} ${y}) scale(${r})`} d="M0-1Q.07-.1 1 0Q.07.1 0 1Q-.07.1-1 0Q-.07-.1 0-1Z" fill={color}/>;}
function Snow({p}:{p:Palette}){return <g fill="none" stroke={p.metal} strokeWidth="2" strokeLinecap="round">{seq(6).map(i=><g transform={`rotate(${i*60})`} key={i}><path d="M0-27V0m0-10 8-7m-8 7-8-7m8-1 5-4m-5 4-5-4"/><circle cy="-27" r="1.35" fill={p.paper}/></g>)}<path d={star(6,9,6)} fill={p.paper} strokeWidth="1"/></g>}
function Flower({p,petals=5}:{p:Palette;petals?:number}){return <g stroke={p.metal} strokeWidth="1">{seq(petals).map(i=><g key={i} transform={`rotate(${i*360/petals})`}><path d="M0 2C-5-1-18-17-10-25-4-31 0-24 0-22c2-5 6-8 10-3C18-16 7-2 0 2Z" fill={p.enamel}/><path d="M0-4q-2-10-7-16m7 16 5-14" fill="none" stroke={p.paper} strokeOpacity=".65" strokeWidth=".75"/></g>)}<circle r="6" fill={p.metal}/>{seq(8).map(i=><circle key={i} transform={`rotate(${i*45})`} cy="-3" r=".95" fill={p.ink}/>)}</g>}
function Bell({p}:{p:Palette}){return <g stroke={p.metal} strokeWidth="1.25" strokeLinejoin="round"><circle cy="-24" r="3.4" fill="none"/><path d="M-22 13c9-8 7-15 9-26 2-13 24-13 26 0 2 11 1 19 9 26Z" fill={p.enamel}/><path d="M-12 8q4-9 5-19m-3 19q4-10 4-16m16 15-1-5" fill="none" stroke={p.paper} strokeWidth=".85"/><ellipse cy="14" rx="23" ry="4.4" fill={p.ink}/><circle cy="18" r="4.2" fill={p.metal}/></g>}
function Emblem({m,p,v}:{m:ThemeMotif;p:Palette;v:number}){
 const common={stroke:p.metal,strokeWidth:1.2,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
 switch(m){
 case 'christmas':
  if(v===2)return <g {...common}><g transform="rotate(-42) translate(-5 3) scale(.7)"><Twig p={p}/></g><g transform="rotate(18) translate(2 5) scale(.72)"><Twig p={p}/></g><g transform="rotate(88) translate(3 -1) scale(.52)"><Twig p={p}/></g>{[[-4,4],[3,2],[1,9],[8,7]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="4.1" fill={p.enamel}/>)}</g>;
  if(v===4)return <g {...common} fill={p.enamel}><path d="m0-30 13 17-4-1L20-1l-5-1L27 14H3v10h-6V14h-24l12-16-5 1L-9-14l-4 1Z"/><path d="M0-25v38m0-23-8 6m8-6 8 6M0-4-15 6M0-4 15 6M0 3l-14 9M0 3l14 9" fill="none"/></g>;
  if(v===6)return <g><g transform="translate(-9 -2) rotate(-18) scale(.76)"><Bell p={p}/></g><g transform="translate(9 3) rotate(16) scale(.82)"><Bell p={p}/></g><path d="M-2-17q-23-18-19-5 4 7 19 5 11-17 18-11 7 8-18 11" fill="none" stroke={p.metal} strokeWidth="2"/></g>;
  if(v===8)return <Snow p={p}/>;
  return <g {...common}><path d="M0-30v10m-3-3h6v7h-6z" fill={p.metal}/><path d="M0-17C13-14 20-7 20 2S14 18 0 27C-14 18-20 12-20 2s7-16 20-19Z" fill={p.enamel}/><path d="M0-17C8-8 10 14 0 26c-9-11-8-32 0-43Zm-18 17Q0 14 18 0m-35 6q16 11 34 0" fill="none"/></g>;
 case 'thanksgiving':return <g><g transform="translate(-5 4) rotate(-25) scale(.89)"><Wheat p={p}/></g><g transform="translate(8 4) rotate(12)"><Wheat p={p}/></g><path d="m-13 21 23-6m-20 9 19-7" stroke={p.enamel} strokeWidth="3"/></g>;
 case 'fall':return <g {...common}><path d="M0 23-3 7-21 5l4-5-10-11 11 3-2-11 10 7-2-11 6 4 5-12 5 12 6-4-2 11 10-7-3 11 11-3L16 1l4 4L2 8Z" fill={p.enamel}/><path d="M0 21 1-24M0 4l-17-14M1 3l18-14M-1-4l-8-13" fill="none"/></g>;
 case 'valentines':return <g {...common}><path d="M0 25C-54-6-20-42 0-17c21-25 55 10 0 42Z" fill={p.enamel}/><path d="M0 18C-30-2-27-18-15-19M8-12q9-11 15-4" fill="none" stroke={p.paper}/><path d="m-9 8 15-20m-11 15 9-11" fill="none" opacity=".65"/></g>;
 case 'easter':return <g {...common}><path d="M0-30C-10-30-22-5-22 8c0 23 44 23 44 0C22-6 9-30 0-30Z" fill={p.enamel}/><path d="M-17-10Q0 2 17-10m-37 7Q0 10 20-3m-41 15Q0 26 21 12M-19 7l6-2 6 7 7-3 7 3 6-7 6 2" fill="none"/><g transform="translate(0 -10) scale(.27)"><Flower p={p}/></g></g>;
 case 'spring':return <Flower p={p}/>;
 case 'summer':return <g {...common}><path d="M0 22C-43 14-31 6-30 3c-8-7-6-16 0-18 0-9 11-15 17-12 4-8 15-9 20-4 9-2 17 3 17 11 9 1 13 8 10 15 5 10-3 17-34 27Z" fill={p.enamel}/><path d="M0 19-27-12m27 31L-14-25M0 19 0-29m0 48 15-41M0 19l26-29M0 20l27-15" fill="none"/><path d="m-8 22-3 5h22l-3-5" fill={p.metal}/></g>;
 case 'winter':return <Snow p={p}/>;
 case 'halloween':return <g {...common}><path d="M12-27C-26-30-31 20-1 27c11 3 25-3 29-13C7 24-13-2 12-27Z" fill={p.enamel}/><path d="M-9-17q-19 29 8 39m-11-29q-7 17 5 24" fill="none"/><Spark x={16} y={-9} r={9} color={p.metal}/></g>;
 case 'new-year':return <g {...common}><circle r="25" fill={p.enamel}/><circle r="21" fill={p.ink}/>{seq(12).map(i=><path key={i} d="M0-18v3" transform={`rotate(${i*30})`}/>)}<path d="M0-15V0l-8-10" fill="none" stroke={p.paper} strokeWidth="2.3"/><circle r="2.3" fill={p.metal}/></g>;
 case 'black-history':return <g {...common}><path d="M-26 17q15-5 26 3 11-8 26-3V-16q-13-4-26 2-13-6-26-2Z" fill={p.enamel}/><path d="M0 18v-30m-22 1q12-3 19 2m-19 5q10-3 18 2m-18 6q10-3 18 2m26-15q-11-3-18 1m18 6q-12-3-18 2m18 6q-13-3-18 2" fill="none"/><path d="M-28 20q18-2 28 4 10-6 28-4" fill="none"/></g>;
 case 'mlk':return <g {...common}><path d="M-29-5q22 4 26 8-12-17-10-30Q-2-11 8-8q6-10 13-4l9-2-7 6q0 16-18 22L-7 26l1-10-15 5 11-10Z" fill={p.paper}/><path d="M-9-20Q0 2 11 3m-16-4L2 7m17-16h.1" fill="none" stroke={p.ink}/><path d="m24-9 8-9m-5 6q-7-4-3-8 4 2 3 8m2-4q2-8 8-7-1 6-8 7" fill={p.enamel}/></g>;
 case 'memorial':return <g><path d="M0 1q12 15 6 29m-1-8q-10-12-17-10 4 11 17 12" fill={p.enamel} stroke={p.metal} strokeWidth="1.25"/><g transform="translate(0 -6) scale(.8)"><Flower p={p} petals={4}/><circle r="6" fill={p.ink}/></g></g>;
 case 'juneteenth':return <g {...common}><path d={star(12,27,20)} fill={p.enamel}/><path d={star(5,17,7)} fill={p.paper}/><path d="M-23 23Q0 17 23 23" fill="none" strokeWidth="2"/></g>;
 case 'labor':return <g {...common}><path d="m-14-14-5-4-4 6 5 4-5 8 7 3-2 8 9 1 2 7 7-2 5 6 6-6 8 1 1-8 7-3-3-8 4-5-6-6 1-7-8-1-4-6-7 3-6-3-4 8Z" fill={p.enamel}/><circle r="13" fill={p.ink}/><circle r="8" fill="none"/><path d="M-18 17 16-16" fill="none" stroke={p.paper} strokeWidth="2"/></g>;
 case 'veterans':return <g {...common}><path d="M-16-27H16v18L0 3-16-9Z" fill={p.enamel}/><path d="m-9-25 0 16 9 7 9-7v-16" fill="none"/><circle cy="9" r="17" fill={p.metal}/><circle cy="9" r="13.5" fill={p.ink}/><path transform="translate(0 9)" d={star(5,10,4.3)} fill={p.paper}/></g>;
 case 'birthday':return <g {...common}><path d="M-22 2 0-7 22 2 0 11Z" fill={p.paper}/><path d="m-22 2 22 9v18l-22-9Zm22 9 22-9v18L0 29Z" fill={p.enamel}/><path d="m-11-3 22 10v17m0-29-22 10v16" fill="none"/><path d="M0-7c-27-26-37-4 0 0 28-28 36-6 0 0Z" fill="none" strokeWidth="2"/></g>;
 default:return <g {...common}><path d={star(8,26,9)} fill={p.enamel}/><path d={star(8,18,6)} fill={p.paper}/></g>;
 }
}

function diamonds({n,cx,cy,step,p}:{n:number;cx:number;cy:number;step:number;p:Palette}){return seq(n).map(i=><path key={i} d="m0-2.5 2.5 2.5L0 2.5-2.5 0Z" fill={i%3?p.metal:p.paper} transform={`translate(${cx+i*step} ${cy})`}/>);}
function ScrollCorner({p}:{p:Palette}){return <g fill="none" stroke={p.metal} strokeLinecap="round"><path d="M0 32V0h54m-49 27V5h36m-34 15C4-2 26 2 24 10c-2 7-12 7-12 1 0-4 6-4 6 0m-8 11c0-8 6-11 12-9 7 3 15-3 20-8" strokeWidth="1.3"/><path d="m9 7 3-3 3 3-3 3Z" fill={p.metal}/></g>}
function StarsMap({p,w=240,h=158}:{p:Palette;w?:number;h?:number}){const coords=[[.06,.32],[.11,.46],[.16,.34],[.23,.43],[.34,.18],[.19,.64],[.32,.69],[.77,.25],[.82,.39],[.87,.23],[.94,.31],[.8,.67],[.88,.8],[.95,.64]];return <g><path d={'M'+[0,1,2,3,4].map(i=>coords[i][0]*w+' '+coords[i][1]*h).join('L')+'M'+[2,5,6].map(i=>coords[i][0]*w+' '+coords[i][1]*h).join('L')+'M'+[7,8,9,10,8,11,12,13].map(i=>coords[i][0]*w+' '+coords[i][1]*h).join('L')} stroke={p.metal} strokeWidth=".7" fill="none" opacity=".85"/>{coords.map(([x,y],i)=>i%3===0?<Spark key={i} x={w*x} y={h*y} r={i%2?3.5:5} color={p.paper}/>:<circle key={i} cx={x*w} cy={y*h} r="1.7" fill={p.metal}/>)}{seq(16).map(i=><circle key={i} cx={w*(.04+((i*37)%91)/100)} cy={h*(.12+((i*23)%76)/100)} r={i%3===0?1.2:.65} fill={p.paper}/>)}</g>}
function Cone({p}:{p:Palette}){return <g>{seq(13).map(i=><path key={i} d="M0 0Q-3-37 0-61Q4-64 7-59Z" transform={`rotate(${(i-6)*11})`} fill={i%2===0?p.metal:p.enamel} stroke={p.ink} strokeWidth=".9"/>)}<path d="M-59-26Q0-96 59-26M-54-24Q0-86 54-24" fill="none" stroke={p.metal}/></g>}
function CardArt({motif,variant,p,foil}:{motif:ThemeMotif;variant:number;p:Palette;foil:string}){
 const center=<Emblem m={motif} p={p} v={variant}/>;
 if(variant===2)return <g>
  <path d="M12 127Q19 59 83 32t146 7q-7 63-63 87-61 26-154 1Z" fill={p.ink}/>
  <path d="M16 127Q25 72 73 45m98 75q40-22 53-69" fill="none" stroke={foil} strokeWidth="1.4"/>
  <g transform="translate(49 119) rotate(-85) scale(.9)"><Twig p={p}/></g><g transform="translate(59 112) rotate(-62) scale(.98)"><Twig p={p}/></g><g transform="translate(77 105) rotate(-32) scale(.83)"><Twig p={p}/></g>
  <g transform="translate(166 60) rotate(101) scale(.9)"><Twig p={p}/></g><g transform="translate(177 52) rotate(70) scale(.88)"><Twig p={p}/></g><g transform="translate(193 47) rotate(44) scale(.73)"><Twig p={p}/></g>
  <path d="M22 117q28-3 68-25M150 72q22-16 66-35" fill="none" stroke={foil} strokeWidth="1.6"/>
  <g transform="translate(121 79) rotate(-6) scale(1.25)">{center}</g><Spark x={92} y={39} r={4} color={p.metal}/><Spark x={153} y={116} r={3} color={p.metal}/>
 </g>;
 if(variant===4)return <g>
  <path d="M15 120V87h14V65h19V48h22V35l50-20 50 20v13h22v17h19v22h14v33l-105 26Z" fill={p.ink} stroke={foil} strokeWidth="1.6"/>
  <g transform="translate(120 100) scale(1.22)"><Cone p={p}/></g>
  {[false,true].map(right=><g key={String(right)} transform={right?'translate(240) scale(-1 1)':undefined} fill="none" stroke={foil}>{seq(3).map(i=><path key={i} d={`M${19+5*i} ${113+1.2*i}V${92-2*i}h14V${70-2*i}h19V${53-2*i}h21`} strokeWidth={i===0?2:1}/>)}</g>)}
  <path d="m120 39 37 45-37 41-37-41Z" fill={p.ink} stroke={foil} strokeWidth="2"/><g transform="translate(120 85) scale(.94)">{center}</g><path d="m48 117 72 18 72-18m-121 3 49 12 49-12" stroke={foil} fill="none"/>
 </g>;
 if(variant===6)return <g>
  <path d="M36 65 10 96l28 1-9 23 48-20m127-35 26 31-28 1 9 23-48-20" fill={p.enamel} stroke={p.metal}/><path d="M46 70 25 93l26-9-10 19 25-11m128-22 21 23-26-9 10 19-25-11" fill="none" stroke={p.metal}/>
  <g transform="translate(120 79)"><ellipse rx="80" ry="64" fill={foil}/><ellipse rx="76.5" ry="60.5" fill={p.ink}/>{seq(60).map(i=>{const t=i*Math.PI/30;return <path key={i} d={`M${Math.cos(t)*75} ${Math.sin(t)*59}L${Math.cos(t+.022)*69} ${Math.sin(t+.022)*53}`} stroke={p.metal} strokeWidth="1.6"/>;})}<ellipse rx="66" ry="51" stroke={p.metal} fill={p.ink} strokeWidth="1.6"/><ellipse rx="60" ry="46" stroke={p.metal} fill="none" strokeWidth=".65"/>
  <g transform="rotate(-4) scale(1.15)">{center}</g><Spark x={-43} r={3.4} color={p.metal}/><Spark x={43} r={3.4} color={p.metal}/></g>
 </g>;
 if(variant===8)return <g><rect x="6" y="10" width="228" height="138" rx="69" fill={p.ink} stroke={foil} strokeWidth="1.5"/><StarsMap p={p}/><g transform="translate(120 77)"><circle r="44" fill={p.ink} stroke={p.metal} strokeWidth=".9" strokeDasharray=".8 4"/><path d="M-23-35a42 42 0 0 1 54 6m8 22a40 40 0 0 1-74 27m-4-21a39 39 0 0 1 7-27" fill="none" stroke={foil} strokeWidth="1.3"/><g transform="scale(1.05)">{center}</g></g><Spark x={135} y={31} r={6} color={p.paper}/><Spark x={108} y={125} r={4} color={p.metal}/></g>;
 return <g><path d="M32 12h176l17 17v100l-17 17H32l-17-17V29Z" fill={p.paper} stroke={p.metal} strokeWidth="2.5"/><path d="M35 18h170l14 14v94l-14 14H35l-14-14V32Z" stroke={p.ink} strokeWidth=".8" fill="none"/>
 {[[26,24,0],[214,24,90],[214,134,180],[26,134,270]].map(([x,y,r])=><g key={x+':'+y} transform={`translate(${x} ${y}) rotate(${r})`}><ScrollCorner p={p}/></g>)}
 <g transform="translate(120 80)"><path d="M-59 0q13-3 21 0-8 3-21 0Zm97 0q13-3 21 0-8 3-21 0Z" fill={p.metal}/><path d="M-16-39h32m-32 77h32" stroke={p.metal}/><g transform="scale(1.03)">{center}</g></g></g>;
}
function HeaderArt({motif,variant,p,foil}:{motif:ThemeMotif;variant:number;p:Palette;foil:string}){
 const icon=<Emblem m={motif} p={p} v={variant}/>;
 if(variant===2)return <g><path d="M0 46q44 9 90-12t65 0m50 0q29-15 65 0t90 12" fill="none" stroke={p.metal} strokeWidth="1.5"/>{[0,1].map(side=><g key={side} transform={side?'translate(360) scale(-1 1)':undefined}>{[[17,48,-82,.53],[40,47,-59,.63],[68,42,-43,.73],[90,35,-52,.68],[115,29,-74,.63],[135,31,-97,.4]].map(([x,y,r,s])=><g key={x} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}><Twig p={p}/></g>)}</g>)}<g transform="translate(180 33) scale(.96)">{icon}</g></g>;
 if(variant===4)return <g><rect width="360" height="66" fill={p.ink}/>{[0,1].map(side=><g key={side} transform={side?'translate(360) scale(-1 1)':undefined} fill="none" stroke={foil}>{seq(3).map(i=><path key={i} d={`M0 ${20+i*6}h26l18 18h33l11-11h32l16-16h14`} strokeWidth={i===0?2:1}/>)}<path d="m42 14 12 12 12-12-12-12Z" fill={p.enamel}/></g>)}<path d="m180 2 30 31-30 31-30-31Z" fill={p.enamel} stroke={foil} strokeWidth="1.4"/><g transform="translate(180 33) scale(.74)">{icon}</g></g>;
 if(variant===6)return <g fill="none" stroke={p.metal}><path d="M0 26H135m90 0h135M0 40H135m90 0h135" strokeWidth="1.15"/>{[0,1].map(side=><g key={side} transform={side?'translate(360) scale(-1 1)':undefined}>{seq(8).map(i=><g key={i} transform={`translate(${8+i*15} 33)`}><path d="M-8 0q8-13 16 0-8 13-16 0Z" strokeWidth=".75"/><circle r="1.65" fill={p.enamel} stroke="none"/></g>)}</g>)}<ellipse cx="180" cy="33" rx="39" ry="29" fill={p.ink} stroke={foil} strokeWidth="2.2"/><ellipse cx="180" cy="33" rx="34" ry="24.5" strokeDasharray="1 2"/><g transform="translate(180 32) scale(.73)">{icon}</g></g>;
 if(variant===8)return <g><rect width="360" height="66" fill={p.ink}/><StarsMap p={p} w={360} h={66}/><circle cx="180" cy="33" r="27" fill={p.ink} stroke={p.metal} strokeWidth=".9"/><g transform="translate(180 33) scale(.77)">{icon}</g><Spark x={203} y={18} r={3} color={p.paper}/></g>;
 return <g><rect width="360" height="66" fill={p.paper}/><path d="M0 4H360M0 61H360M0 7H360M0 58H360" fill="none" stroke={p.metal} strokeWidth=".75"/>{[0,1].map(side=><g key={side} transform={side?'translate(360) scale(-1 1)':undefined}><g transform="translate(8 13) scale(.85)"><ScrollCorner p={p}/></g><path d="M52 34H136m-62 3h47" stroke={p.metal}/>{diamonds({n:3,cx:138,cy:34,step:5,p})}</g>)}<g transform="translate(180 33) scale(.73)">{icon}</g></g>;
}
/** Fixed-coordinate formal seasonal illustrations. Parents may contain
 * a tile or repeat it horizontally; all geometry, including linework, scales uniformly. */
export function ElegantSeasonalArt({motif,variant,placement,className}:{motif:ThemeMotif;variant:number;placement:Placement;className?:string}){
 const id='seasonal-foil-'+useId().replace(/[^a-z\d_-]/gi,'');const [ink,enamel,metal,paper]=colors[motif]||['#243c4d','#925042','#c8a271','#fff5dc'];
 const p={ink,enamel,metal,paper},foil=`url(#${id})`,head=placement==='header';
 return <svg className={className} viewBox={head?'0 0 360 66':'0 0 240 158'} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" data-art-family="elegant" data-occasion={motif} data-edition={variant}>
  <defs><linearGradient id={id} x1="0%" y1="5%" x2="100%" y2="85%"><stop stopColor={metal}/><stop offset=".25" stopColor={paper}/><stop offset=".46" stopColor={metal}/><stop offset=".7" stopColor={paper}/><stop offset="1" stopColor={metal}/></linearGradient></defs>
  {head?<HeaderArt motif={motif} variant={variant} p={p} foil={foil}/>:<CardArt motif={motif} variant={variant} p={p} foil={foil}/>}
 </svg>;
}
