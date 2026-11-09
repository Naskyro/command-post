import type {ReportArea,ReportFilters,CustomView} from './types';
type ExportInput=CustomView&{area:ReportArea;format:'pdf'|'xlsx';reportId:string;filters?:ReportFilters;name?:string};
export async function downloadStudioReport(input:ExportInput){
 const r=await fetch('/api/reports',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,action:'export'})});
 if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(typeof e==='object'&&e&&'error' in e?String(e.error):'This report could not be downloaded.');}
 const mime=r.headers.get('content-type')||'';if(!mime.includes(input.format==='pdf'?'application/pdf':'spreadsheetml'))throw Error('The export was not returned. Refresh your session and retry.');
 const blob=await r.blob(),href=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=href;anchor.download=/filename="([^"]+)"/i.exec(r.headers.get('Content-Disposition')||'')?.[1]||'Command-Report.'+input.format;
 document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(href),60000);
}
