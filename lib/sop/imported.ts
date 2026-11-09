// Server-only source archive. These modules must never be imported by client components.
import catalog from './private/catalog.json';
import topics from './private/topics.json';
import parts from './private/objects.json';
import mappings from './private/original-files.json';
export const importedPolicies = catalog;
export const importedTopics = topics;
const files: Record<string,number[]> = mappings;
/** Reconstruct the exact uploaded PDF including fonts, links, pagination and image streams. */
export function originalPdf(id:string): Uint8Array|null {
  if(!Object.prototype.hasOwnProperty.call(files,id)) return null;
  const segments=files[id].map(i=>atob(parts[i]));
  const result=new Uint8Array(segments.reduce((n,s)=>n+s.length,0));
  let pos=0;
  for(const s of segments)for(let i=0;i<s.length;i++)result[pos++]=s.charCodeAt(i);
  return result;
}
