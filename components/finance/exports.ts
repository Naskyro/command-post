import {FinRecord,PayLine,money} from '@/lib/finance/model';
export async function exportExcel(title:string,rows:Record<string,unknown>[]){
 const ExcelJS=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='Command Post';const sheet=book.addWorksheet(title.slice(0,31));
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>!['lines','version'].includes(k));sheet.columns=keys.map(key=>({header:key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()),key,width:key==='description'||key==='source'?55:24}));
 rows.forEach(row=>sheet.addRow(Object.fromEntries(keys.map(key=>[key,typeof row[key]==='object'?JSON.stringify(row[key]):row[key]]))));sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF193B58'}};sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:Math.max(1,keys.length)}};
 download(new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),title+'.xlsx');
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportPdf(title:string,rows:Record<string,unknown>[]){
 const {jsPDF}=await import('jspdf');const doc=new jsPDF();let y=22;doc.setFontSize(18);doc.text(title,15,y);y+=9;doc.setFontSize(10);doc.text('Galindo\'s Towing & Transport LLC | Parking & Towing Enforcement',15,y);y+=7;doc.text('Generated '+new Date().toLocaleString('en-US'),15,y);y+=10;
 for(const row of rows){for(const [key,value] of Object.entries(row)){if(value===undefined||value===null||value===''||['version','id','kind'].includes(key))continue;const label=key.replace(/([A-Z])/g,' $1');const text=doc.splitTextToSize(`${label}: ${typeof value==='object'?JSON.stringify(value):String(value)}`,180);for(const line of text){if(y>280){doc.addPage();y=18;}doc.text(line,15,y);y+=5;}}y+=5;if(y>275){doc.addPage();y=18;}}
 doc.save(title+'.pdf');
}
export async function exportPaystub(line:PayLine,run:FinRecord,records:FinRecord[]){
 const year=String(run.date).slice(0,4);const prior=records.filter(r=>r.kind==='payrun'&&r.id!==run.id&&String(r.date).startsWith(year)&&String(r.date)<String(run.date)&&r.status==='Released').flatMap(r=>(r.lines as Record<string,unknown>[])||[]).filter(l=>l.person===line.person);
 const rows:Record<string,unknown>[]=[{employee:line.name,period:line.period+' through '+line.periodEnd,payday:run.date,status:run.status==='Released'?'Released for payment':'Draft payroll statement',hours:line.hours,overtimeHours:line.overtime,grossWages:money(line.gross),taxes:money(line.withheld),deductions:money(line.deducted),taxableTruckCredit:money(line.noncash),reimbursements:money(line.reimbursed),netWages:money(line.net),totalPayment:money(line.payment),recordedYtdGross:money(prior.reduce((s,l)=>s+Number(l.gross||0),line.gross)),recordedYtdTax:money(prior.reduce((s,l)=>s+Number(l.withheld||0),line.withheld))}];
 rows.push({federalIncomeTax:money(line.taxDetail?.federal),socialSecurity:money(line.taxDetail?.socialSecurity),medicare:money(line.taxDetail?.medicare),stateLocalWithholding:money(line.taxDetail?.stateTax)});
 for(const r of line.details||[]){rows.push({type:r.kind,label:r.name||r.description||r.type,category:r.category,amount:money(r.appliedAmount??r.amount),source:r.source});}
 rows.push({note:'YTD includes Command Post released runs. Historical payroll must be reconciled before year-end reporting.'});await exportPdf(`Paystub - ${line.name} - ${run.date}`,rows);
}
