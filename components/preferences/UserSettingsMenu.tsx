'use client';
import ResponsiveSearchInput from '@/components/shared/ResponsiveSearchInput';
import {commandSignOutDestination} from '@/lib/shared/sign-out';
import { useEffect, useState, type CSSProperties } from 'react';
import { Camera, ChevronDown, Palette, Settings, Search, Sparkles, Gift, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { validateTheme, type ThemeId } from '@/lib/preferences/themes';
import {matchesThemeQuery,themeArtStyle,themeArtStyles,themeStyleLabel,type ThemeStyleFilter} from '@/lib/site-themes/model';
import type { Viewer } from '@/lib/finance/model';
import { useWorkspaceTheme } from './WorkspaceTheme';
import ThemeDecorations from './ThemeDecorations';
import PersonAvatar from '@/components/people/PersonAvatar';
import ProfilePhotoEditor from '@/components/people/ProfilePhotoEditor';

export default function UserSettingsMenu({viewer}:{viewer?:Viewer}) {
  const theme=useWorkspaceTheme();
  const [open,setOpen]=useState(false),[selected,setSelected]=useState<ThemeId>(theme.settings.theme),[error,setError]=useState('');
  const [photoOpen,setPhotoOpen]=useState(false),[themeFilter,setThemeFilter]=useState('All Themes'),[themeQuery,setThemeQuery]=useState(''),[artStyle,setArtStyle]=useState<ThemeStyleFilter>('All'),[visibleCount,setVisibleCount]=useState(36);
  const visibleThemes=theme.availableThemes.filter(t=>(themeFilter==='All Themes'||(themeFilter==='Birthday'?t.personalOnly:themeFilter==='Seasonal'?t.seasonal&&!t.personalOnly:!t.seasonal&&!t.personalOnly))&&(artStyle==='All'||themeArtStyle(t.decoration)===artStyle)&&matchesThemeQuery(t,themeQuery));
  const birthday=theme.settings.birthday,baseTheme=theme.availableThemes.find(t=>t.id===(birthday?.baseTheme||theme.settings.selectedTheme||theme.settings.theme)),birthdaySelection=!!theme.availableThemes.find(t=>t.id===selected)?.personalOnly;
  useEffect(()=>{setVisibleCount(36);},[themeFilter,themeQuery,artStyle]);
  useEffect(()=>{if(open&&theme.ready&&!theme.loading&&!theme.availableThemes.some(t=>t.id===selected)){setSelected(theme.settings.theme);theme.preview(null);}},[theme.availableThemes,theme.settings.theme,theme.ready,theme.loading,open,selected]);
  function begin() {setSelected(theme.settings.theme);theme.preview(theme.settings.theme);setError('');setThemeFilter(theme.settings.birthday?.active?'Birthday':'All Themes');setThemeQuery('');setArtStyle('All');setVisibleCount(36);setOpen(true);}
  function close(value:boolean) {if(theme.saving)return;if(!value)theme.preview(null);setOpen(value);}
  async function save() {setError('');try{await theme.save(selected);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Your theme could not be saved.');}}
  async function refresh() {const value=await theme.refresh();if(value){setSelected(value.theme);theme.preview(value.theme);setError('');}}
  async function toggleBirthday(){setError('');setArtStyle('All');try{if(!birthday)return;if(birthday.active){await theme.dismissBirthday();setSelected(birthday.baseTheme);setThemeFilter(baseTheme?.seasonal?'Seasonal':'Everyday');}else{await theme.resumeBirthday();setSelected(birthday.themeId);setThemeFilter('Birthday');}}catch(e){setError(e instanceof Error?e.message:'Your birthday setting could not be saved.');}}
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button className="user p-user-trigger" disabled={!viewer} aria-label="Open your user settings menu"><PersonAvatar personId={viewer?.person||''} name={viewer?.name||'Account'} size={38}/><b>{viewer?.name||'Account'}</b><ChevronDown size={16}/></button></DropdownMenuTrigger>
      <DropdownMenuContent className="p-user-menu" align="end"><DropdownMenuItem disabled={!viewer} onSelect={()=>setPhotoOpen(true)}><Camera size={18}/>Profile Photo</DropdownMenuItem><DropdownMenuItem disabled={theme.loading} onSelect={begin}><Settings size={18}/>User Settings</DropdownMenuItem><DropdownMenuItem onSelect={()=>void commandSignOutDestination({authenticated:!!viewer}).then(destination=>{window.location.assign(destination);}).catch(e=>{setError(e.message);setOpen(true);})}>Sign Out</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="p-settings-dialog" aria-describedby={undefined}>
        <header><DialogTitle>User Settings</DialogTitle><p>{viewer?.name}</p></header>
        <h2 className="p-settings-label"><Palette size={20}/>Workspace Theme</h2>
        {birthday&&<section className="p-birthday-setting" aria-label="Personal Birthday Celebration"><span className="p-birthday-icon"><Gift size={23}/></span><div><h3>{birthday.active?'Happy Birthday!':'Your Birthday Celebration'}</h3><p>{birthday.active?`A celebration just for you. Your ${baseTheme?.name||'saved'} theme returns at midnight, Austin time.`:'Your celebration is paused for today. Your saved theme is unchanged.'}</p><span><Check size={12}/>Visible Only in Your Workspace</span></div><button type="button" disabled={theme.loading||theme.saving} onClick={()=>void toggleBirthday()}>{birthday.active?'Use My Usual Theme Today':'Resume Birthday Celebration'}</button></section>}
        {(error||theme.error) && <div className="p-settings-error" role="alert"><p>{error||theme.error}</p><button disabled={theme.loading||theme.saving} onClick={()=>void refresh()}>Refresh Settings</button></div>}
        {theme.settings.notice&&<p className="p-theme-notice" role="status">{theme.settings.notice}</p>}
        <div className="p-theme-tools"><div className="p-theme-segments" aria-label="Theme Collection">{['All Themes','Everyday','Seasonal',...(birthday?['Birthday']:[])].map(label=><button type="button" key={label} aria-pressed={themeFilter===label} onClick={()=>{setThemeFilter(label);setArtStyle('All');}}>{label}</button>)}</div><label className="p-theme-search"><Search size={15}/><ResponsiveSearchInput aria-label="Search Themes" placeholder="Search Themes…" value={themeQuery} onChange={e=>setThemeQuery(e.target.value)}/></label></div>
        {themeFilter!=='Everyday'&&<label className="p-art-style-select">Design Style<select aria-label="Design Style" value={artStyle} onChange={e=>setArtStyle(e.target.value as ThemeStyleFilter)}>{(['All',...themeArtStyles] as const).map(value=><option key={value} value={value}>{themeStyleLabel(value,themeFilter)}</option>)}</select></label>}
        {!theme.ready ? <p role="status">{theme.loading?'Loading your settings…':'Your settings are unavailable.'}</p> :
          <RadioGroup className="p-theme-grid" aria-label="Workspace theme" value={selected} disabled={theme.saving||theme.loading} onValueChange={value=>{const id=validateTheme(value);setSelected(id);theme.preview(id);}}>
            {visibleThemes.slice(0,visibleCount).map(option=><label key={option.id} className="p-theme-option" data-selected={selected===option.id}>
              <RadioGroupItem value={option.id} aria-labelledby={option.id+'-name'} aria-describedby={option.id+'-mood'}/>
              <div className="p-theme-preview" data-art={themeArtStyle(option.decoration)!=='Classic Color'} data-style={themeArtStyle(option.decoration)} aria-hidden="true" style={{'--preview-nav':option.tokens.nav,'--preview-canvas':option.tokens.canvas,'--preview-card':option.tokens.soft,'--preview-alt':option.tokens.softAlt,'--preview-accent':option.tokens.accent} as CSSProperties}><i/><div className="p-theme-preview-body"><span/><section><b/><b/></section></div><ThemeDecorations decoration={option.decoration} tokens={option.tokens} placement="preview"/></div>
              <div className="p-theme-name"><span className="p-theme-season">{option.personalOnly?<Gift size={10}/>:option.seasonal?<Sparkles size={10}/>:<Palette size={10}/>} {option.personalOnly?'Your Birthday':option.category} · {themeStyleLabel(themeArtStyle(option.decoration),option.category)}</span><b id={option.id+'-name'}>{option.name}</b><small id={option.id+'-mood'}>{option.mood}</small></div>
              <div className="p-theme-swatches" aria-hidden="true">{option.colors.map(color=><span key={color} style={{backgroundColor:color}}/>)}</div>
            </label>)}
          </RadioGroup>}
        {theme.ready&&visibleThemes.length>visibleCount&&<button type="button" className="p-theme-more" onClick={()=>setVisibleCount(n=>n+36)}>Show More Designs <small>{Math.min(visibleCount,visibleThemes.length)} of {visibleThemes.length}</small></button>}
        {theme.ready&&!visibleThemes.length&&<p className="p-theme-empty">{artStyle!=='All'?'There are no available themes in this style for your selection. ':themeFilter==='Seasonal'&&!themeQuery?'No seasonal themes are available right now. Your everyday themes are always here.':'No themes match your search. '}{artStyle!=='All'&&<button type="button" onClick={()=>setArtStyle('All')}>Show All Styles</button>}</p>}
        <p className="p-theme-personal">{birthdaySelection?'This birthday design is just for today. Your saved theme stays unchanged.':birthday?.active?'Save to use this theme now and pause your birthday celebration for today. You can resume the celebration above.':'Your theme changes your workspace only. When a seasonal theme ends, your previous everyday theme returns automatically.'}</p>
        <footer><button className="p-settings-button" disabled={theme.saving} onClick={()=>close(false)}>Cancel</button><button className="p-settings-button primary" disabled={!theme.ready||theme.loading||theme.saving} onClick={()=>void save()}>{theme.saving?'Saving…':birthdaySelection?'Save Birthday Style':birthday?.active?'Use Selected Theme Today':'Save Theme'}</button></footer>
      </DialogContent>
    </Dialog>
    <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
      <DialogContent aria-describedby={undefined} style={{maxWidth:520}}><DialogTitle>Profile Photo</DialogTitle>{viewer&&<ProfilePhotoEditor personId={viewer.person} name={viewer.name} onClose={()=>setPhotoOpen(false)}/>}</DialogContent>
    </Dialog>
  </>;
}
