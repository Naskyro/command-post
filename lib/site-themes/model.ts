import type {ThemeTokens} from '../preferences/themes.ts';
export type ThemeMotif='christmas'|'thanksgiving'|'valentines'|'independence'|'black-history'|'easter'|'halloween'|'new-year'|'fall'|'summer'|'spring'|'winter'|'mlk'|'presidents'|'memorial'|'juneteenth'|'labor'|'columbus-indigenous'|'veterans'|'birthday';
export const themeArtStyles=['Whimsical','Elegant','Nature & Realistic','Classic Color'] as const;
export type ThemeArtStyle=typeof themeArtStyles[number];
export type ThemeStyleFilter='All'|ThemeArtStyle;
export type ThemeDecoration={motif:ThemeMotif;variant:number;style?:ThemeArtStyle;layout:'garland'|'corners'|'scattered'|'ribbon'|'border'|'canopy'|'constellation'|'sunburst'|'bouquet'|'minimal'|'photograph'|'photo-study'|'solid'|'duotone';colors:readonly string[];intensity:'subtle'|'balanced'|'festive'};
export type SiteThemeDefinition={id:string;name:string;mood:string;colors:readonly string[];tokens:ThemeTokens;category:string;seasonal:boolean;personalOnly?:boolean;decoration?:ThemeDecoration;federalHoliday?:string;observanceNote?:string};
export type SiteThemeStatus='Available'|'Scheduled'|'Hidden'|'Archived';
export type SiteTheme=SiteThemeDefinition & {version:number;status:SiteThemeStatus;startsAt?:string;endsAt?:string;updatedAt?:string;updatedBy?:string;reason?:string;available:boolean};
export type SiteThemesData={themes:SiteTheme[];canManage:boolean;canViewAdmin:boolean;serverNow:string;nextChangeAt?:string};

// Style belongs to the design, not its availability record or the employee's preference.
// Older payloads still carry a stable variant and can be identified without a migration.
export function themeArtStyle(decoration?:ThemeDecoration):ThemeArtStyle {
 if(!decoration)return 'Classic Color';
 return decoration.style ?? (decoration.variant>12?'Classic Color':decoration.variant>10?'Nature & Realistic':decoration.variant%2===0?'Elegant':'Whimsical');
}
const commemorative = new Set(['Memorial Day','Veterans Day','Juneteenth','Martin Luther King Jr. Day','Black History Month']);
export function themeStyleLabel(style:ThemeStyleFilter,category?:string) {
 if(style==='All')return 'All Styles';
 if(style==='Whimsical'&&commemorative.has(category||''))return 'Illustrated';
 return style;
}
export function matchesThemeQuery(theme:Pick<SiteThemeDefinition,'category'|'decoration'|'mood'|'name'>,query:string) {
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 if(!words.length)return true;
 const style=themeArtStyle(theme.decoration);
 const aliases=theme.decoration?.motif==='independence'?' fourth of july 4th of july july 4 july fourth july 4th':'';
 const content=[theme.category,theme.name,theme.mood,style,style&&themeStyleLabel(style,theme.category),style==='Elegant'?'luxury luxe formal':style==='Whimsical'?'playful illustrated':style==='Nature & Realistic'?'photographic photography natural realistic nature':'color only palette',aliases].filter(Boolean).join(' ').toLowerCase();
 return words.every(word=>content.includes(word));
}
