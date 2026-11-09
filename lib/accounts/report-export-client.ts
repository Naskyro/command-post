import type {PortfolioFileFormat,PortfolioExportView} from './report-export-model';
export async function downloadPortfolioReport(format:PortfolioFileFormat,params:URLSearchParams|string,view?:PortfolioExportView){
 const query=new URLSearchParams(params);if(!query.get('id'))throw Error('Select a report first.');
 const resp=await fetch('/api/accounts/reports/export',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query.toString(),format,view})});
 if(!resp.ok){const body=await resp.json().catch(()=>({}));throw Error(body&&typeof body==='object'&&'error' in body&&typeof body.error==='string'?body.error:'This report could not be exported.');}
 const mime=resp.headers.get('content-type')||'';
 if(!mime.includes(format==='xlsx'?'spreadsheetml':format==='pptx'?'presentationml':'application/pdf'))throw Error('The download was not returned. Refresh your session and try again.');
 const blob=await resp.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=/filename="([a-zA-Z0-9._-]+)"/.exec(resp.headers.get('content-disposition')||'')?.[1]||'PTE-Confidential-Portfolio.'+format;
 document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
