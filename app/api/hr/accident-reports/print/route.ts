import {NextRequest,NextResponse} from 'next/server';
import {requestRoster} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {medicalCase,verifiedMedicalReport,auditMedicalAccess} from '@/lib/hr/accident-reports-server';
import {accidentReportPdf} from '@/lib/hr/accident-report-pdf';
import {ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function GET(req:NextRequest){try{
 if(req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const people=await requestRoster(),viewer=financeIdentity(req.headers,people),q=req.nextUrl.searchParams,record=await medicalCase(viewer,people,{caseId:q.get('caseId')}),report=verifiedMedicalReport(record,q.get('reportId'));
 const bytes=accidentReportPdf(record,report);await auditMedicalAccess(record,viewer,'Downloaded Report PDF');return new Response(bytes as BodyInit,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Accident_Report_'+report.id+'.pdf"','Content-Security-Policy':"sandbox; default-src 'none'"}});
}catch(e){const f=safeFailure(e,'hr.accident-reports.print');return NextResponse.json(f.body,{status:f.status,headers});}}
