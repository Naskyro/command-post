/** Human-readable event times for Command. Storage, form controls, and exports keep their source types. */
export const AUDIT_TIME_ZONE='America/Chicago';
const format=new Intl.DateTimeFormat('en-US',{timeZone:AUDIT_TIME_ZONE,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true,timeZoneName:'short'});
const calendar=/^(\d{4})-(\d{2})-(\d{2})$/;
const instant=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})$/i;
function validDay(y:number,m:number,d:number){const leap=y%4===0&&(y%100!==0||y%400===0);return y>0&&m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];}
function parts(value:unknown){
 let d:Date;
 if(value instanceof Date)d=value;
 else if(typeof value==='number'&&Number.isSafeInteger(value))d=new Date(value); // epoch milliseconds
 else if(typeof value==='string'){
  const text=value.trim(),ymd=calendar.exec(text);
  if(ymd)return validDay(+ymd[1],+ymd[2],+ymd[3])?{day:ymd[2]+'-'+ymd[3]+'-'+ymd[1],clock:'',detail:''}:undefined;
  const m=instant.exec(text);if(!m||!validDay(+m[1],+m[2],+m[3])||+m[4]>23||+m[5]>59||+(m[6]||0)>59)return;
  // Require an explicit offset: browser-local interpretations differ, especially during DST changes.
  const offset=m[8].toUpperCase();if(offset!=='Z'&&(+offset.slice(1,3)>23||+offset.slice(-2)>59))return;
  d=new Date(m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+(m[6]||'00')+'.'+(m[7]||'').slice(0,3).padEnd(3,'0')+offset);
 }else return;
 if(!Number.isFinite(d.getTime()))return;
 const token=Object.fromEntries(format.formatToParts(d).map(part=>[part.type,part.value]));
 const day=token.month+'-'+token.day+'-'+token.year.padStart(4,'0'),period=token.dayPeriod.toLowerCase();
 return {day,clock:token.hour+':'+token.minute+period+' CT',detail:token.hour+':'+token.minute+':'+token.second+'.'+String(d.getUTCMilliseconds()).padStart(3,'0')+period+' '+token.timeZoneName};
}
/** Date-only values stay dates. Invalid values and ambiguous instants without offsets are not guessed. */
export function auditStamp(value:unknown){const p=parts(value);return p?p.day+(p.clock?' '+p.clock:''):'';}
export function auditDay(value:unknown){return parts(value)?.day||'';}
/** Extra precision for audit comparisons and the repeated hour at the end of daylight saving time. */
export function auditStampDetail(value:unknown){const p=parts(value);return p?p.day+(p.detail?' '+p.detail:''):'';}
/** Local calendar midnight represented as UTC for inclusive/exclusive database date filters. */
export function auditDayBoundary(day:string,next=false){
 if(!calendar.test(day)||!auditDay(day))return '';
 const target=Date.parse(day+'T00:00:00Z')+(next?86400000:0);let guess=target;
 for(let i=0;i<3;i++){
  const p=Object.fromEntries(format.formatToParts(new Date(guess)).map(part=>[part.type,part.value]));
  const hour=(Number(p.hour)%12+(p.dayPeriod==='PM'?12:0)).toString().padStart(2,'0');
  const local=Date.parse(p.year.padStart(4,'0')+'-'+p.month+'-'+p.day+'T'+hour+':'+p.minute+':'+p.second+'Z');
  if(local===target)break;
  guess+=target-local;
 }
 return new Date(guess).toISOString();
}
export function auditDiff(before:unknown,after:unknown){const flatten=(o:unknown,prefix='',out:Record<string,unknown>={})=>{if(o&&typeof o==='object'){for(const [k,v] of Object.entries(o)){const path=prefix?prefix+'.'+k:k;if(/password|token|secret|routing|accountnumber|account_number|accountNo|bankAccount|taxId|ssn|socialsecuritynumber|documentnumber|storagekey/i.test(path))out[path]='[Protected]';else if(v&&typeof v==='object')flatten(v,path,out);else out[path]=v;}}return out;};const a=flatten(before),b=flatten(after);return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(field=>({field,before:a[field]??null,after:b[field]??null}));}
