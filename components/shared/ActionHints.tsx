'use client';
import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './action-hints.css';

type Hint={control:HTMLElement;label:string;keyboard:boolean};
const selector='button,a[href],summary,[role="button"]';
/** One consistent hover/focus hint for labeled icon actions throughout Command.
 * Explicit data-tooltip is also supported for short text actions needing context.
 * Existing Radix tooltips retain ownership of their own triggers.
 */
export default function ActionHints(){
 const id=useId(),[hint,setHint]=useState<Hint|null>(null),[position,setPosition]=useState({left:0,top:0,ready:false});
 const bubble=useRef<HTMLDivElement>(null),pending=useRef<number|undefined>(undefined),target=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  function clear(){window.clearTimeout(pending.current);pending.current=undefined;target.current=null;setHint(null);}
  function candidate(node:EventTarget|null){
   if(!(node instanceof Element))return null;
   const el=node.closest<HTMLElement>(selector);
   if(!el||el.dataset.tooltip==='none'||el.dataset.slot==='tooltip-trigger'||el.closest('[data-command-action-hint]'))return null;
   if(el.getAttribute('aria-expanded')==='true'||(el.tagName==='SUMMARY'&&el.parentElement?.hasAttribute('open')))return null;
   const explicit=el.getAttribute('data-tooltip')?.trim();
   const label=explicit||el.getAttribute('aria-label')?.trim()||el.getAttribute('title')?.trim()||el.querySelector('.sr-only,.visually-hidden')?.textContent?.trim();
   if(!label)return null;
   const copy=el.cloneNode(true) as HTMLElement;
   copy.querySelectorAll('svg,.sr-only,.visually-hidden,[aria-hidden="true"],[hidden]').forEach(n=>n.remove());
   const visible=(copy.textContent||'').replace(/\s+/g,'').trim();
   if(!explicit&&visible&&!/^[\d×+−–—…<>←→↑↓⋮⋯?]+$/.test(visible))return null;
   return {control:el,label};
  }
  function start(node:EventTarget|null,keyboard=false){const found=candidate(node);if(!found){clear();return;}if(target.current===found.control)return;clear();target.current=found.control;pending.current=window.setTimeout(()=>{if(found.control.isConnected){setPosition(p=>({...p,ready:false}));setHint({...found,keyboard});}},keyboard?40:450);}
  const over=(e:PointerEvent)=>{if(e.pointerType!=='touch')start(e.target);};
  const out=(e:PointerEvent)=>{if(target.current&&e.relatedTarget instanceof Node&&target.current.contains(e.relatedTarget))return;clear();};
  const focus=(e:FocusEvent)=>start(e.target,true);
  const blur=(e:FocusEvent)=>{if(target.current&&e.relatedTarget instanceof Node&&target.current.contains(e.relatedTarget))return;clear();};
  const key=(e:KeyboardEvent)=>{if(['Escape','Enter',' '].includes(e.key))clear();};
  document.addEventListener('pointerover',over,true);document.addEventListener('pointerout',out,true);
  document.addEventListener('focusin',focus,true);document.addEventListener('focusout',blur,true);
  document.addEventListener('pointerdown',clear,true);document.addEventListener('click',clear,true);document.addEventListener('keydown',key,true);
  document.addEventListener('scroll',clear,true);window.addEventListener('resize',clear);
  return()=>{clear();document.removeEventListener('pointerover',over,true);document.removeEventListener('pointerout',out,true);document.removeEventListener('focusin',focus,true);document.removeEventListener('focusout',blur,true);document.removeEventListener('pointerdown',clear,true);document.removeEventListener('click',clear,true);document.removeEventListener('keydown',key,true);document.removeEventListener('scroll',clear,true);window.removeEventListener('resize',clear);};
 },[]);
 useLayoutEffect(()=>{
  if(!hint||!bubble.current)return;
  const el=hint.control,rect=el.getBoundingClientRect(),box=bubble.current.getBoundingClientRect();
  const left=Math.max(8,Math.min(window.innerWidth-box.width-8,rect.left+rect.width/2-box.width/2));
  const top=rect.bottom+9+box.height>window.innerHeight-8?Math.max(8,rect.top-box.height-9):rect.bottom+9;
  setPosition({left,top,ready:true});
  const before=el.getAttribute('aria-describedby'),nativeTitle=el.getAttribute('title');
  el.setAttribute('aria-describedby',[before,id].filter(Boolean).join(' '));
  if(nativeTitle)el.removeAttribute('title');
  return()=>{const current=(el.getAttribute('aria-describedby')||'').split(/\s+/).filter(v=>v&&v!==id);if(current.length)el.setAttribute('aria-describedby',current.join(' '));else el.removeAttribute('aria-describedby');if(nativeTitle&&!el.hasAttribute('title'))el.setAttribute('title',nativeTitle);};
 },[hint,id]);
 if(!hint)return null;
 return createPortal(<div ref={bubble} id={id} role="tooltip" data-command-action-hint="true" className="command-action-hint" style={{left:position.left,top:position.top,visibility:position.ready?'visible':'hidden'}}>{hint.label}</div>,document.body);
}
