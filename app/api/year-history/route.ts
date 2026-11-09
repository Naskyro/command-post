import {allRecords,identify} from '@/lib/finance/server';
import {businessToday,archiveViews,filterYear,type YearView} from '@/lib/year-history/model';
import {canOpenYearHistory} from '@/lib/year-history/access';
import {caseHistory} from '@/lib/year-history/cases';
import {workHistory} from '@/lib/year-history/work';
import {financeHistory} from '@/lib/year-history/finance';
import {yearMetrics,annualCsv} from '@/lib/year-history/summary';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
export async function GET(req:Request){
 try{
  const params=new URL(req.url).searchParams,mod=params.get('module')||'',day=businessToday(),cy=Number(day.slice(0,4)),year=Number(params.get('year')||cy),view=(params.get('view')||'activity') as YearView,q=(params.get('q')||'').trim(),kind=params.get('kind')||'';
  if(!Number.isInteger(year)||year<1900||year>cy||!archiveViews.includes(view)||q.length>180||kind.length>130)throw new AppError('Choose an available year and report view.');
  const records=await allRecords(),viewer=identify(records,req.headers);
  if(!canOpenYearHistory(viewer,mod))throw new ForbiddenError();
  const sources=mod==='Finance'?[financeHistory(viewer,records)]:mod==='Work Orders'?[workHistory(viewer,records,mod)]:mod==='Account Management'?[workHistory(viewer,records,mod),caseHistory(viewer,records,mod)]:[caseHistory(viewer,records,mod)];
  const {selected,...page}=filterYear((await Promise.all(sources)).flat(),{module:mod,view,year,kind,q,page:Number(params.get('page')||1)},day);
  if(params.get('format')==='csv')return new Response(mod==='Compliance, Claims & Recovery'?'\uFEFF"Confidential · Parking & Towing Enforcement — Internal Use Only"\r\n'+annualCsv(selected).replace(/^\uFEFF/,''):annualCsv(selected),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="command-'+mod.toLowerCase().replace(/[^a-z]+/g,'-')+'-'+year+'-'+view+'.csv"'}});
  const basis=view==='archive'?'Completed records filed by their completion year. Reopened work stays active.':view==='open-at-close'?'Work known to be open on December 31, using recorded start and close dates. Incomplete histories may be excluded.':view==='undated'?'All years: records missing an activity date or a reliable completion date.':'Records with a documented event during the selected year. Each record is counted once in this view.';
  return Response.json({...page,asOf:day,basis:basis+(mod==='Account Management'&&view!=='undated'?' Release totals include only completed courtesy and discounted releases dated in this year.':''),metrics:yearMetrics(selected,mod,view,year)},{headers});
 }catch(e){const f=safeFailure(e,'year-history.read');return Response.json(f.body,{status:f.status,headers});}
}
