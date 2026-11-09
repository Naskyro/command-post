'use client';
import {themeArtStyle,type ThemeDecoration} from '@/lib/site-themes/model';
import {natureArt} from '@/lib/site-themes/nature-art';
import type {ThemeTokens} from '@/lib/preferences/themes';
import {ChristmasWreath,ChristmasGarland,SeasonalScene} from './SeasonalIllustrations';
import {ElegantSeasonalArt} from './ElegantSeasonalArt';
import {IndependenceArt} from './IndependenceArt';
import './theme-decorations.css';

type Placement='menu'|'header'|'footer'|'preview';
export type ThemeArtPlacement=Placement|'shell';

/** A design's identity is the same in the picker, gallery, and active workspace. */
export function ThemeDesignArt({decoration,placement='preview',className}:{decoration?:ThemeDecoration;placement?:Placement;className?:string}){
 if(!decoration)return null;
 const {motif,variant}=decoration,style=themeArtStyle(decoration);
 if(style==='Classic Color')return null;
 if(style==='Nature & Realistic'){
  const photo=natureArt(motif,variant);
  return <img className={'theme-photograph '+(className||'')} src={photo.src} alt="" aria-hidden="true" decoding="async" draggable={false} style={{objectPosition:photo.position}}/>;
 }
 // Keep the evergreen garland of Fireside Noel, including for existing selections.
 if(placement==='header'&&motif==='christmas'&&(style==='Whimsical'||variant===6))return <ChristmasGarland variant={variant} className={className}/>;
 if(motif==='independence')return <IndependenceArt variant={variant} placement={placement} className={className}/>;
 if(style==='Elegant')return <ElegantSeasonalArt motif={motif} variant={variant} placement={placement} className={className}/>;
 if(motif==='christmas'&&(placement==='menu'||placement==='preview')&&[1,5,9].includes(variant))return <ChristmasWreath variant={variant} className={className}/>;
 return <SeasonalScene motif={motif} variant={variant} className={className}/>;
}

/** Art is contained in its own band; classic palettes never reserve empty artwork space. */
export default function ThemeDecorations({decoration,placement='shell'}:{decoration?:ThemeDecoration;tokens?:ThemeTokens;placement?:ThemeArtPlacement}){
 if(!decoration||placement==='shell'||themeArtStyle(decoration)==='Classic Color')return null;
 const {motif,variant,layout}=decoration,style=themeArtStyle(decoration);
 const photographic=style==='Nature & Realistic';
 const garland=placement==='header'&&motif==='christmas'&&(style==='Whimsical'||variant===6);
 const framed=(placement==='header'||placement==='footer')&&!garland&&!photographic;
 return <div className={'theme-decorations theme-decorations--'+placement+' theme-decorations--'+layout+(photographic?' theme-decorations--photo':'')} data-motif={motif} data-style={style} data-variant={variant} aria-hidden="true">
  {framed?<div className="theme-frieze"><i/><ThemeDesignArt decoration={decoration} placement={placement} className="theme-frieze-art"/><i/></div>:
   <ThemeDesignArt decoration={decoration} placement={placement} className={garland?'theme-header-garland':'theme-'+placement+'-scene'}/>}
 </div>;
}
