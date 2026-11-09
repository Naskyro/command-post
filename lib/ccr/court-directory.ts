import {AppError,ConflictError} from '../shared/errors.ts';
export type CourtChoice={id:string;kind:'court'|'judge';label:string;courtId?:string;active:boolean;aliases:string[];source?:string};
export type CourtDirectory={version:number;choices:CourtChoice[]};
const jp='https://www.traviscountytx.gov/fines-of-traffic',county='https://www.traviscountytx.gov/courts/civil/county';
const pairs=[['jp1','Travis County Justice Court, Precinct 1','Yvonne M. Williams'],['jp2','Travis County Justice Court, Precinct 2','Randall Slagle'],['jp3','Travis County Justice Court, Precinct 3','Sylvia Holmes'],['jp4','Travis County Justice Court, Precinct 4','Raúl A. González'],['jp5','Travis County Justice Court, Precinct 5','Tanisa Jeffers'],['cc1','Travis County Court at Law No. 1','Todd Wong'],['cc2','Travis County Court at Law No. 2','Eric Shepperd']];
export function baselineCourtDirectory():CourtDirectory{return {version:0,choices:pairs.flatMap(([key,name,judge])=>{const source=key.startsWith('jp')?jp:county;return [{id:key,kind:'court',label:name,active:true,aliases:key.startsWith('jp')?['Travis County Justice of the Peace, Precinct '+key.slice(-1)]:[],source},{id:'judge-'+key,kind:'judge',label:judge,courtId:key,active:true,aliases:key==='jp4'?['Raul Arturo Gonzalez','Raúl Arturo González']:key==='cc1'?['Todd T. Wong']:key==='cc2'?['Eric M. Shepperd']:[],source}];})};}
export const directoryKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function savedChoice(c:Pick<CourtChoice,'label'|'aliases'>,s:string){return [c.label,...c.aliases].some(n=>directoryKey(n)===directoryKey(s));}
const value=(v:unknown,n:number)=>typeof v==='string'&&v.trim().length<=n&&!/[\u0000-\u001f]/.test(v)?v.trim():'';
export function changeCourtDirectory(prev:CourtDirectory,b:Record<string,unknown>,newId:string):CourtDirectory{
 if(b.version!==prev.version)throw new ConflictError('The directory changed. Reload the choices and try again.');
 const kind=b.kind,action=b.action;if(!['add','edit','archive','restore'].includes(String(action))||(kind!=='court'&&kind!=='judge'))throw new AppError('Choose a valid directory action.');
 const all=prev.choices.map(c=>({...c,aliases:[...c.aliases]})),existing=all.find(c=>c.id===b.id&&c.kind===kind),reason=value(b.reason,500);
 if(!reason)throw new AppError('Enter a reason for this directory change.');
 if(action!=='add'&&!existing)throw new AppError('Directory entry not found.',404);
 if(action==='archive'||action==='restore'){if(existing!.active===(action==='restore'))throw new ConflictError('This choice already has that status.');existing!.active=action==='restore';}
 else{const label=value(b.label,180);if(!label)throw new AppError('Enter a name.');const courtId=kind==='judge'?value(b.courtId,90):'';
  if(courtId&&!all.some(c=>c.kind==='court'&&c.id===courtId&&(c.active||existing?.courtId===c.id)))throw new AppError('Select an active court or leave the judge unassigned.');
  if(all.some(c=>c.kind===kind&&c.id!==existing?.id&&savedChoice(c,label)))throw new ConflictError('That name already exists. Edit or restore the existing choice.');
  if(action==='add')all.push({id:newId,kind,label,active:true,aliases:[],...(courtId?{courtId}:{})});
  else{if(!existing!.active)throw new AppError('Restore the choice before editing.');if(existing!.label!==label&&!existing!.aliases.includes(existing!.label))existing!.aliases.push(existing!.label);existing!.label=label;if(kind==='judge')existing!.courtId=courtId||undefined;}
 }
 return {version:prev.version+1,choices:all};
}
