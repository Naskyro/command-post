'use client';
import {Children,isValidElement,type ReactNode,useId,useState} from 'react';
import {SlidersHorizontal} from 'lucide-react';
import './filter-bar.css';
// The first control is the main search. Secondary criteria remain available behind Filters.
export default function FilterBar({children,className=''}:{children:ReactNode;className?:string}){
 const [open,setOpen]=useState(false),id=useId(),items=Children.toArray(children),first=items[0],filters:ReactNode[]=[],actions:ReactNode[]=[];
 for(const child of items.slice(1)){if(isValidElement(child)&&typeof child.type==='string'&&['label','select','details'].includes(child.type))filters.push(child);else actions.push(child);}
 function active(node:ReactNode):number{if(!isValidElement<{value?:unknown;checked?:boolean;children?:ReactNode}>(node))return 0;const p=node.props;if((p.value!==undefined&&p.value!==''&&p.value!==false&&!/^All(?:\s|$)/i.test(String(p.value)))||p.checked)return 1;return Children.toArray(p.children).reduce<number>((n,c)=>n+active(c),0);}
 const count=filters.reduce<number>((n,c)=>n+active(c),0);
 return <div className={'cp-filterbar '+className}><div className="cp-filterbar-main"><div className="cp-search-primary">{first}</div>{!!filters.length&&<button className="cp-filter-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}><SlidersHorizontal size={16}/>Filters{count>0&&<b>{count}</b>}</button>}{actions.length>0&&<div className="cp-filter-actions">{actions}</div>}</div>{filters.length>0&&<div id={id} hidden={!open} className="cp-filter-options">{filters}</div>}</div>;
}
