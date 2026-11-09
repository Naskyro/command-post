import {businessDate,type YearEntry} from './model.ts';
export function yearMetrics(rows:YearEntry[],module:string,view:string,year:number){
 const count=(category:string)=>rows.filter(r=>r.category===category).length;
 const metrics:{label:string;value:number;format?:'usd'|'number'}[]=[{label:'Matching Records',value:rows.length}];
 if(module==='Finance'){
   const cash=rows.filter(r=>['cash-in','cash-out','cash-neutral'].includes(r.category||'')&&Number.isSafeInteger(r.amountCents)&&(view!=='activity'||businessDate(r.activityDate).startsWith(year+'-')));
   if(cash.length)for(const [label,dir] of [['Recorded Bank Inflows','cash-in'],['Recorded Bank Outflows','cash-out']])metrics.push({label,value:Math.abs(cash.filter(r=>r.category===dir).reduce((a,r)=>a+r.amountCents!,0))/100,format:'usd'});
 }else if(module==='Account Management'){
  // A record may match a year because it was requested or approved then. The
  // release KPI is event-based; never count that earlier activity, or a denial.
  const completed=(category:string)=>rows.filter(r=>r.category===category&&['Released','Imported'].includes(r.status)&&businessDate(r.closedDate).slice(0,4)===String(year)).length;
  if(view!=='undated')metrics.push({label:'Courtesy Releases',value:completed('courtesy-release')},{label:'Discounted Releases',value:completed('discounted-release')});
 }
 else if(module==='Compliance, Claims & Recovery'){
  metrics.push({label:'Damage Claims',value:count('damage-claim')},{label:'Court Matters',value:count('court-matter')},{label:'Court Appearances',value:count('court-appearance')});
  const registers=rows.filter(r=>r.category?.startsWith('register-'));
  if(registers.length)metrics.push({label:'Compliance Register Records',value:registers.length});
 }
 else {metrics.push({label:'Completed or Closed Now',value:rows.filter(r=>r.terminal).length},{label:'Still Active Now',value:rows.filter(r=>!r.terminal).length});}
 return metrics;
}
export function annualCsv(rows:YearEntry[]){
 const cell=(v:unknown)=>{let s=String(v??'');if(/^\s*[=+@-]/.test(s)&&typeof v!=='number')s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return '\uFEFF'+[['Record Type','Record','Property','Current Status','Activity Date','Opened','Closed','Recorded Amount (USD)'],...rows.map(r=>[r.kind,r.title,r.property,r.status,businessDate(r.activityDate),businessDate(r.openedDate),businessDate(r.closedDate),Number.isSafeInteger(r.amountCents)?r.amountCents!/100:''])].map(r=>r.map(cell).join(',')).join('\r\n');
}
