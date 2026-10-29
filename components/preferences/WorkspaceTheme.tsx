'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { requestJson } from '@/lib/shared/client';
import { defaultTheme, themeById, validateTheme, type ThemeId, type UserSettings } from '@/lib/preferences/themes';
import './themes.css';

type ThemeContextValue = {
  settings:UserSettings;ready:boolean;loading:boolean;error:string;saving:boolean;
  preview:(theme:ThemeId|null)=>void;refresh:()=>Promise<UserSettings|null>;save:(theme:ThemeId)=>Promise<void>;
};
const ThemeContext=createContext<ThemeContextValue|null>(null);
export function useWorkspaceTheme() {const value=useContext(ThemeContext);if(!value)throw new Error('Workspace theme is unavailable.');return value;}

export default function WorkspaceTheme({children}:{children:ReactNode}) {
  const [settings,setSettings]=useState<UserSettings>({theme:defaultTheme,version:0,updatedAt:null});
  const [previewTheme,setPreviewTheme]=useState<ThemeId|null>(null),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const lock=useRef(false),previewRef=useRef<ThemeId|null>(null);
  function preview(theme:ThemeId|null) {previewRef.current=theme;setPreviewTheme(theme);}
  async function refresh():Promise<UserSettings|null> {
    if(lock.current)return null;
    lock.current=true;setLoading(true);
    try {
      const result=await requestJson<UserSettings>('/api/user-settings');validateTheme(result.theme);
      setSettings(result);setReady(true);setError('');return result;
    } catch(e) {setError(e instanceof Error?e.message:'Your theme could not be loaded.');return null;}
    finally {lock.current=false;setLoading(false);}
  }
  async function save(theme:ThemeId) {
    if(lock.current || !ready)throw new Error('Wait for your settings to finish loading.');
    lock.current=true;setSaving(true);
    try {
      const result=await requestJson<UserSettings>('/api/user-settings',{theme:validateTheme(theme),version:settings.version});
      validateTheme(result.theme);setSettings(result);preview(null);setError('');
    } finally {lock.current=false;setSaving(false);}
  }
  useEffect(()=>{
    void refresh();
    const visible=()=>{if(document.visibilityState==='visible'&&previewRef.current===null)void refresh();};
    document.addEventListener('visibilitychange',visible);
    return()=>document.removeEventListener('visibilitychange',visible);
  },[]);
  useEffect(()=>{
    const selected=themeById(previewTheme??settings.theme),root=document.documentElement;
    for(const [key,value] of Object.entries(selected.tokens))root.style.setProperty('--ws-'+key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase()),value);
    root.dataset.workspaceTheme=selected.id;
  },[previewTheme,settings.theme]);
  return <ThemeContext.Provider value={{settings,ready,loading,error,saving,preview,refresh,save}}>{children}</ThemeContext.Provider>;
}
