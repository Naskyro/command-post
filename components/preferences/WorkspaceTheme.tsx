'use client';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {requestJson} from '@/lib/shared/client';
import {defaultTheme,themeById,validateTheme,themes,isPermanentTheme,type ThemeId,type UserSettings} from '@/lib/preferences/themes';
import type {SiteThemeDefinition} from '@/lib/site-themes/model';
import ThemeDecorations,{type ThemeArtPlacement} from './ThemeDecorations';
import './themes.css';

type ThemeContextValue={settings:UserSettings;availableThemes:SiteThemeDefinition[];effectiveTheme:SiteThemeDefinition;ready:boolean;loading:boolean;error:string;saving:boolean;preview:(theme:ThemeId|null)=>void;refresh:()=>Promise<UserSettings|null>;save:(theme:ThemeId)=>Promise<void>;dismissBirthday:()=>Promise<void>;resumeBirthday:()=>Promise<void>};
const ThemeContext=createContext<ThemeContextValue|null>(null);
export function useWorkspaceTheme(){const value=useContext(ThemeContext);if(!value)throw new Error('Workspace theme is unavailable.');return value;}
export function WorkspaceThemeArt({placement}:{placement:ThemeArtPlacement}){const {effectiveTheme}=useWorkspaceTheme();return <ThemeDecorations decoration={effectiveTheme.decoration} tokens={effectiveTheme.tokens} placement={placement}/>;}
const permanent=themes.map(t=>({...t,colors:[...t.colors],category:'Everyday',seasonal:false})) as SiteThemeDefinition[];
export default function WorkspaceTheme({children}:{children:ReactNode}){
 const [settings,setSettings]=useState<UserSettings>({theme:defaultTheme,version:0,updatedAt:null}),[previewTheme,setPreviewTheme]=useState<ThemeId|null>(null),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const lock=useRef(false),previewRef=useRef<ThemeId|null>(null),availableThemes=settings.availableThemes||permanent;
 const effectiveTheme=availableThemes.find(t=>t.id===(previewTheme??settings.theme))||themeById(defaultTheme);
 function preview(theme:ThemeId|null){if(theme!==null&&!availableThemes.some(t=>t.id===theme))return;previewRef.current=theme;setPreviewTheme(theme);}
 async function refresh():Promise<UserSettings|null>{
  if(lock.current)return null;lock.current=true;setLoading(true);
  try{const result=await requestJson<UserSettings>('/api/user-settings');validateTheme(result.theme);const next=result.availableThemes||permanent;if(previewRef.current&&!next.some(t=>t.id===previewRef.current)){previewRef.current=null;setPreviewTheme(null);}setSettings(result);setReady(true);setError('');return result;}
  catch(e){setError(e instanceof Error?e.message:'Your theme could not be loaded.');return null;}
  finally{lock.current=false;setLoading(false);}
 }
 async function persist(payload:Record<string,unknown>){
  if(lock.current||!ready)throw new Error('Wait for your settings to finish loading.');lock.current=true;setSaving(true);
  try{const result=await requestJson<UserSettings>('/api/user-settings',{...payload,version:settings.version});validateTheme(result.theme);setSettings(result);preview(null);setError('');}
  finally{lock.current=false;setSaving(false);}
 }
 async function save(theme:ThemeId){const option=availableThemes.find(t=>t.id===theme);if(!option)throw new Error('This theme is no longer available. Refresh your settings.');await persist(option.personalOnly?{action:'birthday-theme',theme:validateTheme(theme)}:{theme:validateTheme(theme),...(settings.birthday?.active?{dismissBirthday:true}:{})});}
 async function dismissBirthday(){await persist({action:'dismiss-birthday'});}
 async function resumeBirthday(){if(!settings.birthday)throw new Error('A birthday celebration is not available today.');await persist({action:'birthday-theme',theme:settings.birthday.themeId});}
 const refreshRef=useRef(refresh);refreshRef.current=refresh;
 useEffect(()=>{if(window.location.pathname.replace(/\/$/,'')==='/ccr/source-desk'){setLoading(false);return;}void refreshRef.current();const visible=()=>{if(document.visibilityState==='visible')void refreshRef.current();};document.addEventListener('visibilitychange',visible);window.addEventListener('site-themes-updated',visible);return()=>{document.removeEventListener('visibilitychange',visible);window.removeEventListener('site-themes-updated',visible);};},[]);
 // A birthday is an overlay, not a stored replacement for an employee's theme.
 // End it locally at the server-supplied Central midnight even when a refresh fails.
 useEffect(()=>{
  if(!settings.birthday)return;const expiry=Date.parse(settings.birthday.endsAt);if(!Number.isFinite(expiry))return;let timer:number;
  const arm=()=>{timer=window.setTimeout(()=>{if(Date.now()<expiry){arm();return;}
   setSettings(s=>{if(!s.birthday)return s;const base=s.birthday.baseTheme;return {...s,theme:base,birthday:undefined,availableThemes:s.availableThemes?.filter(t=>!t.personalOnly),notice:'Your birthday celebration has ended. Your saved theme is back.'};});
   if(previewRef.current&&availableThemes.some(t=>t.id===previewRef.current&&t.personalOnly)){previewRef.current=null;setPreviewTheme(null);}void refreshRef.current();
  },Math.max(100,Math.min(24*60*60*1000,expiry-Date.now()+100)));};arm();return()=>window.clearTimeout(timer);
 },[settings.birthday?.endsAt]);
 useEffect(()=>{
  const base=settings.birthday?.baseTheme||settings.theme;if(!settings.seasonalExpiresAt||isPermanentTheme(base))return;const expiry=Date.parse(settings.seasonalExpiresAt);if(!Number.isFinite(expiry))return;let timer:number;
  const arm=()=>{timer=window.setTimeout(()=>{if(Date.now()<expiry){arm();return;}const fallback=settings.fallbackTheme&&isPermanentTheme(settings.fallbackTheme)?settings.fallbackTheme:defaultTheme;
   setSettings(s=>({...s,theme:s.birthday?.active?s.theme:fallback,birthday:s.birthday?{...s.birthday,baseTheme:fallback}:undefined,notice:'The seasonal theme has ended. Your saved everyday theme is restored.'}));
   if(previewRef.current===base){previewRef.current=null;setPreviewTheme(null);}void refreshRef.current();
  },Math.max(100,Math.min(24*60*60*1000,expiry-Date.now()+100)));};arm();return()=>window.clearTimeout(timer);
 },[settings.seasonalExpiresAt,settings.theme,settings.birthday?.baseTheme,settings.fallbackTheme]);
 useEffect(()=>{if(!settings.nextChangeAt)return;const boundary=Date.parse(settings.nextChangeAt);if(!Number.isFinite(boundary))return;let timer:number;const arm=()=>{timer=window.setTimeout(()=>{if(Date.now()<boundary){arm();return;}void refreshRef.current();},Math.max(200,Math.min(24*60*60*1000,boundary-Date.now()+300)));};arm();return()=>window.clearTimeout(timer);},[settings.nextChangeAt,settings.version]);
 useEffect(()=>{if(!ready)return;const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refreshRef.current();},60000);return()=>window.clearInterval(timer);},[ready]);
 useEffect(()=>{const root=document.documentElement;for(const [key,value]of Object.entries(effectiveTheme.tokens))root.style.setProperty('--ws-'+key.replace(/[A-Z]/g,l=>'-'+l.toLowerCase()),value);root.dataset.workspaceTheme=effectiveTheme.id;},[effectiveTheme]);
 return <ThemeContext.Provider value={{settings,availableThemes,effectiveTheme,ready,loading,error,saving,preview,refresh,save,dismissBirthday,resumeBirthday}}>{children}</ThemeContext.Provider>;
}
