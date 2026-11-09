import source from './history-data.json';
import type {Row} from './model';

/** Corrected Towbook calls replace the import with the same identifier. */
export function vehicles(all:Row[]):Row[] {
  const map=new Map((source.vehicles as Row[]).map(row=>[row.id,row]));
  for(const row of all)if(row.kind==='vehicle')map.set(row.id,row);
  return [...map.values()];
}
