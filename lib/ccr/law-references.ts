import {AppError} from '../shared/errors.ts';
export type LawReference={agency:string;reportNumber:string;officer:string;badge:string};
export const lawKeys=['agency','reportNumber','officer','badge'] as const;
export const blankLawReference=():LawReference=>({agency:'',reportNumber:'',officer:'',badge:''});
export function lawReferences(input:unknown,old?:LawReference[]):LawReference[]|undefined{
 if(input===undefined)return old;
 if(!Array.isArray(input)||input.length>12)throw new AppError('Enter up to 12 law enforcement references per record.');
 const result:LawReference[]=[];
 for(const x of input){
  if(!x||Array.isArray(x)||typeof x!=='object'||Object.keys(x).some(k=>!(lawKeys as readonly string[]).includes(k)))throw new AppError('Enter a valid law enforcement reference.');
  const row=blankLawReference();
  for(const k of lawKeys){const raw=x[k];if(raw===undefined)continue;const limit=k==='badge'?50:160;
   if(typeof raw!=='string'||raw.trim().length>limit||/[\u0000-\u001f\u007f]/.test(raw))throw new AppError('Use plain text within the police reference field limits.');row[k]=raw.trim();}
  if(lawKeys.some(k=>row[k]))result.push(row);
 }
 return result.length?result:undefined;
}
