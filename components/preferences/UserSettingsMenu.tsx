'use client';
import { useState, type CSSProperties } from 'react';
import { ChevronDown, Palette, Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { themes, validateTheme, type ThemeId } from '@/lib/preferences/themes';
import type { Viewer } from '@/lib/finance/model';
import { useWorkspaceTheme } from './WorkspaceTheme';

export default function UserSettingsMenu({viewer}:{viewer?:Viewer}) {
  const theme=useWorkspaceTheme();
  const [open,setOpen]=useState(false),[selected,setSelected]=useState<ThemeId>(theme.settings.theme),[error,setError]=useState('');
  function begin() {setSelected(theme.settings.theme);theme.preview(theme.settings.theme);setError('');setOpen(true);}
  function close(value:boolean) {if(theme.saving)return;if(!value)theme.preview(null);setOpen(value);}
  async function save() {setError('');try{await theme.save(selected);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Your theme could not be saved.');}}
  async function refresh() {const value=await theme.refresh();if(value){setSelected(value.theme);theme.preview(value.theme);setError('');}}
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button className="user p-user-trigger" disabled={!viewer} aria-label="Open your user settings menu"><span>{viewer?.name?.charAt(0)||'?'}</span><b>{viewer?.name||'Account'}</b><ChevronDown size={16}/></button></DropdownMenuTrigger>
      <DropdownMenuContent className="p-user-menu" align="end"><DropdownMenuItem disabled={theme.loading} onSelect={begin}><Settings size={18}/>User settings</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="p-settings-dialog" aria-describedby={undefined}>
        <header><DialogTitle>User settings</DialogTitle><p>{viewer?.name}</p></header>
        <h2 className="p-settings-label"><Palette size={20}/>Workspace theme</h2>
        {(error||theme.error) && <div className="p-settings-error" role="alert"><p>{error||theme.error}</p><button disabled={theme.loading||theme.saving} onClick={()=>void refresh()}>Refresh settings</button></div>}
        {!theme.ready ? <p role="status">{theme.loading?'Loading your settings…':'Your settings are unavailable.'}</p> :
          <RadioGroup className="p-theme-grid" aria-label="Workspace theme" value={selected} disabled={theme.saving||theme.loading} onValueChange={value=>{const id=validateTheme(value);setSelected(id);theme.preview(id);}}>
            {themes.map(option=><label key={option.id} className="p-theme-option" data-selected={selected===option.id}>
              <RadioGroupItem value={option.id} aria-labelledby={option.id+'-name'} aria-describedby={option.id+'-mood'}/>
              <div className="p-theme-preview" aria-hidden="true" style={{'--preview-nav':option.tokens.nav,'--preview-canvas':option.tokens.canvas,'--preview-card':option.tokens.soft,'--preview-alt':option.tokens.softAlt,'--preview-accent':option.tokens.accent} as CSSProperties}><i/><div><span/><section><b/><b/></section></div></div>
              <div className="p-theme-name"><b id={option.id+'-name'}>{option.name}</b><small id={option.id+'-mood'}>{option.mood}</small></div>
              <div className="p-theme-swatches" aria-hidden="true">{option.colors.map(color=><span key={color} style={{backgroundColor:color}}/>)}</div>
            </label>)}
          </RadioGroup>}
        <footer><button className="p-settings-button" disabled={theme.saving} onClick={()=>close(false)}>Cancel</button><button className="p-settings-button primary" disabled={!theme.ready||theme.loading||theme.saving} onClick={()=>void save()}>{theme.saving?'Saving…':'Save theme'}</button></footer>
      </DialogContent>
    </Dialog>
  </>;
}
