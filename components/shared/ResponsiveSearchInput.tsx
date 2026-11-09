'use client';
import {useCallback,useEffect,useRef,useState,type ComponentPropsWithRef} from 'react';
import {fitSearchHint} from '@/lib/shared/search-hint';

// A native input throughout: keeping its value, callbacks, ref and focus unchanged is
// especially important when a narrow directory expands or a module rail is toggled.
export default function ResponsiveSearchInput({placeholder='',compactPlaceholder,ref,title,...props}:ComponentPropsWithRef<'input'>&{compactPlaceholder?:string}){
 const field=useRef<HTMLInputElement|null>(null);
 const [hint,setHint]=useState(compactPlaceholder||'Search…');
 const assign=useCallback((el:HTMLInputElement|null)=>{field.current=el;if(typeof ref==='function')return ref(el);else if(ref)ref.current=el;},[ref]);
 useEffect(()=>{const el=field.current;if(!el)return;
  let live=true;const pen=document.createElement('canvas').getContext?.('2d');
  function size(){
   if(!el||!live||!el.clientWidth||!pen)return;
   const style=getComputedStyle(el),ph=getComputedStyle(el,'::placeholder');
   pen.font=[ph.fontStyle||style.fontStyle,ph.fontWeight||style.fontWeight,ph.fontSize||style.fontSize,ph.fontFamily||style.fontFamily].join(' ');
   const spacing=parseFloat(ph.letterSpacing)||parseFloat(style.letterSpacing)||0;
   const max=el.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)-5;
   setHint(fitSearchHint(placeholder,compactPlaceholder,max,t=>pen.measureText(t).width+Math.max(t.length-1,0)*spacing));
  }
  size();const ob=typeof ResizeObserver==='undefined'?null:new ResizeObserver(size);ob?.observe(el);
  window.addEventListener('resize',size);document.fonts?.ready.then(size);
  return()=>{live=false;ob?.disconnect();window.removeEventListener('resize',size);};
 },[placeholder,compactPlaceholder]);
 return <input {...props} data-workspace-search="" ref={assign} aria-description={props['aria-description']||((hint!==placeholder&&placeholder)?placeholder:undefined)} aria-label={props['aria-label']||placeholder||'Search'} title={title||placeholder} placeholder={hint}/>;
}
