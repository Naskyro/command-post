import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {permittedReports} from '@/lib/ccr/reports-catalog';
import {loadCcrReport} from '@/lib/ccr/reports-server';
import {csvForReport,filteredLines,type Filters} from '@/lib/ccr/reports';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {realDay} from '@/lib/ccr/docket-model';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(req:NextRequest){try{const staff=await allRecords(),v=identify(staff,req.headers),id=req.nextUrl.searchParams.get('report');return NextResponse.json(id?await loadCcrReport(v,staff,id):{catalog:permittedReports(v)},{headers});}catch(e){const f=safeFailure(e,'ccr.reports.read');return NextResponse.json(f.body,{status:f.status,headers});}}
export async function POST(req:NextRequest){try{if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 const staff=await allRecords(),v=identify(staff,req.headers);permittedReports(v);const b=await readPayload(req);
 if(b.format!=='pdf'&&b.format!=='xlsx'&&b.format!=='csv')throw new AppError('Choose PDF, Excel, or CSV.');const inp=b.filters||{};if(typeof inp!=='object'||Array.isArray(inp))throw new AppError('Select valid filters.');const filter:Filters={};
 for(const k of ['from','to','q','group','status'] as const){const x=(inp as Record<string,unknown>)[k];if(x===undefined||x==='')continue;if(typeof x!=='string'||x.length>200||/[\u0000-\u001f]/.test(x)||((k==='from'||k==='to')&&!realDay(x)))throw new AppError('Select valid report filters.');filter[k]=x;}
 if(filter.from&&filter.to&&filter.from>filter.to)throw new AppError('The end date must follow the start date.');
 const data=await loadCcrReport(v,staff,String(b.report||'')),rows=filteredLines(data.rows,filter);
 if(b.format==='csv')return new Response(csvForReport(data,rows,filter),{headers:{...headers,'Content-Disposition':'attachment; filename="PTE-Confidential-'+data.report.id+'-'+data.today+'.csv"','Content-Type':'text/csv; charset=utf-8'}});
 const bytes=await (await import('@/lib/ccr/reports-export')).exportCcrReport(b.format,data,rows,filter);
 return new Response(bytes.slice().buffer,{headers:{...headers,'Content-Disposition':'attachment; filename="PTE-Confidential-'+data.report.id+'-'+data.today+'.'+b.format+'"','Content-Type':b.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
 }catch(e){const f=safeFailure(e,'ccr.reports.export');return NextResponse.json(f.body,{status:f.status,headers});}}
