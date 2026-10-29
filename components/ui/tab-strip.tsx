'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import './tab-strip.css';

// Preserve the module's existing navigation and permissions while keeping tabs reachable.
export function TabStrip({children,label='Module sections'}:{children:ReactNode;label?:string}) {
 const viewport=useRef<HTMLDivElement>(null);
 const [edges,setEdges]=useState({overflow:false,left:false,right:false});
 const [choices,setChoices]=useState<{label:string;disabled:boolean}[]>([]);
 useEffect(()=>{
  const node=viewport.current;if(!node)return;
  let frame=0;
  const buttons=()=>Array.from(node.querySelectorAll<HTMLButtonElement>('button'));
  const update=(reveal=false)=>{
   if(reveal){const active=node.querySelector<HTMLElement>('[aria-current="page"],[data-state="active"],button.active');if(active){const a=active.getBoundingClientRect(),v=node.getBoundingClientRect();if(a.left<v.left)node.scrollLeft-=v.left-a.left+6;else if(a.right>v.right)node.scrollLeft+=a.right-v.right+6;}}
   const overflow=node.scrollWidth>node.clientWidth+2;
   setEdges({overflow,left:node.scrollLeft>2,right:node.scrollLeft+node.clientWidth<node.scrollWidth-2});
   setChoices(buttons().map(b=>({label:b.textContent?.trim()||b.getAttribute('aria-label')||'Section',disabled:b.disabled})));
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>update(true));};
  const observer=new ResizeObserver(schedule);observer.observe(node);if(node.firstElementChild)observer.observe(node.firstElementChild);
  const mutations=new MutationObserver(schedule);mutations.observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-current','data-state','class']});
  const scroll=()=>update();node.addEventListener('scroll',scroll,{passive:true});schedule();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();mutations.disconnect();node.removeEventListener('scroll',scroll);};
 },[]);
 function move(direction:number){const node=viewport.current;if(node)node.scrollBy({left:direction*node.clientWidth*.65,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
 return <div className="cp-tab-strip">{edges.overflow&&<button type="button" className="cp-tab-arrow" aria-label={'Previous '+label.toLowerCase()} disabled={!edges.left} onClick={()=>move(-1)}><ChevronLeft size={18}/></button>}<div className="cp-tab-viewport" ref={viewport}>{children}</div>{edges.overflow&&<div className="cp-tab-overflow"><button type="button" className="cp-tab-arrow" aria-label={'Next '+label.toLowerCase()} disabled={!edges.right} onClick={()=>move(1)}><ChevronRight size={18}/></button><select aria-label={'Choose from all '+label.toLowerCase()} value="" onChange={e=>{const button=viewport.current?.querySelectorAll<HTMLButtonElement>('button')[Number(e.target.value)];button?.click();button?.focus();}}><option value="" disabled>All tabs</option>{choices.map((choice,i)=><option key={i} value={i} disabled={choice.disabled}>{choice.label}</option>)}</select></div>}</div>;
}
