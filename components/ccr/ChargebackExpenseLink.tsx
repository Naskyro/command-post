'use client';
import {createContext,useContext, type ReactNode} from 'react';
import {ArrowUpRight} from 'lucide-react';
import type {Viewer} from '@/lib/finance/model';
import {canAccess} from '@/lib/finance/access';
import {canPrepareCcrExpense,costKey} from '@/lib/ccr/expense-handoff';

type Nav=(module:string,tab?:string,section?:string)=>void;
const Context=createContext<{viewer:Viewer;go:Nav}|null>(null);
export function CcrExpenseNavigation({viewer,go,children}:{viewer:Viewer;go:Nav;children:ReactNode}){
 return <Context.Provider value={{viewer,go}}>{children}</Context.Provider>;
}
export default function ChargebackExpenseLink({recordId,entryId}:{recordId:string;entryId:string}){
 const nav=useContext(Context);
 if(!nav||!canPrepareCcrExpense(nav.viewer))return null;
 return <button type="button" className="ccrr-button" title="Review this cost in Finance. Evidence stays in CCR." onClick={()=>nav.go('Finance',canAccess(nav.viewer,'Finance','My spending',true)?'My spending':'Outflows',costKey(recordId,entryId))}>Review in Finance <ArrowUpRight size={14} aria-hidden="true"/></button>;
}
