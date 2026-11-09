// The Worker has no local filesystem and must not send confidential document text to a remote converter.
// Only the template fonts and the two approved company marks are packed in this (server-only) module.
import packed from './job-description-template-assets.json' with {type:'json'};
import {renderTemplateJobDescription} from '../../components/people/hr/job-description-pdf.ts';
const unpack=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function buildServerJobDescriptionPdf(content:Record<string,unknown>):Promise<Uint8Array>{
  const pdf=await renderTemplateJobDescription(content,{
    regular:packed.regular, bold:packed.bold, parkingLogo:unpack(packed.parkingLogo), towingLogo:unpack(packed.towingLogo),
  });
  return new Uint8Array(pdf.output('arraybuffer'));
}
