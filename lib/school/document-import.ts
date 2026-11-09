import {unzipSync,strFromU8} from 'fflate';
import {AppError} from '../shared/errors.ts';

const MAX_TEXT=120000;
function plain(xml:string){return xml.replace(/<\/(?:w:p|a:p|w:tr)>/g,'\n').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(0x10ffff,Number(n)))).replace(/\n\s*\n/g,'\n\n').trim()}
export async function importDocument(bytes:Uint8Array,name:string):Promise<{name:string;text:string;pages?:number;warnings:string[]}>{
 if(!bytes.length||bytes.length>8*1024*1024)throw new AppError('Choose a document of 8 MB or smaller.');
 const extension=name.toLowerCase().split('.').pop();let content='',pages:number|undefined;const warnings:string[]=[];
 if(extension==='pdf'){
  const {getDocumentProxy}=await import('unpdf');
  let timer:ReturnType<typeof setTimeout>|undefined;
  const operation=async()=>{const pdf=await getDocumentProxy(bytes,{maxImageSize:1048576,disableFontFace:true,useSystemFonts:false});try{
   pages=pdf.numPages;if(pages>100)throw new AppError('Import up to 100 pages at a time.');
   const sections:string[]=[];let size=0;
   for(let n=1;n<=pages;n++){const page=await pdf.getPage(n),text=await page.getTextContent();const words=text.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('').trim();sections.push('Page '+n+'\n'+words);size+=words.length;page.cleanup();if(size>MAX_TEXT){warnings.push('Only the first 120,000 characters were imported. Split longer documents into lessons.');break}}
   return sections.join('\n\n');
  }finally{await pdf.loadingTask.destroy()}};
  try{content=await Promise.race([operation(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AppError('This PDF took too long to read. Try a smaller file or paste its text.')),15000)})]);}finally{if(timer)clearTimeout(timer)}
  if(content.replace(/Page \d+/g,'').trim().length<30)throw new AppError('This PDF has no readable text. Upload a text-based PDF or paste the transcript. Scanned images are not automatically transcribed.');
 }else if(extension==='docx'||extension==='pptx'){
  let expanded=0,count=0;
  const files=unzipSync(bytes,{filter:f=>{const match=extension==='docx'?f.name==='word/document.xml':/^ppt\/slides\/slide\d+\.xml$/.test(f.name);if(match){count++;expanded+=f.originalSize;if(count>150||expanded>16*1024*1024)throw new AppError('This document is too large to import. Split it into smaller sections.')}return match}});
  const keys=Object.keys(files).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));pages=extension==='pptx'?keys.length:undefined;
  content=keys.map((key,i)=>(extension==='pptx'?'Slide '+(i+1)+'\n':'')+plain(strFromU8(files[key]))).join('\n\n');
 }else if(['txt','md','csv'].includes(extension||'')){content=new TextDecoder('utf-8',{fatal:false}).decode(bytes).replace(/\0/g,'');}
 else throw new AppError('Import a PDF, Word document (.docx), PowerPoint (.pptx), text, Markdown, or CSV file.');
 if(!content.trim())throw new AppError('No readable content was found in this document.');
 if(content.length>MAX_TEXT&&!warnings.length)warnings.push('Only the first 120,000 characters were imported. Split longer documents into lessons.');
 warnings.push('Review the imported text before publishing. Images, tables, and page order may need adjustment.');
 return {name:name.slice(0,200),text:content.slice(0,MAX_TEXT).trim(),pages,warnings};
}
