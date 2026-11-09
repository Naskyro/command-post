import { jsPDF } from 'jspdf';
import {reportBrand} from './brand-assets';
import {displayValue,reportMetadata,type ReportFileMeta} from './files';
import type {ChartKind,ChartPoint,ReportColumn,ReportResult,ReportRow} from './types';

export async function renderReportPdf(title:string,result:ReportResult,meta:ReportFileMeta):Promise<Uint8Array>{
 const doc=new jsPDF({unit:'pt',format:'letter',compress:true,putOnlyUsedFonts:true});
 const left=54,right=558,width=504,limit=734,ink='#363636',muted='#67696b',band='#3a3a3a',gray='#e5e6e7';
 const p=reportMetadata(meta),area=p[0][1],stamp=p[1][1];
 const sz=(v:number,weight:'regular'|'bold'|'light'|'heavy'='regular',color=ink)=>{doc.setFont('ReportLato',weight);doc.setFontSize(v);doc.setTextColor(color);};
 for(const key of ['regular','bold','light','heavy'] as const){doc.addFileToVFS(key+'.ttf',reportBrand[key]);doc.addFont(key+'.ttf','ReportLato',key);}
 const text=(s:string,x:number,y:number,align:'left'|'center'|'right'='left')=>doc.text(s,x,y,{align});
 const fill=(color:string,x:number,y:number,w:number,h:number)=>{doc.setFillColor(color);doc.rect(x,y,w,h,'F');};
 const line=(x1:number,y1:number,x2:number,y2:number,color='#d8d9db',n=.5)=>{doc.setDrawColor(color);doc.setLineWidth(n);doc.line(x1,y1,x2,y2);};
 const wrap=(s:string,w:number)=>doc.splitTextToSize(s,w) as string[];
 const fit=(s:string,w:number)=>{if(doc.getTextWidth(s)<=w)return s;let v=s;while(v.length&&doc.getTextWidth(v+'…')>w)v=v.slice(0,-1);return v+'…';};
 let y=0;
 function next(){doc.addPage();sz(9,'bold');text('PARKING & TOWING ENFORCEMENT',left,35);sz(8.5,'bold',muted);text(fit(area.toUpperCase(),200),right,35,'right');sz(9,'regular',muted);text(fit(title,width),left,51);line(left,61,right,61);y=78;}
 function ensure(n:number){if(y+n>limit)next();}
 function para(s:string,style:'regular'|'bold'='regular',size=10,color=ink){sz(size,style,color);const blocks=wrap(s,width);for(const t of blocks){ensure(size+4);sz(size,style,color);text(t,left,y+size);y+=size+4;}y+=5;}
 function banner(s:string){ensure(65);fill(gray,left,y,width,24);sz(11,'bold');text(s,left+10,y+16);y+=30;}
 // First-page geometry, original type, logo, charcoal band and footer parallel the controlled SOP template.
 sz(31,'light');text('COMMAND',306,42,'center');sz(35,'heavy');text('OPERATIONS REPORT',306,82,'center');
 fill(band,0,104,612,91);doc.addImage('data:image/png;base64,'+reportBrand.logo,'PNG',left,111.5,141,70.5);
 sz(10,'bold','#ffffff');text("GALINDO'S TOWING & TRANSPORT LLC",227,133);
 sz(9,'regular','#ffffff');text('DBA Parking & Towing Enforcement',227,148);sz(8.2,'bold','#ffffff');text(fit(area.toUpperCase(),326),227,170);sz(8.2,'regular','#ffffff');text('Command Report Library',227,183);
 y=205;para(title,'bold',21);para('Generated '+stamp,'regular',9,muted);
 if(p.length>2)para(p.slice(2).map(([k,v])=>k+': '+v).join('   •   '),'regular',9);
 if(meta.confidential){banner('CONFIDENTIAL');para(meta.confidential,'regular',9);}
 if(result.metric)para(result.metric.label+': '+result.metric.value,'bold',12);
 if(result.note)para(result.note,'regular',9,muted);y+=4;
 const shade=['#007d79','#6860ad','#ad6818','#3476a3','#aa5473','#467d61','#8d6952','#548897','#949b9e'];
 function graph(kind:ChartKind,all:ChartPoint[]){
  const pts=all.filter(v=>Number.isFinite(v.value)&&(kind!=='scatter'||typeof v.x==='number'&&Number.isFinite(v.x)));
  if(kind==='table'||!pts.length)return;
  if(kind==='pie'&&!pts.some(v=>v.value>0))return;
  ensure(200);banner(kind==='line'?'Trend':kind==='scatter'?'Distribution':kind==='pie'?'Composition':'Comparison');
  if(kind==='pie'){
   const positive=pts.filter(v=>v.value>0),sum=positive.reduce((n,p)=>n+p.value,0),rows=positive.slice(0,7);
   if(positive.length>7)rows.push({label:'Other ('+(positive.length-7)+' categories)',value:positive.slice(7).reduce((n,p)=>n+p.value,0)});
   const cx=136,cy=y+61,r=49;let angle=-Math.PI/2;
   rows.forEach((q,i)=>{const span=q.value/sum*2*Math.PI,steps=Math.max(1,Math.ceil(span/.08));doc.setFillColor(shade[i%shade.length]);for(let j=0;j<steps;j++){const a=angle+j/steps*span,b=angle+(j+1)/steps*span;doc.triangle(cx,cy,cx+r*Math.cos(a),cy+r*Math.sin(a),cx+r*Math.cos(b),cy+r*Math.sin(b),'F');}angle+=span;
    const row=y+9+i*14;fill(shade[i%shade.length],219,row-6,7,7);sz(9);text(fit([q.series,q.label].filter(Boolean).join(' · '),257),232,row);sz(9,'bold');text((100*q.value/sum).toFixed(1)+'%',right-6,row,'right');
   });y+=128;
  }else if(kind==='bar'){
   const rows=pts.slice(0,8),lo=Math.min(0,...rows.map(q=>q.value)),hi=Math.max(0,...rows.map(q=>q.value)),domain=hi-lo||1,begin=247,span=224,zero=begin-lo/domain*span;
   rows.forEach((q,i)=>{const row=y+6+i*15,end=begin+(q.value-lo)/domain*span;sz(8.7);text(fit([q.series,q.label].filter(Boolean).join(' · '),181),left+4,row+4);line(zero,row-5,zero,row+6,'#888888');if(q.value)fill(shade[i%shade.length],Math.min(zero,end),row-4,Math.abs(end-zero),9);sz(9,'bold');text(fmt(q.value),right-4,row+4,'right');});y+=rows.length*15+10;
   if(pts.length>rows.length)para('Showing the first '+rows.length+' of '+pts.length+' chart values.','regular',8,muted);
  }else{
   const labels=[...new Set(pts.map(q=>q.label))],series=[...new Set(pts.map(q=>q.series||''))],indices=new Map(labels.map((s,i)=>[s,i])),legend=series.filter(Boolean).join('  /  ');
   const vals=pts.map(q=>q.value),xs=kind==='scatter'?pts.map(q=>q.x!):[0,labels.length-1],xmin=xs.reduce((a,b)=>Math.min(a,b),Infinity),xmax=xs.reduce((a,b)=>Math.max(a,b),-Infinity),ymin=vals.reduce((a,b)=>Math.min(a,b),0),ymax=vals.reduce((a,b)=>Math.max(a,b),0),top=y+7,base=y+105,ax=111,bx=540;
   const xp=(v:number)=>xmin===xmax?(ax+bx)/2:ax+(v-xmin)/(xmax-xmin)*(bx-ax),yp=(v:number)=>base-(v-ymin)/(ymax-ymin||1)*(base-top);
   for(let i=0;i<=3;i++){const val=ymin+(ymax-ymin||1)*i/3,yy=base-i*(base-top)/3;line(ax,yy,bx,yy);sz(8,'regular',muted);text(fmt(val),ax-7,yy+2,'right');}
   for(const [i,s] of series.entries()){let prior:ChartPoint|undefined;const color=shade[i%shade.length];for(const q of pts.filter(p=>p.series===s||(!p.series&&!s))){const x=xp(kind==='scatter'?q.x!:indices.get(q.label)!),yy=yp(q.value);if(kind==='line'&&prior&&indices.get(q.label)===indices.get(prior.label)!+1)line(xp(indices.get(prior.label)!),yp(prior.value),x,yy,color,1.4);doc.setFillColor(color);doc.circle(x,yy,2,'F');prior=q;}}
   sz(8,'regular',muted);text(fit(kind==='scatter'?fmt(xmin):labels[0],170),ax,base+13);if(xmax>xmin)text(fit(kind==='scatter'?fmt(xmax):labels.at(-1)!,170),bx,base+13,'right');y=base+22;
   if(legend)for(const [i,s] of series.entries()){const t=s||'Reported Value';ensure(13);fill(shade[i%shade.length],left+5,y+1,7,7);sz(8.6);text(fit(t,width-24),left+17,y+8);y+=13;}
  }y+=7;
 }
 function fmt(v:number){return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);}
 graph(meta.visual||'table',result.chart);
 function rowsBlock(heading:string,cols:ReportColumn[],rows:ReportRow[]){
  banner(heading+'  /  '+rows.length.toLocaleString('en-US')+(rows.length===1?' Record':' Records'));
  if(!rows.length){para('No records match this selection.','regular',10,muted);return;}
  if(!cols.length){para('No columns were selected.');return;}
  if(cols.length>6){
   rows.forEach((row,i)=>{ensure(43);sz(9,'bold',muted);text('RECORD '+String(i+1),left,y+9);y+=17;for(const c of cols){const v=displayValue(c,row[c.key]);if(v)para(c.label+': '+v,'regular',9);}line(left,y,right,y);y+=10;});return;
  }
  const weights=cols.map(c=>{sz(8.5,'bold');const h=doc.getTextWidth(c.label)+16;sz(9);const v=Math.max(0,...rows.slice(0,35).map(r=>doc.getTextWidth(displayValue(c,r[c.key]).slice(0,110))+12));return Math.max(45,Math.min(190,Math.max(h,v)));}),sum=weights.reduce((a,b)=>a+b,0),widths=weights.map(n=>n/sum*width),offsets=widths.map((_,i)=>left+widths.slice(0,i).reduce((a,b)=>a+b,0));
  const numeric=(c:ReportColumn)=>['money','percent','number'].includes(c.format||'');
  function head(){sz(8.4,'bold');const lines=cols.map((c,i)=>wrap(c.label,widths[i]-9)),h=Math.max(...lines.map(a=>a.length))*10+9;ensure(h+18);fill('#f0f1f2',left,y,width,h);lines.forEach((ls,i)=>ls.forEach((s,j)=>{sz(8.4,'bold');text(s,offsets[i]+4,y+11+j*10);}));y+=h;}
  head();for(const row of rows){sz(9);const lines=cols.map((c,i)=>wrap(displayValue(c,row[c.key]),widths[i]-9)),n=Math.max(1,...lines.map(a=>a.length));let index=0;if(n*11+8<=560&&y+n*11+8>limit){next();head();}
   while(index<n){if(y+20>limit){next();head();}const count=Math.max(1,Math.min(n-index,Math.floor((limit-y-8)/11)));sz(9);
    lines.forEach((ls,i)=>ls.slice(index,index+count).forEach((s,j)=>text(s,numeric(cols[i])?offsets[i]+widths[i]-4:offsets[i]+4,y+11+j*11,numeric(cols[i])?'right':'left')));y+=count*11+8;line(left,y,right,y);index+=count;if(index<n){next();head();}}
  }y+=14;
 }
 rowsBlock('Report Results',result.columns,result.rows);
 if(result.details)rowsBlock('Supporting Detail',result.details.columns,result.details.rows);
 const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);line(left,750,right,750);sz(7.2,'bold',muted);text(fit((meta.confidential?'CONFIDENTIAL   |   ':'')+area.toUpperCase()+'  |  '+stamp,330),left,766);text('COMMAND REPORT   •   PAGE '+String(i).padStart(2,'0')+' / '+String(pages).padStart(2,'0'),right,766,'right');}
 doc.setProperties({title,author:"Galindo's Towing & Transport LLC",subject:area,creator:'Command · Reports'});
 return new Uint8Array(doc.output('arraybuffer'));
}
