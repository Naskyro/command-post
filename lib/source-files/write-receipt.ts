/** Restricted to Drive accession operations with stable source IDs and immutable fingerprints. */
export class DriveRequestError extends Error {
 constructor(message:string,public readonly status:number,public readonly retryAfter:string|null=null,public readonly unreadable=false){super(message);}
 get transient(){return this.status===0||this.unreadable||[408,425,429].includes(this.status)||(this.status>=500&&this.status<600);}
}
export type DriveReceiptState='confirmed'|'missing'|'unknown';
type Wait=(ms:number)=>Promise<void>;
const wait:Wait=ms=>new Promise(r=>setTimeout(r,ms));
export function driveBackoff(index:number,after:string|null=null){
 const seconds=after&&/^\d+(\.\d+)?$/.test(after)?Number(after):NaN;
 const hint=Number.isFinite(seconds)?seconds*1000:after?Date.parse(after)-Date.now():0;
 return Math.min(15000,Math.ceil(Math.max(450*(2**index)*(0.85+0.3*Math.random()),Number.isFinite(hint)?hint:0)));
}
const brief=(e:DriveRequestError)=>e.status?'HTTP '+e.status:'connection interrupted';
export async function verifiedDriveWrite<T>(write:()=>Promise<T>,receipt:()=>Promise<T>,classify:(row:T)=>DriveReceiptState,
 acknowledged:(row:T)=>boolean,progress:(label:string)=>void=()=>{},pause:Wait=wait):Promise<T>{
 for(let attempt=0;;attempt++){
  let transient:DriveRequestError;
  try{
   const written=await write();if(acknowledged(written))return written;
   transient=new DriveRequestError('Unexpected filing response.',200,null,true);
  }catch(e){if(!(e instanceof DriveRequestError)||!e.transient)throw e;transient=e;}
  progress('Checking Filing Receipt');
  // Never repeat a write based on a failed check, broad fallback, unknown JSON, authorization denial, or conflict.
  let receiptRow:T;
  try{receiptRow=await receipt();}catch(e){
   if(e instanceof DriveRequestError&&!e.transient)throw e;
   throw Error('Receipt Unavailable · Check Receipts Before Filing Again ('+(e instanceof DriveRequestError?brief(e):brief(transient))+').');
  }
  const state=classify(receiptRow);
  if(state==='confirmed')return receiptRow;
  if(state!=='missing')throw Error('Receipt Unverified · No Additional Submission Was Made.');
  if(attempt>=2)throw Error('Not Filed · Receipt Checked After 3 Attempts ('+brief(transient)+').');
  progress('Not Yet Filed · Retrying '+(attempt+1)+' of 2');await pause(driveBackoff(attempt,transient.retryAfter));
 }
}
