import {validRoutingNumber} from './banking.ts';
export type RoutingLookup={routingNumber:string;status:'Found'|'Not Found'|'Unavailable';bankName?:string;city?:string;state?:string;source:string;checkedAt:string;message?:string};
const source='bankrouting.io';
const cache=new Map<string,{expires:number;result:RoutingLookup}>();
/** Only the public routing number leaves the app. Account numbers and identity never go to this provider. */
export async function lookupRouting(number:string,fetcher:typeof fetch=fetch,now=Date.now()):Promise<RoutingLookup>{
 if(!validRoutingNumber(number))throw new Error('Enter a valid nine-digit ABA routing number.');
 const cached=cache.get(number);if(fetcher===fetch&&cached&&cached.expires>now)return cached.result;
 const base={routingNumber:number,source,checkedAt:new Date(now).toISOString()};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
 let result:RoutingLookup;
 try{
  const response=await fetcher('https://bankrouting.io/api/v1/aba/'+number,{headers:{Accept:'application/json'},redirect:'error',signal:controller.signal});
  if(response.status===404)result={...base,status:'Not Found',message:'The directory did not find this routing number. Confirm the bank name and ACH routing number with your financial institution.'};
  else if(!response.ok)throw new Error('Lookup unavailable');
  else {
   if(Number(response.headers.get('content-length')||0)>32768)throw new Error('Lookup response too large');
   const reader=response.body?.getReader();let raw='';if(!reader)throw new Error('Empty lookup response');
   const decoder=new TextDecoder();while(true){const chunk=await reader.read();if(chunk.done)break;raw+=decoder.decode(chunk.value,{stream:true});if(raw.length>32768){await reader.cancel();throw new Error('Lookup response too large');}}raw+=decoder.decode();
   const json=JSON.parse(raw) as {status?:unknown;data?:Record<string,unknown>};const d=json.data;
   if(json.status!=='success'||!d||String(d.aba_number)!==number||typeof d.bank_name!=='string'||!d.bank_name.trim()||d.bank_name.length>160)throw new Error('Unrecognized lookup response');
   result={...base,status:'Found',bankName:d.bank_name.trim(),city:typeof d.city==='string'?d.city.slice(0,100):undefined,state:typeof d.state==='string'?d.state.slice(0,30):undefined};
  }
 }catch{result={...base,status:'Unavailable',message:'Bank lookup is temporarily unavailable. You can enter the bank name and save these details for payroll review.'};}finally{clearTimeout(timer);}
 if(fetcher===fetch){if(cache.size>=128)cache.delete(cache.keys().next().value!);cache.set(number,{expires:now+(result.status==='Found'?3600000:30000),result});}
 return result;
}
