import type {HearingAnalysis} from './hearing-analysis';
import {makeReportPdf,makeReportXlsx} from '../reports/files';
import type {ReportColumn,ReportResult} from '../reports/types';
const cols=(pairs:[string,string][]):ReportColumn[]=>pairs.map(([key,label])=>({key,label}));
export async function makeHearingExport(d:HearingAnalysis,format:string){
 const s=d.filters,extra=Object.entries(s).filter(([,v])=>v!=='') as [string,string][],note='Distinct cases. A case can appear under more than one judge. Win rate is PTE wins divided by verified PTE wins and losses only. Unknown dates are retained unless a date range is selected. Unknown judge means no verified evidence for the selected role.';
 const columns=cols([['label',s.group],['cases','Cases'],['won','Won'],['lost','Lost'],['settled','Settled'],['mixed','Mixed'],['dismissed','Dismissed'],['withdrawn','Withdrawn'],['other','Other'],['active','Open'],['unverified','Unverified'],['winRate','Win %'],['share','Case Share %']]);
 const dc=cols([['number','Cause'],['title','Matter'],['court','Court'],['precinct','Precinct'],['judges',s.judgeRole+' Judge'],['dates',s.basis],['outcome','PTE Result'],['won','Named Prevailing Party'],['lost','Named Losing Party'],['parties','Recorded Parties']]);
 const result:ReportResult={columns,rows:d.groups,details:{columns:dc,rows:d.details},chart:[],note,metric:{label:'Distinct Cases',value:String(d.counts.all)}};
 const meta={area:'Compliance, Claims & Recovery',confidential:'Confidential court records. Authorized recipients only.',extra:[...extra,['Eligible Win/Loss Decisions',String(d.denominator)],['Unknown Date Excluded',String(d.excludedUnknownDate)]] as [string,string][]};
 if(format==='csv'){const esc=(x:unknown)=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,m=>"'"+m).replaceAll('"','""')+'"';const vals=(x:Record<string,unknown>,c:ReportColumn[])=>c.map(k=>x[k.key]);return {mime:'text/csv; charset=utf-8',bytes:new TextEncoder().encode('\uFEFF'+[['PTE Confidential · Court Outcome Analysis'],[note],...meta.extra,[],columns.map(c=>c.label),...d.groups.map(r=>vals(r,columns)),[],dc.map(c=>c.label),...d.details.map(r=>vals(r,dc))].map(r=>r.map(esc).join(',')).join('\r\n'))};}
 if(format==='pdf'){
  result.columns=cols([['label',s.group],['cases','Cases'],['results','Result Counts'],['rates','Rates']]);
  result.rows=d.groups.map(g=>({label:g.label,cases:g.cases,results:'Won '+g.won+' · Lost '+g.lost+' · Settled '+g.settled+' · Mixed '+g.mixed+' · Dismissed '+g.dismissed+' · Withdrawn '+g.withdrawn+' · Other '+g.other+' · Open '+g.active+' · Unverified '+g.unverified,rates:'Case share: '+g.share+'% · Win rate: '+(g.winRate==null?'N/A':g.winRate+'%')}));
  result.details={columns:cols([['case','Case / Court'],['judicial','Judge / Dates'],['decision','Result / Parties']]),rows:d.details.map(r=>({case:r.number+' · '+r.title+' · '+r.court+' · '+r.precinct,judicial:s.judgeRole+': '+r.judges+' · '+s.basis+': '+r.dates,decision:r.outcome+' · '+r.parties}))};
 }
 return format==='pdf'?{mime:'application/pdf',bytes:await makeReportPdf('Court Outcome Analysis',result,meta)}:{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes:await makeReportXlsx('Court Outcome Analysis',result,meta)};
}
