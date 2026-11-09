'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {Eye} from 'lucide-react';
import {delegatedMutationControl,delegatedReadForm} from '@/lib/admin/delegated-ui';
import {delegatedWriteMessage} from '@/lib/shared/client';
import './delegated-access.css';

const controls='button,input[type=submit],input[type=button],input[type=file],[role=button],[role=menuitem],a[href]';
const actionLabel=(element:Element)=>{const title=element.getAttribute('title');return (element.getAttribute('aria-label')||(title===delegatedWriteMessage?element.getAttribute('data-delegated-original-title'):title)||('value' in element?String(element.value||''):'')||element.textContent||'').trim();};
function isMutation(element:Element){return delegatedMutationControl({label:actionLabel(element),navigation:!!element.closest('nav,[role=tablist],[role=tab]'),dialogClose:element.getAttribute('data-slot')==='dialog-close'||element.getAttribute('data-delegated-allow')==='true'||!!element.closest('.command-delegated-banner'),inputType:element.getAttribute('type')||'',href:element.getAttribute('href')||''});}
function searchField(element:Pick<Element,'getAttribute'|'closest'>){const description=[element.getAttribute('type'),element.getAttribute('aria-label'),element.getAttribute('placeholder'),element.getAttribute('name'),element.getAttribute('id'),element.closest('label')?.textContent].filter(Boolean).join(' ');return /\b(search|filter|find|lookup|query|sort)\b/i.test(description);}
function readForm(form:HTMLFormElement){const actions=[...form.querySelectorAll('button[type=submit],button:not([type]),input[type=submit]')];return actions.length>0&&actions.every(el=>delegatedReadForm(actionLabel(el)));}

/** The actual employee module tree, with read-only controls and usable detail navigation. */
export function DelegatedWorkspace({module,children}:{module:string;children:ReactNode}){
 const [message,setMessage]=useState('');
 useEffect(()=>{
  const changed=new WeakMap<HTMLElement,{disabled?:boolean;title:string|null;aria:string|null}>(),fields=new WeakMap<object,{disabled:boolean;readOnly?:boolean}>();
  const annotate=()=>{
   for(const element of document.querySelectorAll<HTMLElement>(controls)){
    const native=element instanceof HTMLButtonElement||element instanceof HTMLInputElement;
    if(isMutation(element)){
     if(!changed.has(element)){changed.set(element,{disabled:native?element.disabled:undefined,title:element.getAttribute('title'),aria:element.getAttribute('aria-disabled')});element.setAttribute('data-delegated-original-title',element.getAttribute('title')||'');}
     if(!element.hasAttribute('data-delegated-blocked'))element.setAttribute('data-delegated-blocked','true');
     if(element.getAttribute('aria-disabled')!=='true')element.setAttribute('aria-disabled','true');
     if(element.title!==delegatedWriteMessage)element.title=delegatedWriteMessage;
     if(native&&!element.disabled)element.disabled=true;
    }else{const prior=changed.get(element);if(prior){if(native&&element.disabled!==prior.disabled)element.disabled=!!prior.disabled;for(const [key,value] of [['title',prior.title],['aria-disabled',prior.aria]] as const){if(value===null)element.removeAttribute(key);else element.setAttribute(key,value);}element.removeAttribute('data-delegated-blocked');element.removeAttribute('data-delegated-original-title');changed.delete(element);}}
   }
   // Record fields stay copyable. Filters and search fields retain normal behavior.
   for(const element of document.querySelectorAll('input,textarea,select')){
    if(!(element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement||element instanceof HTMLSelectElement))continue;
    const form=element.closest('form'),record=!!element.closest('form,[role=dialog],.sha-editor')&&!element.closest('.command-delegated-banner')&&!searchField(element)&&!(form&&readForm(form));
    if(record){if(!fields.has(element))fields.set(element,{disabled:element.disabled,...('readOnly' in element?{readOnly:element.readOnly}:{})});if(element instanceof HTMLSelectElement||element instanceof HTMLInputElement&&['checkbox','radio','file','range'].includes(element.type)){if(!element.disabled)element.disabled=true;}else if(!element.readOnly)element.readOnly=true;if(element.getAttribute('aria-readonly')!=='true')element.setAttribute('aria-readonly','true');}
    else {const prior=fields.get(element);if(prior){if(element.disabled!==prior.disabled&&!element.hasAttribute('data-delegated-blocked'))element.disabled=prior.disabled;if('readOnly' in element&&element.readOnly!==prior.readOnly)element.readOnly=!!prior.readOnly;element.removeAttribute('aria-readonly');fields.delete(element);}}
   }
  };
  const block=(event:Event)=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();setMessage(delegatedWriteMessage);};
  const click=(event:Event)=>{const target=event.target instanceof Element?event.target.closest(controls):null;if(target&&isMutation(target))block(event);};
  const submit=(event:Event)=>{if(event.target instanceof HTMLFormElement&&!readForm(event.target))block(event);};
  annotate();const observer=new MutationObserver(annotate);observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','readonly','aria-label','title','type']});
  document.addEventListener('click',click,true);document.addEventListener('submit',submit,true);document.documentElement.setAttribute('data-command-delegated','true');
  return()=>{observer.disconnect();document.removeEventListener('click',click,true);document.removeEventListener('submit',submit,true);document.documentElement.removeAttribute('data-command-delegated');};
 },[]);
 return <section className="da-live-workspace" aria-label={module+' · Read-Only Employee View'}><div className="da-readonly-note"><Eye size={15} aria-hidden="true"/><p>Browse this employee’s screens, search records, and open details. Saving, sending, uploading, and approvals are disabled.</p></div>{message&&<p className="da-readonly-feedback" role="status">{message}</p>}{children}</section>;
}
