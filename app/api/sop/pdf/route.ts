import {NextResponse} from 'next/server';
import {context,protectedPolicy,library} from '@/lib/sop/server';
import {onboardingViewer,assignedPolicy,onboardingSopProgress} from '@/lib/sop/onboarding';
import {correctiveView,canManageCorrectiveContent} from '@/lib/sop/corrective-access';
import {isCorrectivePolicy,correctiveSectionVisibility,hasCorrectiveEmployeeGuide} from '@/lib/sop/corrective-content';
import type {StoredEdition} from '@/lib/sop/publication';
import type {Policy} from '@/lib/sop/model';
import {originalPdf} from '@/lib/sop/imported';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';

export const dynamic='force-dynamic';
export async function GET(r:Request){try{
 const q=new URL(r.url).searchParams,download=q.get('download')==='1',source=q.get('source')==='1',isOnboarding=q.get('onboarding')==='1';
 const id=q.get('id')||'',version=Number(q.get('version')),requested=q.get('edition');
 if(requested!==null&&requested!=='employee'&&requested!=='management')throw new AppError('Unknown policy guide.');
 const ctx=isOnboarding?null:await context(r);
 if((download||source)&&!ctx?.canEdit)throw new ForbiddenError();
 const onboarding=isOnboarding?await onboardingViewer(r):null;
 const person=ctx?.person||onboarding!.p;
 let p:StoredEdition=onboarding?await assignedPolicy(person,onboarding.records,id,version):await protectedPolicy(ctx!,id,version);
 // Access is determined from authenticated personnel data and the stored policy, never from the URL.
 const restricted=isCorrectivePolicy(p)||[id,p.code,p.originalReference].some(x=>/^HR-CA-\d+/i.test(x||''));
 const manager=restricted&&canManageCorrectiveContent(person);
 if(restricted){
   if(source&&(!manager||requested==='employee')||requested==='management'&&!manager)throw new ForbiddenError('This guide is unavailable.');
   p=correctiveView(p,person,requested==='employee');
   if(!p.accessEdition||p.accessEdition==='management'&&!manager)throw new ForbiddenError('This guide is unavailable.');
   if(p.status==='Published'&&p.accessEdition==='employee'&&!hasCorrectiveEmployeeGuide(p.content))
     throw new AppError('The employee guide needs review before it can be opened or acknowledged.',409);
 }
 const edition=restricted?p.accessEdition:undefined;
 if(source&&restricted&&edition!=='management')throw new ForbiddenError();
 // Imported HR-CA files predate the visibility boundary. Only the source-copy action of an authorized
 // management editor may retrieve them; employee and management reading/printing always uses a new edition PDF.
 let bytes=(source||!restricted&&p.originalPdf)&&p.originalReference?originalPdf(p.originalReference):null;
 if(source&&!bytes)throw new AppError('This policy has no imported source PDF.',404);
 if(!bytes){
   const {generateSopPdf}=await import('@/lib/sop/pdf');
   let topicLabel=p.pdfEdition?.topicLabel;
   let related=p.pdfEdition?.related;
   if(restricted){
     topicLabel='Corrective Action';
     // Never inject the original frozen cross-reference table into a filtered copy. Both the
     // projected edition and the receiving reader must permit a reference before its title is printed.
     const ids=new Set(p.content.relatedIds);
     let visible:Policy[]=[];
     if(ids.size)visible=onboarding?(await onboardingSopProgress(person,onboarding.records)).policies:(await library(ctx!)).policies;
     const allowed=new Map(visible.filter(x=>x.status==='Published'&&ids.has(x.id)).map(x=>[x.id,x]));
     related=[...ids].filter(id=>allowed.has(id)).map(id=>({reference:allowed.get(id)!.code,title:allowed.get(id)!.content.title}));
   }else if(!p.pdfEdition&&ctx){
     const data=await library(ctx),ref=new Map(data.policies.filter(x=>ctx.canEdit||x.status==='Published').map(x=>[x.id,x]));
     topicLabel=data.topics.find(t=>t.id===p.topicId)?.name;
     related=p.content.relatedIds.flatMap(id=>ref.has(id)?[{reference:ref.get(id)!.code,title:ref.get(id)!.content.title}]:[]);
   }
   const sections=restricted?p.content.sections.flatMap(s=>{
     const group=correctiveSectionVisibility(s);
     // Blank and unclassified sections are never public by default.
     if(edition==='employee'&&group!=='employee')return [];
     return [{heading:s.heading,text:s.text,guide:group==='employee'?'employee' as const:'management' as const}];
   }):p.content.sections;
   const revisedBy=p.publication?.signerName||p.pdfEdition?.revisedBy||(restricted?p.updatedBy:undefined);
   const publishedAt=p.publication?.publishedAt||p.pdfEdition?.publishedAt||(restricted?p.updatedAt:undefined);
   bytes=await generateSopPdf({title:p.content.title,shortName:p.content.shortName,policyOwner:p.content.policyOwner,
     preparedDate:p.content.preparedDate,effectiveDate:p.content.effectiveDate,revision:p.content.revision,approvalStatus:p.content.approvalStatus,
     sections,related:related||[],reference:p.code,revisedBy,publishedAt,guide:edition,
     topicLabel:topicLabel||p.code.split('-')[0],status:p.status==='Published'||!restricted&&p.pdfEdition?'published':p.status==='Archived'?'archived':'draft',
     // Original-reference special cases can draw archived diagrams. Never pass this field
     // to the renderer for a role-specific copy.
     originalReference:restricted?undefined:p.originalReference});
 }
 const name=p.code+(source?'-original-source':'-v'+p.version+(edition?'-'+edition+'-guide':''));
 return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':(download?'attachment':'inline')+'; filename="'+name.replace(/[^A-Za-z0-9_.-]/g,'_')+'.pdf"','Cache-Control':'private, no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'self'",'X-Frame-Options':'SAMEORIGIN'}});
 }catch(e){const f=safeFailure(e,'sop.pdf');return NextResponse.json(f.body,{status:f.status,headers:{'Cache-Control':'private, no-store'}});}}
