'use client';
import {createContext,useContext} from 'react';
import type {Viewer} from '@/lib/finance/model';
import {canAccess,accessCatalog} from '@/lib/finance/access';
export const AccessContext=createContext<{viewer?:Viewer;module:string}>({module:''});
export function useTabAccess(){const {viewer,module}=useContext(AccessContext);return (tab?:string,edit=false)=>!module||!viewer||canAccess(viewer,module,tab&&accessCatalog[module]?.[tab]?tab:undefined,edit);}
export default function AccessScope({viewer,module,children}:{viewer:Viewer;module:string;children:React.ReactNode}){return <AccessContext.Provider value={{viewer,module}}>{children}</AccessContext.Provider>;}
