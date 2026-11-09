import type {SopContent} from '../sop/model';
import type {SchoolLesson,SchoolReadingSection} from './model';

/** Preserve the original lesson body: it is part of the saved progress fingerprint. */
export function policyReadingBody(sections:SchoolReadingSection[]):string {
 return sections.map(section=>section.heading+'\n\n'+section.text).join('\n\n');
}

/** Display metadata only. Never substitute source text for an instructor's edited lesson. */
export function policyReadingSections(lesson:SchoolLesson,content:SopContent):SchoolReadingSection[]|undefined {
 if(lesson.kind!=='reading')return undefined;
 const sections=content.sections.filter(section=>section.visibility!=='management'&&section.text.trim()).map(({heading,text})=>({heading,text}));
 return sections.length&&lesson.body===policyReadingBody(sections)?sections:undefined;
}

/** Trusted imported course presentation survives only while the original reading is unchanged. */
export function importedReadingSections(lesson:SchoolLesson,source?:SchoolLesson):SchoolReadingSection[]|undefined {
 return source&&lesson.kind==='reading'&&source.kind==='reading'&&lesson.id===source.id&&lesson.body===source.body
  ?source.readingSections?.map(({heading,text})=>({heading,text}))
  :undefined;
}
