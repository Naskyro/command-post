import { AppError } from '../shared/errors.ts';

export type ThemeTokens = {
  nav: string; navEnd: string; accent: string; ink: string; muted: string;
  canvas: string; surface: string; soft: string; softAlt: string; line: string; highlight: string;
};
export const themes = [
  { id: 'command-post', name: 'Command Post', mood: 'Clear & confident', colors: ['#052F56','#0968E8','#BBD7FC','#FFFFFF','#EAF1FA'],
    tokens: {nav:'#052f56',navEnd:'#032641',accent:'#075cc3',ink:'#10213a',muted:'#53657a',canvas:'#f4f7fc',surface:'#ffffff',soft:'#e3efff',softAlt:'#edf5fc',line:'#c7d7e9',highlight:'#bbd7fc'} },
  { id: 'sunset', name: 'Sunset', mood: 'Warm & upbeat', colors: ['#FF6F61','#FFD54F','#A1C6EA','#F5F5F5','#B0BEC5'],
    tokens: {nav:'#542e36',navEnd:'#352731',accent:'#a83c32',ink:'#3a2730',muted:'#6e555c',canvas:'#fff8f2',surface:'#ffffff',soft:'#ffe4dd',softAlt:'#fff3ca',line:'#e6c9c1',highlight:'#a1c6ea'} },
  { id: 'garden', name: 'Garden', mood: 'Fresh & calm', colors: ['#A8D8B9','#E3F6F5','#C7E9B0','#F1F4F3','#8A9A5B'],
    tokens: {nav:'#294c3b',navEnd:'#213c32',accent:'#356d4c',ink:'#233b2f',muted:'#54685a',canvas:'#f2f7f2',surface:'#ffffff',soft:'#e0f0df',softAlt:'#e3f6f5',line:'#c1d8c6',highlight:'#c7e9b0'} },
  { id: 'woodland', name: 'Woodland', mood: 'Grounded & natural', colors: ['#A9A9A9','#4B8B3B','#D2B48C','#C0C0C0','#2F4F4F'],
    tokens: {nav:'#2f4f4f',navEnd:'#263d3d',accent:'#3b702e',ink:'#293c36',muted:'#5a675f',canvas:'#f6f4ef',surface:'#ffffff',soft:'#ede2d1',softAlt:'#e7eddf',line:'#d0d0bd',highlight:'#d2b48c'} },
  { id: 'coast', name: 'Coast', mood: 'Cool & clear', colors: ['#A8D8E8','#B2E1E0','#F0F4F8','#5B9BD5','#4B4E56'],
    tokens: {nav:'#294f64',navEnd:'#293e4b',accent:'#28678f',ink:'#273b49',muted:'#506675',canvas:'#f0f4f8',surface:'#ffffff',soft:'#ddf0f7',softAlt:'#e0f3f1',line:'#bed6df',highlight:'#b2e1e0'} },
  { id: 'night-sky', name: 'Night Sky', mood: 'Deep & focused', colors: ['#1E1E78','#0B3D91','#4B0082','#2E2E55','#A8C8E8'],
    tokens: {nav:'#1e1e78',navEnd:'#2e2e55',accent:'#4d3690',ink:'#272744',muted:'#5e5d77',canvas:'#f4f4fb',surface:'#ffffff',soft:'#e9e3f6',softAlt:'#e2ecf9',line:'#cec8e4',highlight:'#a8c8e8'} },
  { id: 'ember', name: 'Ember', mood: 'Bold & energetic', colors: ['#E4CB18','#FFE45C','#CF2024','#A30000','#232020'],
    tokens: {nav:'#292526',navEnd:'#191819',accent:'#ab2025',ink:'#36292b',muted:'#6b595a',canvas:'#f7f4f3',surface:'#ffffff',soft:'#ffe6df',softAlt:'#fff4c7',line:'#e1c9c5',highlight:'#ffe45c'} },
  { id: 'field-day', name: 'Field Day', mood: 'Earthy & bright', colors: ['#243E24','#4A5B0E','#658837','#FFF279','#FCE640'],
    tokens: {nav:'#243e24',navEnd:'#26351c',accent:'#4b5c15',ink:'#303b24',muted:'#606a4c',canvas:'#f7f8ee',surface:'#ffffff',soft:'#ebf0d8',softAlt:'#fcf5c0',line:'#d3d9b9',highlight:'#fce640'} },
] as const satisfies readonly {id:string;name:string;mood:string;colors:readonly string[];tokens:ThemeTokens}[];

export type ThemeId = typeof themes[number]['id'];
export const defaultTheme: ThemeId = 'command-post';
export type UserSettings = {theme:ThemeId;version:number;updatedAt:string|null};
export function themeById(id: ThemeId) { return themes.find(theme => theme.id === id)!; }
export function validateTheme(value: unknown): ThemeId {
  if (typeof value !== 'string' || !themes.some(theme => theme.id === value)) throw new AppError('Choose one of the available themes.');
  return value as ThemeId;
}
export function validateSettings(value: Record<string,unknown>) {
  if (Object.keys(value).some(key => !['theme','version'].includes(key))) throw new AppError('Only your appearance settings can be changed here.');
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 0) throw new AppError('Refresh your settings before saving.');
  return {theme:validateTheme(value.theme),version:Number(value.version)};
}
