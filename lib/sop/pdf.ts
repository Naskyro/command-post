// Private server-side renderer. Do not import this module in a client component.
// Unit: PDF points, top-down on US Letter. All layout measurements were taken
// from the supplied November SOPs. The original import is served byte-for-byte.
import { jsPDF } from 'jspdf';
import { pdfAssets } from './pdf-assets';

export interface SopPdfInput {
 reference:string;title:string;topicLabel:string;shortName?:string;policyOwner?:string;
 preparedDate?:string;effectiveDate?:string;revision?:string;approvalStatus?:string;revisedBy?:string;publishedAt?:string;
 guide?:'employee'|'management';sections:{heading:string;text:string;guide?:'employee'|'management'}[];related?:{reference:string;title:string}[];
 status?:'draft'|'published'|'archived';originalReference?:string;
}
type Font='regular'|'bold'|'light'|'heavy';
const dateText=(v?:string,month=false)=>{
 if(!v)return '';const key=v.match(/^\d{4}-\d\d-\d\d/);if(!key)return v;
 const dt=new Date(key[0]+'T12:00:00Z');return isNaN(+dt)?v:new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',...(month?{}:{day:'numeric'}),timeZone:'UTC'}).format(dt);
};

export async function generateSopPdf(input:SopPdfInput):Promise<Uint8Array>{
 const d=new jsPDF({orientation:'portrait',unit:'pt',format:'letter',compress:true,putOnlyUsedFonts:true});
 const black='#363636',ink='#444444',muted='#6c6c6c',bar='#e5e6e7',cell='#f2f2f4',white='#ffffff';
 for(const f of ['regular','bold','light','heavy'] as Font[]){d.addFileToVFS(f+'.ttf',pdfAssets[f]);d.addFont(f+'.ttf','PolicyLato',f);}
 const draft=input.status==='draft',legacy=input.originalReference==='ALL-031';
 const ref=input.reference||'',short=input.shortName||'',topic=input.topicLabel||'',title=input.title||'Untitled SOP',eff=dateText(input.effectiveDate);
 const series=ref.replace(/-?\d+$/,'');const label=topic.endsWith('('+series+')')?topic:topic+(series?' ('+series+')':'');
 const prepared=dateText(input.preparedDate),revision=input.revision||'',status=input.approvalStatus||(draft?'Draft — Not Issued':input.status==='archived'?'Archived':'Published');
 const statusTag=draft?'DRAFT — NOT FOR ISSUE':input.status==='archived'?'ARCHIVED — SUPERSEDED':'PUBLISHED SOP';
 const guideTitle=input.guide==='employee'?'Employee Guide':input.guide==='management'?'Employee and Management Guides':'';
 const code=[ref,short].filter(Boolean).join('  /  ');
 let y=0,pages=1;
 const font=(style:Font,size:number,color=ink)=>{d.setFont('PolicyLato',style);d.setFontSize(size);d.setTextColor(color);};
 const put=(s:string,x:number,base:number,st:Font='regular',sz=9.45,c=ink,align:'left'|'right'|'center'='left')=>{font(st,sz,c);d.text(s,x,base,{align});};
 function wrapped(s:string,w:number,st:Font,sz:number){font(st,sz);return d.splitTextToSize(s,w) as string[];}
 const rect=(x:number,top:number,w:number,h:number,c:string)=>{d.setFillColor(c);d.rect(x,top,w,h,'F')};
 const line=(top:number,width=.5)=>{d.setDrawColor('#dcdddf');d.setLineWidth(width);d.line(54,top,558,top)};
 function fitted(s:string,w:number,st:Font,sz:number){font(st,sz);return sz*Math.min(1,w/Math.max(1,d.getTextWidth(s)));}
 function footer(){line(legacy?753:750);const left=[ref,short,eff?(draft?'TARGET ':'EFFECTIVE ')+eff.toUpperCase():''].filter(Boolean).join('  |  ');put(left,54,766,'bold',fitted(left,313,'bold',7.2),muted);const marker=[input.guide==='management'?'MANAGEMENT COPY':input.guide==='employee'?'EMPLOYEE COPY':'',statusTag,'PAGE '+String(pages).padStart(2,'0')].filter(Boolean).join('   •   ');put(marker,558,766,'bold',fitted(marker,185,'bold',7.1),muted,'right');}
 function page(){d.addPage();pages++;put('PARKING & TOWING ENFORCEMENT',54,35,'bold',9,black);put(code,558,35,'bold',fitted(code,270,'bold',8.5),black,'right');let rows=wrapped(title,504,'regular',8.5);rows.forEach((s,i)=>put(s,54,51+i*11,'regular',8.5,muted));const extra=(rows.length-1)*11;line(61+extra,1);footer();y=(legacy?75:78)+extra;}
 const ensure=(h:number)=>{if(y+h>736)page()};
 const section=(s:string)=>{const lines=wrapped(s,476,'bold',11.1),h=(legacy?21.5:24)+(lines.length-1)*14;ensure(h+35);rect(54,y,504,h,bar);lines.forEach((l,i)=>put(l,67,y+(legacy?15.2:16.1)+14*i,'bold',11.1,black));y+=h+7;};
 function para(s:string,sz=10.2,color=ink,gap=7){const step=sz>10?13.6:sz>9?12.4:sz>8?11.2:10.4;for(const block of s.trim().split(/\n+/)){if(!block.trim())continue;const lines=wrapped(block.trim(),504,'regular',sz);for(const l of lines){ensure(step);put(l,54,y+sz,'regular',sz,color);y+=step;}y+=gap;}}
 function row(cells:string[],procedure:boolean,header=false){const cols=cells.length,widths=cols===2?[134,370]:cols===4?[85,80,231,108]:legacy?[119,327,58]:[80,355,69],offsets=widths.map((_,i)=>54+widths.slice(0,i).reduce((a,b)=>a+b,0));const sz=cols===2?9.45:header?(legacy?8.9:9.3):8.4,step=cols===2?12.4:11.2,pad=legacy?(cols===2?4:6):10;
  const matrix=cells.map((v,i)=>wrapped(v.trim(),widths[i]-12,header||procedure&&i===0?'bold':'regular',sz));let n=Math.max(...matrix.map(v=>v.length)),i=0;
  while(i<n){ensure(step+11);const fits=Math.max(1,Math.min(n-i,Math.floor((736-y-11)/step)));if(header)rect(54,y,504,fits*step+pad,cell);for(let j=0;j<fits;j++){matrix.forEach((lines,k)=>{if(lines[i+j])put(lines[i+j],offsets[k]+(procedure?4:6),y+pad/2+sz+j*step,header||procedure&&k===0?'bold':'regular',sz,header||procedure&&k===0?black:ink);});}y+=fits*step+pad;if(!procedure)line(y,.35);i+=fits;if(i<n)page();}
 }
 // Masthead, band and logo: use the supplied artwork, with no redesign.
 put('STANDARD',306,42,'light',31,black,'center');put('OPERATING PROCEDURE',306,82,'heavy',35,black,'center');
 rect(0,104,612,91,'#3a3a3a');d.addImage('data:image/png;base64,'+pdfAssets.logo,'PNG',54,111.5,141,70.5);
 put("GALINDO'S TOWING & TRANSPORT LLC",227,133,'bold',10,white);put('DBA Parking & Towing Enforcement',227,148,'regular',9,white);
 const bandTopic=legacy?'ALL PERSONNEL  /  ALL DEPARTMENTS':topic.toUpperCase().replace(/\s*\([^)]*\)$/,'');put(bandTopic,227,170,'bold',fitted(bandTopic,330,'bold',8.2),white);
 const edition=dateText(input.effectiveDate||input.preparedDate,true);put('Controlled SOP Library'+(edition?'  •  '+edition:''),227,183,'regular',8.2,white);
 footer();y=legacy?232.2:226.2;const tw=wrapped(title,504,'bold',21.2);for(const t of tw){if(y>705){page();y+=21;}put(t,54,y,'bold',21.2,black);y+=24.7;}
 const sub=legacy?['Company-Wide Policy',label,short].filter(Boolean).join(' | '):[label,short,guideTitle||(draft?'Guidance Draft':'Completed SOP')].filter(Boolean).join(' | ');
 const sw=wrapped(sub,504,'regular',9.3);y-=6.9;for(const s of sw){put(s,54,y,'regular',9.3,muted);y+=12;}y+=3.2;
 const values=input.guide==='employee'?[[eff,code,'All Employees'],[revision,'Employee Guide',status]]:[[prepared,code,input.policyOwner||''],[eff,revision,status]];
 const labels=input.guide==='employee'?[['Effective Date','SOP Number / Short Name','Applies To'],['Revision Number','Guide','Approval Status']]:[[legacy?'Date Issued':'Date Prepared','SOP Number / Short Name',draft?'Decision Owner':'Policy Owner'],[draft?'Target Effective Date':'Effective Date','Revision Number','Approval Status']];
 for(let i=0;i<2;i++){let h=0;const vv=values[i].map(v=>wrapped(v,142,'regular',9.45));const lh=legacy?19:24;h=lh+24.4+Math.max(0,...vv.map(v=>v.length-1))*12.4;ensure(h);
  for(let c=0;c<3;c++){const x=54+c*173;rect(x,y,158,lh,cell);put(labels[i][c],x+8,y+14.3,'bold',9.3,black);vv[c].forEach((l,k)=>put(l,x+8,y+lh+14.5+k*12.4,'regular',9.45,ink));}y+=h;
 }
 if(input.revisedBy&&input.publishedAt){
  const shown=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Chicago',timeZoneName:'short'}).format(new Date(input.publishedAt));
  const stamp='Last Revised By: '+input.revisedBy+'  •  '+shown;
  const ls=wrapped(stamp,488,'bold',8.6),h=ls.length*11+12;ensure(h+8);rect(54,y,504,h,cell);
  ls.forEach((text,i)=>put(text,62,y+13+i*11,'bold',8.6,muted));y+=h;
 }y+=16;
 // A printed management copy explains the employee standard first, then separates
 // the manager-only decision material. The employee document contains no hidden layers.
 const sections=input.guide?[...input.sections.filter(s=>s.guide==='employee'),...(input.guide==='management'?input.sections.filter(s=>s.guide==='management'):[])]:[...input.sections];
 let lastGroup:undefined|'employee'|'management';
