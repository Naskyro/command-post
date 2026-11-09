// Shared by the screen and tests. Null means that a source did not furnish a value.
// A missing interval breaks a line, including when both neighboring values are zero.
export function numeric(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v);}
export function lineSegments<T>(rows:T[],get:(row:T,index:number)=>{x:number;y:number}|null){
 const paths:{x:number;y:number}[][]=[];let segment:{x:number;y:number}[]=[];
 rows.forEach((r,i)=>{const hit=get(r,i);if(!hit){if(segment.length)paths.push(segment);segment=[];}else segment.push(hit);});
 if(segment.length)paths.push(segment);return paths;
}
export function axisBounds(values:(number|null)[],integerOnly=false){
 const known=values.filter(numeric);const low=Math.min(0,...known),high=Math.max(0,...known),span=high-low||1;
 const rough=span/4;const magnitude=10**Math.floor(Math.log10(rough));const steps=[1,2,2.5,5,10].map(s=>s*magnitude);
 const rawStep=steps.find(s=>s>=rough)||magnitude*10;
 const step=integerOnly?Math.max(1,Math.ceil(rawStep)):rawStep;
 const min=Math.floor(low/step)*step,max=Math.max(min+step,Math.ceil(high/step)*step);
 return {min,max,ticks:Array.from({length:1+Math.round((max-min)/step)},(_,i)=>min+i*step)};
}
