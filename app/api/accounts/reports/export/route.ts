import {NextRequest,NextResponse} from 'next/server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {financeDb} from '@/db/finance';
import type {Viewer} from '@/lib/finance/model';
import {loadPortfolioReport} from '@/lib/accounts/portfolio-reports-server';
import {fileTypes,exportName,publishedProjection,prepareExport} from '@/lib/accounts/report-export-model';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 const b=await readPayload(req),f=b.format;if(f!=='pdf'&&f!=='pptx'&&f!=='xlsx')throw new AppError('Choose PDF, Excel, or PowerPoint.');
 if(typeof b.query!=='string'||b.query.length>3500)throw new AppError('Choose a valid report and filters.');
 const q=new URLSearchParams(b.query);if(!q.get('id'))throw new AppError('Select a report first.');
 const actor:{viewer?:Viewer}={};const data=await loadPortfolioReport(req,q,v=>{actor.viewer=v});
 if(!('rows' in data)||!actor.viewer)throw new ForbiddenError();
 const resultView=prepareExport(data,b.view);let file:Uint8Array;
 if(f==='pptx')file=await (await import('@/lib/accounts/report-export-pptx')).makePortfolioPresentation(resultView);
 else{const {meta,result}=publishedProjection(resultView);const r=await import('@/lib/reports/files');file=await(f==='pdf'?r.makeReportPdf:r.makeReportXlsx)(data.title,result,meta);}
 await financeDb().prepare('INSERT INTO finance_audit(id,record_id,actor,actor_id,at,reason,before,after) VALUES(?,?,?,?,?,?,NULL,?)').bind(crypto.randomUUID(),'report:accounts:'+data.id,actor.viewer.name,actor.viewer.id,new Date().toISOString(),'Exported Confidential Portfolio Report',JSON.stringify({format:f,report:data.id,rows:data.rows.length})).run();
 return new Response(new Uint8Array(file).buffer,{headers:{...headers,'Content-Type':fileTypes[f],'Content-Disposition':'attachment; filename="'+exportName(data,f)+'"'}});
}catch(e){const f=safeFailure(e,'accounts.report.export');return NextResponse.json(f.body,{status:f.status,headers});}}
