'use client';
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,ZoomIn,ZoomOut,RotateCw} from 'lucide-react';
import './pdf-pages.css';

const assetRoot='/vendor/sop-pdfjs/5.6.205/';
type Viewport={width:number;height:number};
type Render={promise:Promise<void>;cancel:()=>void};
type Page={getViewport:(v:{scale:number})=>Viewport;render:(v:{canvas:HTMLCanvasElement;viewport:Viewport})=>Render};
type Pdf={numPages:number;getPage:(n:number)=>Promise<Page>};
type Load={promise:Promise<Pdf>;destroy:()=>Promise<void>};
type Engine={GlobalWorkerOptions:{workerSrc:string};getDocument:(v:Record<string,unknown>)=>Load};

/** Render locally, including when the device does not have an inline PDF plug-in. */
type Props={url:string;title:string;onReady?:()=>void};
export default function SopPdfPages(props:Props){
 const [attempt,retry]=useState(0);
 return <PdfSurface key={props.url+':'+attempt} {...props} retry={()=>retry(n=>n+1)}/>;
}
function PdfSurface({url,title,onReady,retry}:Props&{retry:()=>void}){
 const readyRef=useRef(onReady),notified=useRef(false);
 useEffect(()=>{readyRef.current=onReady},[onReady]);
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [doc,setDoc]=useState<Pdf>(),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[width,setWidth]=useState(0);
 const [error,setError]=useState(''),[drawing,setDrawing]=useState(true);
 useEffect(()=>{const target=host.current;if(!target)return;
  const update=()=>setWidth(Math.floor(target.clientWidth));update();
  const observer=new ResizeObserver(update);observer.observe(target);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{const controller=new AbortController();let stopped=false,loading:Load|undefined;
  void(async()=>{try{
   const address=new URL(url,location.origin);if(address.origin!==location.origin)throw Error('Choose a document from this site.');
   const libUrl=assetRoot+'pdf.min.js';
   const [lib,response]=await Promise.all([import(/* @vite-ignore */ libUrl) as Promise<Engine>,fetch(address,{credentials:'same-origin',cache:'no-store',signal:controller.signal})]);
   if(!response.ok||!response.headers.get('content-type')?.toLowerCase().includes('application/pdf'))throw Error(response.status===403?'You no longer have access to this document.':'The PDF could not be opened.');
   const data=new Uint8Array(await response.arrayBuffer());if(stopped)return;
   lib.GlobalWorkerOptions.workerSrc=assetRoot+'pdf.worker.min.js';
   loading=lib.getDocument({data,standardFontDataUrl:assetRoot+'standard_fonts/',cMapUrl:assetRoot+'cmaps/',cMapPacked:true,wasmUrl:assetRoot+'wasm/',iccUrl:assetRoot+'iccs/',useSystemFonts:false,isEvalSupported:false,enableXfa:false});
   const loaded=await loading.promise;if(!stopped)setDoc(loaded);
  }catch(e){if(!stopped)setError((e as Error).message||'The PDF could not be opened.');}})();
  return()=>{stopped=true;controller.abort();if(loading)void loading.destroy().catch(()=>{});};
 },[url]);
 useEffect(()=>{const el=canvas.current;if(!el||!width||!doc)return;let stopped=false,paint:Render|undefined;
  void(async()=>{try{
   const pdfPage=await doc.getPage(page);if(stopped)return;setDrawing(true);
   const original=pdfPage.getViewport({scale:1}),fit=Math.max(100,Math.min(width-24,1050)),display=pdfPage.getViewport({scale:fit/original.width*zoom});
   // Limit bitmap memory even when zoomed on high-DPI phones.
   const density=Math.min(window.devicePixelRatio||1,2,Math.sqrt(9_000_000/(display.width*display.height)));
   const vp=pdfPage.getViewport({scale:fit/original.width*zoom*density});
   el.width=Math.floor(vp.width);el.height=Math.floor(vp.height);el.style.width=display.width+'px';el.style.height=display.height+'px';
   paint=pdfPage.render({canvas:el,viewport:vp});await paint.promise;if(!stopped){setDrawing(false);if(!notified.current){notified.current=true;readyRef.current?.();}}
  }catch(e){if(!stopped)setError((e as Error).message||'This page could not be displayed.');}})();
  return()=>{stopped=true;paint?.cancel();};
 },[doc,page,width,zoom]);
 return <section className="sop-pdf-pages" aria-label={title}>
  <div className="sop-pdf-toolbar" role="group" aria-label="PDF Controls">
   <button type="button" aria-label="Previous PDF Page" title="Previous PDF Page" disabled={!doc||page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={17}/></button>
   <span aria-live="polite">{doc?'Page '+page+' of '+doc.numPages:'Opening PDF…'}</span>
   <button type="button" aria-label="Next PDF Page" title="Next PDF Page" disabled={!doc||page>=doc.numPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={17}/></button>
   <i aria-hidden="true"/><button type="button" aria-label="Zoom Out" title="Zoom Out" disabled={!doc||zoom<=0.75} onClick={()=>setZoom(z=>z-0.25)}><ZoomOut size={17}/></button>
   <button type="button" title="Fit PDF to Width" aria-label="Fit PDF to Width" disabled={!doc} onClick={()=>setZoom(1)}>{Math.round(100*zoom)}%</button>
   <button type="button" aria-label="Zoom In" title="Zoom In" disabled={!doc||zoom>=2} onClick={()=>setZoom(z=>z+0.25)}><ZoomIn size={17}/></button>
  </div>
  <div className="sop-pdf-viewport" ref={host} aria-busy={!error&&drawing}>
   {error?<div className="sop-pdf-error" role="alert"><p>{error}</p><button className="sop-btn" type="button" onClick={retry}><RotateCw size={15}/>Retry PDF</button></div>:<canvas ref={canvas} role="img" aria-label={title+', Page '+page} style={{visibility:drawing?'hidden':'visible'}}/>}
  </div>
 </section>;
}
