import {NextResponse} from 'next/server';
import {jsPDF} from 'jspdf';
import {context,certificateRecord} from '@/lib/school/server';
import {reportBrand} from '@/lib/reports/brand-assets';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function GET(r:Request){
 try{
  const ctx=await context(r),url=new URL(r.url),rec=await certificateRecord(ctx,url.searchParams.get('courseId')||'',url.searchParams.get('personId')||ctx.v.person);
  const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'letter',compress:true});
  for(const style of ['regular','bold'] as const){pdf.addFileToVFS('pte-certificate-'+style+'.ttf',reportBrand[style]);pdf.addFont('pte-certificate-'+style+'.ttf','PteCertificate',style)}
  const font=(size:number,style:'regular'|'bold'='regular')=>{pdf.setFont('PteCertificate',style);pdf.setFontSize(size)};
  const centered=(text:string,y:number,size:number,style:'regular'|'bold'='regular')=>{font(size,style);pdf.text(text,396,y,{align:'center'})};
  const wrapped=(text:string,y:number,size:number,minSize:number,maxLines:number,width:number,style:'regular'|'bold'='regular')=>{let lines:string[]=[];while(size>=minSize){font(size,style);lines=pdf.splitTextToSize(text,width);if(lines.length<=maxLines||size===minSize)break;size--;}pdf.text(lines,396,y,{align:'center',lineHeightFactor:1.25})};
  pdf.setFillColor('#f8f7f3');pdf.rect(0,0,792,612,'F');pdf.setDrawColor('#203a35');pdf.setLineWidth(2);pdf.rect(26,26,740,560);pdf.setLineWidth(.5);pdf.rect(34,34,724,544);
  pdf.addImage(reportBrand.logo,'PNG',326,49,140,70);
  pdf.setTextColor('#203a35');centered('PARKING & TOWING ENFORCEMENT',141,11,'bold');
  centered('Certificate of Completion',190,32,'bold');centered('School House recognizes',221,12);
  wrapped(rec.name,257,25,14,2,640,'bold');centered('for successfully completing',298,12);
  wrapped(rec.course.title,332,19,12,4,640,'bold');
  wrapped('Topic: '+rec.course.topic,419,11,9,2,640);
  const completed=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'long',day:'numeric'}).format(new Date(rec.progress.completedAt!));
  centered('Completed '+completed,465,12);
  if(url.searchParams.get('score')==='1'&&rec.progress.score!==undefined)centered('Exam Score: '+rec.progress.score+'%',487,12,'bold');
  pdf.setTextColor('#5c6763');centered('Company training completion · Not a government license or CE accreditation',534,8);
  wrapped('Record: '+rec.reference,552,7,6,2,680);
  return new Response(pdf.output('arraybuffer'),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="PTE-Certificate-of-Completion.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){const f=safeFailure(e,'school.certificate');return NextResponse.json(f.body,{status:f.status})}
}
