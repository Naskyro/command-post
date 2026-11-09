import {AppError} from '../shared/errors.ts';
import type {SchoolLesson} from './model';

export const schoolMediaLimit=50*1024*1024;
export const schoolMediaPartBytes=512*1024;
export const schoolMediaGroupParts=10;
export const schoolMediaTypes=['application/pdf','text/plain','image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/webm'] as const;
export type MediaLessonKind='reading'|'video'|'audio';
export type SchoolMediaReceipt={id:string;url:string;name:string;mime:string;size:number;courseId?:string;lessonId?:string};
const extensions:Record<string,string>={pdf:'application/pdf',txt:'text/plain',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',weba:'audio/webm'};
export const mediaAccept=(kind:MediaLessonKind)=>kind==='video'?'.mp4,.webm':kind==='audio'?'.mp3,.m4a,.wav,.ogg,.weba':'.pdf,.txt,.jpg,.jpeg,.png,.webp';
export const mediaFormatLabel=(kind:MediaLessonKind)=>kind==='video'?'MP4 or WebM':kind==='audio'?'MP3, M4A, WAV, OGG, or WebM audio':'PDF, TXT, JPG, PNG, or WebP';
export function mediaTypeForFile(name:string,type:string){const mime=type.toLowerCase().split(';')[0];return mime==='audio/x-wav'?'audio/wav':mime==='audio/mp3'?'audio/mpeg':mime==='audio/x-m4a'?'audio/mp4':(mime&&mime!=='application/octet-stream'?mime:'')||extensions[name.split('.').at(-1)?.toLowerCase()||'']||'';}
export function mediaMatchesLesson(mime:string,kind:SchoolLesson['kind']){return kind==='video'?mime.startsWith('video/'):kind==='audio'?mime.startsWith('audio/'):kind==='reading'?['application/pdf','text/plain','image/jpeg','image/png','image/webp'].includes(mime):false;}
export function validateMediaMetadata(name:unknown,mime:unknown,size:unknown,kind?:MediaLessonKind){
 if(typeof name!=='string'||!name.trim()||name.length>220||/[\u0000-\u001f\u007f]/.test(name))throw new AppError('Choose a file with a valid name.');
 if(typeof mime!=='string'||!(schoolMediaTypes as readonly string[]).includes(mime))throw new AppError('Choose a supported video, audio, document, or image file.');
 if(!Number.isSafeInteger(size)||Number(size)<=0||Number(size)>schoolMediaLimit)throw new AppError('Choose a file between 1 byte and 50 MB.',413);
 if(kind&&!mediaMatchesLesson(mime,kind))throw new AppError('Choose '+mediaFormatLabel(kind)+' for this '+kind+' lesson.');
 return {name:name.replace(/[<>"\\/]/g,'_').trim(),mime,size:Number(size)};
}
/** Check the actual container signature; the browser-supplied MIME is not evidence of a file format. */
export function validateMediaSignature(bytes:Uint8Array,mime:string){
 const ascii=(start:number,length:number)=>String.fromCharCode(...bytes.subarray(start,start+length));
 const starts=(values:number[])=>values.every((v,i)=>bytes[i]===v);
 const valid=mime==='application/pdf'?ascii(0,5)==='%PDF-':mime==='image/jpeg'?starts([255,216,255]):mime==='image/png'?starts([137,80,78,71,13,10,26,10]):mime==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP':mime==='video/mp4'||mime==='audio/mp4'?bytes.length>=12&&ascii(4,4)==='ftyp':mime==='video/webm'||mime==='audio/webm'?starts([26,69,223,163])&&new TextDecoder().decode(bytes.subarray(0,4096)).includes('webm'):mime==='audio/mpeg'?ascii(0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224:mime==='audio/wav'?ascii(0,4)==='RIFF'&&ascii(8,4)==='WAVE':mime==='audio/ogg'?ascii(0,4)==='OggS':mime==='text/plain'?!bytes.subarray(0,65536).some(v=>v===0||v<9||v>13&&v<32):false;
 if(!valid)throw new AppError('The file contents do not match its format. Export a supported file and try again.');
}
export function mediaByteRange(value:string|null,size:number):{offset:number;length:number}|undefined{
 if(!value)return undefined;
 const match=/^bytes=(\d*)-(\d*)$/.exec(value.trim());if(!match||!match[1]&&!match[2])throw new AppError('The requested media range is unavailable.',416);
 const suffix=!match[1],start=suffix?Math.max(0,size-Number(match[2])):Number(match[1]),end=suffix?size-1:match[2]?Math.min(size-1,Number(match[2])):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||suffix&&Number(match[2])<=0)throw new AppError('The requested media range is unavailable.',416);
 return {offset:start,length:end-start+1};
}
export function validateLessonMedia(lesson:SchoolLesson,courseId:string,media:Record<string,unknown>|undefined){
 if(lesson.mediaId){if(!media||media.kind!=='media'||media.courseId!==courseId||media.lessonId&&media.lessonId!==lesson.id)throw new AppError('Upload the file to this course and lesson before linking it.');if(!mediaMatchesLesson(String(media.mime),lesson.kind))throw new AppError('The uploaded file does not match this lesson type.');lesson.mediaUrl='/api/school/media?id='+encodeURIComponent(lesson.mediaId);lesson.mediaMime=String(media.mime);lesson.mediaName=String(media.name||'');lesson.mediaSize=Number(media.size||0);}
 else if(lesson.mediaUrl?.startsWith('/api/school/media'))throw new AppError('Choose the uploaded file for this lesson instead of pasting its private URL.');
 if(lesson.mediaUrl&&!lesson.mediaUrl.startsWith('/api/school/media?id=')&&!lesson.mediaUrl.startsWith('/api/school/source?courseId='+encodeURIComponent(courseId)+'&asset=')&&!/^https:\/\//.test(lesson.mediaUrl))throw new AppError('Use a secure HTTPS media link or a course upload.');
}
