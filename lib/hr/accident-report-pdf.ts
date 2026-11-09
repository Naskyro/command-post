import {jsPDF} from 'jspdf';
import type {MedicalCase,MedicalReport} from './accident-reports';

/** Render the complete, immutable statement locally; no medical text goes to a conversion service. */
export function accidentReportPdf(record:MedicalCase,report:MedicalReport):Uint8Array{
 const pdf=new jsPDF({unit:'pt',format:'letter'}),margin=46,width=520,bottom=736;let y=48;
 const plain=(s:string)=>s.replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/\u2026/g,'...');
 function line(value:string,size=10,bold=false){pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);const rows=pdf.splitTextToSize(plain(value),width) as string[];for(const row of rows){if(y+size+5>bottom){pdf.addPage();y=48;}pdf.text(row,margin,y);y+=size+5;}}
 function field(label:string,value:string){if(!value)return;y+=7;line(label,9,true);line(value);}
 line('COMMAND | CONFIDENTIAL ACCIDENT REPORT',16,true);line('Driver statement and acknowledgment',11);y+=8;
 field('Claim',record.title);field('Claim reference',record.claimKey);field('Driver',report.driverName);field('Accident date',report.accidentOn||'Not recorded');
 field('Report',report.kind+(report.week?' - Week '+report.week:''));field('Report received on',report.reportedOn);field('Prepared by',report.preparedBy.name+' | '+report.preparedBy.at);field('Source',report.source);
 field('Response',report.response);field('Statement in the person’s own words / separate observation',report.statement||'No additional statement entered.');field('First noticed on (if reported)',report.firstNoticedOn);field('Assistance requested',report.assistance);field('Work limitations reported',report.workRestrictions);
 field('Driver acknowledgment',report.acknowledgment);
 field('Report identity',report.id);field('Report fingerprint (SHA-256)',report.reportHash);
 if(report.signature){const s=report.signature;field('Signature method',s.method);field('Signed by',s.signerName+' | Driver ID: '+s.signerId);field('Signed at / on',s.signedAt);field('Recorded by',s.recordedBy.name+' | '+s.recordedAt);if(s.electronicConsent)field('Electronic signing choice',s.electronicConsent);if(s.file)field('Signed original',s.file.name+' | SHA-256: '+s.file.sha256);}
 else {field('Current signature status',report.signatureStatus);y+=17;line('Driver printed name: _______________________________________');y+=12;line('Driver signature: __________________________________________');y+=12;line('Signature date: ___________________________________________');line('Keep all pages together. Upload the complete signed copy to this report.',9);}
 for(const disposition of report.dispositions)field('Signature-status record',disposition.status+' | '+disposition.by.name+' | '+disposition.by.at+'\n'+disposition.note);
 const total=pdf.getNumberOfPages();for(let p=1;p<=total;p++){pdf.setPage(p);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.text('Confidential medical record | Report '+report.id,margin,763);pdf.text('Page '+p+' of '+total,566,777,{align:'right'});}
 return new Uint8Array(pdf.output('arraybuffer'));
}
