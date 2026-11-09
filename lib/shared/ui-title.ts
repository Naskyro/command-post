/** Display copy only. Never pass employee names, property names, notes, documents,
 * free-form choices, identifiers, or persisted enum values through this function. */
const minor = new Set('a an and as at but by for from in into nor of on or over per the to via vs with without'.split(' '));
const spellings:Record<string,string>={id:'ID',ids:'IDs',pdf:'PDF',pdfs:'PDFs',sop:'SOP',sops:'SOPs',crm:'CRM',hr:'HR',ccr:'CCR',tdlr:'TDLR',apd:'APD',vsf:'VSF',pto:'PTO',ctw:'CTW',ctws:'CTWs',vin:'VIN',vins:'VINs',api:'API',url:'URL',urls:'URLs',gps:'GPS',ev:'EV',kdm:'KDM',ein:'EIN',ach:'ACH',irs:'IRS',twc:'TWC',ytd:'YTD',mtd:'MTD',yoy:'YoY',adp:'ADP',gmail:'Gmail',towbook:'Towbook',quickbooks:'QuickBooks',powerpoint:'PowerPoint',chatgpt:'ChatGPT',ios:'iOS',iphone:'iPhone',qr:'QR',sso:'SSO',csv:'CSV',xlsx:'XLSX',pptx:'PPTX',sms:'SMS'};
export function uiTitle(input:string):string{
 if(!input) return input;
 const words=[...input.matchAll(/[A-Za-z\d]+(?:['’][A-Za-z]+)*/g)];
 return input.replace(/[A-Za-z\d]+(?:['’][A-Za-z]+)*/g,(word:string,offset:number)=>{
   if(/^\d/.test(word))return word;
   const lo=word.toLowerCase();
   if(Object.hasOwn(spellings,lo))return spellings[lo];
   if(/^[A-Z\d]+$/.test(word)&&word.length>1)return word;
   const phraseParticle=/(?:check|clock|log|sign|follow|set|pick|drop|hand|write|opt)\s+$/i.test(input.slice(0,offset))&&/^(?:in|up|out|off)$/i.test(word);
   const edge=phraseParticle||input[offset+word.length]==='-'||offset===words[0]?.index||offset===words.at(-1)?.index||/[-:/]\s*$/.test(input.slice(0,offset));
   if(!edge&&minor.has(lo))return lo;
   return word.charAt(0).toUpperCase()+word.slice(1);
 });
}
/** Only format recognised built-in choices. Historical imports and administrator-
 * defined types, names and other text keep exactly the spelling on file. */
export function uiChoice(raw:unknown,choices?:readonly string[]):string{
 const value=String(raw??'');
 return choices?.includes(value)?uiTitle(value):value;
}
