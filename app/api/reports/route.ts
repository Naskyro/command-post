import {NextRequest,NextResponse} from 'next/server';
import {financeDb} from '@/db/finance';
import {allRecords,identify} from '@/lib/finance/server';
import {canAccess} from '@/lib/finance/access';
import {visible} from '@/lib/finance/visibility';
import {displayPersonName} from '@/lib/people/display-name';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {hrCatalog,hrReportPeople,runHrReport,hrRecruitingDepartments} from '@/lib/reports/hr';
import {financeCatalog,runFinanceReport} from '@/lib/reports/finance';
import {queryFilters,queryView,reportName} from '@/lib/reports/inputs';
import {buildCustomView} from '@/lib/reports/custom-view';
import type {ReportArea,ReportDefinition,SavedReport,ReportFilters} from '@/lib/reports/types';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers});
async function session(req:NextRequest,area:unknown){
 if(area!=='hr'&&area!=='finance')throw new AppError('Choose a report area.');
 const records=await allRecords(),v=identify(records,req.headers);
 if(!canAccess(v,area==='hr'?'People & HR':'Finance',area==='hr'?'reports':'Reports & Taxes')||v.onboardingOnly)throw new ForbiddenError();
 return {v,records,area:area as ReportArea,catalog:area==='hr'?hrCatalog(v,records):financeCatalog(v,records)};
}
type Ctx=Awaited<ReturnType<typeof session>>;
function definition(ctx:Ctx,id:unknown){const def=ctx.catalog.find(x=>x.id===id);if(!def)throw new ForbiddenError('This report is unavailable for your access level.');return def;}
async function filterOptions(ctx:Ctx,def?:ReportDefinition){
 if(!def)return {departments:[],people:[]};
 const {v,records,area}=ctx,person=def.filters?.includes('person'),dept=def.filters?.includes('department');
 if(!person&&!dept)return {departments:[],people:[]};
 const eligible=area==='hr'?hrReportPeople(v,records,def.id):visible(v,records.filter(p=>p.kind==='person'||p.kind==='department')).filter(p=>p.kind==='person'&&!p.isSample);
 const people=person?eligible.map(p=>({id:p.id,name:displayPersonName(p)||String(p.name||p.id)})).sort((a,b)=>a.name.localeCompare(b.name)):[];
 const departments=new Set(eligible.map(p=>String(p.department||'')).filter(Boolean));
 if(def.group==='Recruiting'&&dept)return {people:[],departments:await hrRecruitingDepartments(v,records)};
 return {departments:dept?[...departments].sort((a,b)=>a.localeCompare(b)):[],people};
}
function canExport({v,records,area}:Ctx,def?:ReportDefinition){
 if(area==='finance'||v.owner)return true;
 if(!v.hrResponsibilities?.some(g=>g.action==='exportPersonnel'))return false;
 if(!def||def.group==='Recruiting')return true;
 return hrReportPeople(v,records,def.id,true).length>0;
}
function run(ctx:Ctx,def:ReportDefinition,f:ReportFilters,exporting=false){return ctx.area==='hr'?runHrReport(ctx.v,ctx.records,def.id,f,exporting):runFinanceReport(ctx.v,ctx.records,def.id,f);}
async function list(ctx:Ctx):Promise<SavedReport[]>{
 const res=await financeDb().prepare('SELECT id,name,report_id,payload FROM report_presets WHERE person_id=? AND area=? ORDER BY updated_at DESC,id').bind(ctx.v.person,ctx.area).all<{id:string;name:string;report_id:string;payload:string}>();
 const ids=new Set(ctx.catalog.map(d=>d.id));return res.results.filter(r=>ids.has(r.report_id)).map(r=>({...JSON.parse(r.payload),id:r.id,name:r.name,reportId:r.report_id}));
}
export async function GET(req:NextRequest){try{
 const params=req.nextUrl.searchParams,ctx=await session(req,params.get('area')),id=params.get('id');
 if(!id)return json({catalog:ctx.catalog,saved:await list(ctx),options:await filterOptions(ctx),canExport:canExport(ctx)});
 const def=definition(ctx,id),f=queryFilters(Object.fromEntries([...params].filter(([k])=>!['area','id'].includes(k))),def);
 return json({report:await run(ctx,def,f),options:await filterOptions(ctx,def),canExport:canExport(ctx,def)});
}catch(e){const f=safeFailure(e,'reports.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')&&new URL(req.headers.get('origin')!).origin!==req.nextUrl.origin)throw new ForbiddenError('Cross-origin request rejected.');
 const body=await readPayload(req),ctx=await session(req,body.area),db=financeDb();
 if(body.action==='delete'){if(typeof body.id!=='string'||body.id.length>100)throw new AppError('Choose a saved report.');
 await db.prepare('DELETE FROM report_presets WHERE person_id=? AND area=? AND id=?').bind(ctx.v.person,ctx.area,body.id).run();return json({saved:await list(ctx)});}
 if(body.action!=='save'&&body.action!=='export')throw new AppError('Choose a supported report action.');
 const def=definition(ctx,body.reportId),f=queryFilters(body.filters,def),exporting=body.action==='export';
 if(exporting&&!canExport(ctx,def))throw new ForbiddenError('Your report access does not include exporting these records.');
 const result=await run(ctx,def,f,exporting),view=queryView(body,result,def.visual),name=reportName(body.name??(exporting?def.title:''));
 if(!exporting){const p=await db.prepare('INSERT INTO report_presets(id,person_id,area,name,report_id,payload,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM report_presets WHERE person_id=? AND area=?)<100').bind(crypto.randomUUID(),ctx.v.person,ctx.area,name,def.id,JSON.stringify({...view,filters:f}),new Date().toISOString(),ctx.v.person,ctx.area).run();if(!p.meta.changes)throw new AppError('You have 100 saved reports here. Remove an old report before saving another.');return json({saved:await list(ctx)});}
 if(body.format!=='xlsx'&&body.format!=='pdf')throw new AppError('Choose PDF or Excel.');
 const projection=buildCustomView(result,view),now=new Date().toISOString(),meta={area:ctx.area,filters:f,visual:view.visual,generated:now},render=await import('@/lib/reports/files');
 const file=await (body.format==='pdf'?render.makeReportPdf:render.makeReportXlsx)(name,projection,meta);
 await db.prepare('INSERT INTO finance_audit(id,record_id,actor,actor_id,at,reason,before,after) VALUES(?,?,?,?,?,?,NULL,?)').bind(crypto.randomUUID(),'report:'+ctx.area+':'+def.id,ctx.v.name,ctx.v.id,now,'Exported '+def.title,JSON.stringify({format:body.format,rows:projection.rows.length})).run();
 const filename=('Command-'+name.replace(/[^a-zA-Z0-9]+/g,'-').replace(/-+$/,'')+'-'+now.slice(0,10)+'.'+body.format);
 return new Response(new Uint8Array(file).buffer,{headers:{...headers,'Content-Type':body.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="'+filename+'"'}});
}catch(e){const f=safeFailure(e,'reports.write');return json(f.body,f.status);}}
