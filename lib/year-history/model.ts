/** Annual lookup is a read model. It never deletes a record or posts a closing entry. */
export type YearEntry={id:string;module:string;kind:string;title:string;status:string;activityDate:string;openedDate?:string;closedDate?:string;terminal:boolean;amountCents?:number;property?:string;category?:string;
 // Optional known open intervals for sources that track reopening; end is exclusive.
 activityDates?:string[];openPeriods?:{start:string;end?:string}[]};
export const archiveViews=['activity','archive','open-at-close','undated'] as const;
export type YearView=typeof archiveViews[number];
const ct=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
// Never convert a day-only entry to midnight UTC: that would move it into the previous Austin day.
export function businessDate(input:unknown):string{
 if(typeof input!=='string')return '';
 const s=input.trim();if(!/^\d{4}-\d{2}-\d{2}/.test(s))return '';
 const day=s.slice(0,10),probe=new Date(day+'T12:00:00Z');
 if(!Number.isFinite(+probe)||probe.toISOString().slice(0,10)!==day)return '';
 if(s===day)return day;
 if(!/^\d{4}-\d{2}-\d{2}T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/i.test(s))return '';
 const d=new Date(s);return Number.isFinite(+d)?ct.format(d):'';
}
export function businessToday(now=new Date()){return ct.format(now);}
export function historicalArchiveYear(r:Pick<YearEntry,'closedDate'|'terminal'>,today=businessToday()):number|null{
 const closed=businessDate(r.closedDate);return r.terminal&&closed&&closed.slice(0,4)<today.slice(0,4)?Number(closed.slice(0,4)):null;
}
function openAt(r:YearEntry,cut:string){
 if(r.openPeriods)return r.openPeriods.some(p=>{const a=businessDate(p.start),b=businessDate(p.end);return !!a&&a<=cut&&(!p.end||!!b&&b>cut);});
 const a=businessDate(r.openedDate),b=businessDate(r.closedDate);
 return !!a&&a<=cut&&(b?b>cut:!r.terminal);
}
export function filterYear(rows:YearEntry[],opts:{module:string;year:number;view:YearView;kind?:string;q?:string;page?:number},today=businessToday()){
 const {module,view,year}=opts,cy=Number(today.slice(0,4)),ys=String(year),cut=ys+'-12-31',pSize=40;
 const unique=new Map<string,YearEntry>();
 for(const r of rows){if(r.module===module&&r.id)unique.set(r.kind+'|'+r.id,r);}
 const all=Array.from(unique.values());
 const observed=(r:YearEntry)=>[r.activityDate,r.openedDate,r.closedDate,...(r.activityDates||[]),...(r.openPeriods||[]).flatMap(p=>[p.start,p.end])].map(businessDate).filter(d=>d&&d<=today);
 const yearSet=new Set<number>([cy,cy-1]);
 for(const r of all)for(const d of observed(r))yearSet.add(Number(d.slice(0,4)));
 // Include intervening years to find long-running cases with no recorded activity that year.
 if(yearSet.size){const min=Math.max(1900,Math.min(...yearSet));for(let i=min;i<=cy;i++)yearSet.add(i);}
 const needsDate=(r:YearEntry)=>!observed(r).length||(r.terminal&&!businessDate(r.closedDate));
 const q=(opts.q||'').trim().toLocaleLowerCase('en-US');
 const byYear=all.filter(r=>view==='undated'?needsDate(r):view==='archive'?historicalArchiveYear(r,today)===year:view==='open-at-close'?year<cy&&openAt(r,cut):observed(r).some(d=>d.startsWith(ys+'-')));
 const kinds=[...new Set(all.map(r=>r.kind))].sort((a,b)=>a.localeCompare(b));
 const selected=byYear.filter(r=>(!opts.kind||r.kind===opts.kind)&&(!q||[r.title,r.kind,r.status,r.property,r.category].filter(Boolean).join(' ').toLocaleLowerCase('en-US').includes(q)));
 const stamp=(r:YearEntry)=>view==='archive'?businessDate(r.closedDate):view==='open-at-close'?businessDate(r.openedDate):observed(r).filter(d=>view==='undated'||d.startsWith(ys+'-')).sort().at(-1)||'';
 selected.sort((a,b)=>stamp(b).localeCompare(stamp(a))||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 const page=Math.max(1,Math.min(Number.isSafeInteger(opts.page)?opts.page!:1,Math.max(1,Math.ceil(selected.length/pSize))));
 return {years:[...yearSet].sort((a,b)=>b-a),year,closed:year<cy,view,kinds,items:selected.slice((page-1)*pSize,page*pSize),total:selected.length,page,pageSize:pSize,undated:all.filter(needsDate).length,selected};
}
