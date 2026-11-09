import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {permittedReport} from '@/lib/ccr/reports-catalog';
import {docket} from '@/lib/ccr/docket-server';
import {analyzeHearings,hearingFilters} from '@/lib/ccr/hearing-analysis';
import {safeFailure,readPayload,ForbiddenError,AppError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
async function report(req:NextRequest,raw:Record<string,unknown>){const v=await requestViewer(req.headers);permittedReport(v,'tow-rulings');return analyzeHearings(await docket(v),hearingFilters(raw));}
export async function GET(req:NextRequest){try{return NextResponse.json(await report(req,Object.fromEntries(req.nextUrl.searchParams)),{headers});}catch(e){const f=safeFailure(e,'ccr.hearings.report');return NextResponse.json(f.body,{status:f.status,headers});}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();const b=await readPayload(req);if(!['pdf','xlsx','csv'].includes(String(b.format)))throw new AppError('Select an available export format.');const out=await report(req,(b.filters||{}) as Record<string,unknown>);const {makeHearingExport}=await import('@/lib/ccr/hearing-report-export');const {bytes,mime}=await makeHearingExport(out,String(b.format));return new Response(bytes.slice().buffer,{headers:{...headers,'Content-Type':mime,'Content-Disposition':'attachment; filename="PTE-Confidential-Court-Outcome-Analysis.'+b.format+'"'}});}catch(e){const f=safeFailure(e,'ccr.hearings.report.export');return NextResponse.json(f.body,{status:f.status,headers});}}