if(input.related?.length)sections.push({heading:'Related SOPs',text:input.related.map(r=>[r.reference,r.title].filter(Boolean).join(' | ')).join('\n')});
 for(const s of sections){const heading=s.heading.trim(),body=s.text.trim();if(!heading||!body||(/^Original Vehicle Damage Claim Flowchart$/i.test(heading)&&input.originalReference==='CCR-001'))continue;
  if(input.guide&&s.guide&&s.guide!==lastGroup){
   if(lastGroup==='employee'&&s.guide==='management')page();
   ensure(80);put(s.guide==='management'?'MANAGEMENT GUIDE':'EMPLOYEE GUIDE',54,y+9,'heavy',9.2,black);y+=19;lastGroup=s.guide;
  }
  if(!input.guide&&/^Responsibilities$/i.test(heading)&&pages===1)page();section(heading);
  const isProc=/^Procedure$/i.test(heading),isTable=/^(Responsibilities|Procedure|Corrective Action References|Related SOPs|Revision History|Decision Record)$/i.test(heading);
  if(isTable&&body.split('\n').some(l=>l.includes(' | '))){for(const l of body.split('\n').filter(Boolean)){const c=l.split(/\s+\|\s+/);if(c.length>=2&&c.length<=4)row(c,isProc,/^(Reference|Date)$/i.test(c[0]));else para(l,9.45);}y+=7;}
  else {const type=/^Purpose$|^Scope$|^Policy Standard$|^Issue Status$|^Decision to Resolve$|^Proposed Scope$/i.test(heading)?10.2:/Source References/i.test(heading)?7.7:/References|Definitions|Boundaries/i.test(heading)?8.4:9.45;para(body,type,type<9?muted:ink,6);y+=8;}
 }
 if(input.originalReference==='CCR-001'){
  page();section('Original Vehicle Damage Claim Flowchart');
  const intro='Preserved unchanged from the uploaded Vehicle Damage Claim SOP. Named assignments reflect that source; approved changes must update the written SOP and companion chart together.';wrapped(intro,504,'regular',8.4).forEach((l,i)=>put(l,54,y+8.4+11.2*i,'regular',8.4,muted));
  d.addImage('data:image/png;base64,'+pdfAssets.flowchart,'PNG',54,135,504,527.22);
  paraAtFooter();
 }
 function paraAtFooter(){const note='Source: S03, page 1. This figure does not authorize deductions, release delays or an unapproved insurance position; those decisions are held separately in CCR-002/003/004.';wrapped(note,504,'regular',8.4).forEach((l,i)=>put(l,54,679+11.2*i,'regular',8.4,muted));}
 d.setProperties({title:ref+' — '+title,author:"Galindo's Towing & Transport LLC",subject:[topic,guideTitle].filter(Boolean).join(' — '),creator:'Command · SOP Library'});return new Uint8Array(d.output('arraybuffer'));
}
