import {timedFetch} from '../shared/client';
import {stageDocument} from './document-stage-client';
const directLimit=480*1024;
export async function sendDamageFile(url:'/api/accounts/files'|'/api/hr/files',body:FormData):Promise<Response>{
 const file=body.get('file'),category=body.get('category');
 if(!(file instanceof File)||file.size<=directLimit||!['Claim evidence','Asset Evidence'].includes(String(category)))return timedFetch(url,{method:'POST',body});
 const fields:Record<string,string>={};for(const [key,value] of body)if(key!=='file'&&typeof value==='string')fields[key]=value;
 const response=await stageDocument<unknown>(url+'?damageStage=1',file,fields);return Response.json(response);
}
