'use client';
import {documentTypesFor} from '@/lib/ccr/document-types';
export default function DamageFileTypeFields({value,onChange,other,onOther,disabled}:{value:string;onChange:(v:string)=>void;other:string;onOther:(v:string)=>void;disabled?:boolean}){
 return <div className="ccrc-typepick"><label><span>Document Type</span><select disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}><option value="">Choose a Document Type…</option>{documentTypesFor('damage').map(o=><option key={o}>{o}</option>)}</select></label>{value==='Other'&&<label><span>Other Document Type</span><input disabled={disabled} maxLength={100} value={other} onChange={e=>onOther(e.target.value)}/></label>}</div>;
}
