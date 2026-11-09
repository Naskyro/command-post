import {validatedDocumentBytes} from './document-input';
import {uploadMime} from '../accounts/uploads';
import {AppError} from '../shared/errors';
export const propertyClaimLimit=15*1024*1024,assetClaimLimit=8*1024*1024,assignmentFileLimit=20*1024*1024;
export type DamageFields=Record<string,string>;
export type DamageOriginal={bytes:Uint8Array<ArrayBuffer>;name:string;type:string};
export function stagedFields(fields:DamageFields,id:string){const data=new FormData();for(const [k,val] of Object.entries(fields))data.set(k,val);data.set('id',fields.id||id);return data;}

export function validPropertyBytes(bytes:Uint8Array<ArrayBuffer>,name:string,max:number,mime:string){
 if(/\.docx$/i.test(name))return validatedDocumentBytes(bytes,name,assetClaimLimit);
 if(!bytes.length||bytes.length>max)throw new AppError('Choose a property claim file up to 15 MB.',413);
 return {name,type:uploadMime({name,type:mime},bytes,'Claim evidence'),bytes};
}
export function validAssetBytes(bytes:Uint8Array<ArrayBuffer>,name:string,max:number,mime:string){
 // Assignment proof can include short videos. MP4 is never accepted as a classified claim document.
 if(max===assignmentFileLimit&&/\.mp4$/i.test(name)&&mime==='video/mp4'&&bytes.length>=16&&bytes.length<=max&&new TextDecoder().decode(bytes.subarray(4,8))==='ftyp')return {name,type:mime,bytes};
 return validatedDocumentBytes(bytes,name,max);
}
