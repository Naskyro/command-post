import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditProfilePhoto, canReadProfilePhoto, prepareProfilePhoto, profilePhotoLimit } from '../../lib/people/photos.ts';
import { canReadRecord } from '../../lib/hr/workflow.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR4nGNMWXCCgZaAiaamj1owasGoBaMWjFowasGoBaMWjFowasGoBVQEAFb9AgxaQc9KAAAAAElFTkSuQmCC','base64');
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDTooor2zwgooooAKKKKACiiigD/9k=','base64');
const webp = Buffer.from('UklGRkIAAABXRUJQVlA4IDYAAAAQAwCdASogACAAPm00lkekIyIhKAgAgA2JZQB2AACAoKAA/uFHf/6uxPhQgn//sWctgWIAAAA=','base64');
const person=(id,supervisor='')=>({id,kind:'person',name:id,version:1,status:'Active',department:'Dispatch',supervisor});
const records=[person('employee','manager'),person('manager'),person('outside')];
const viewer=(person='employee',actions=[])=>({id:person,person,name:person,role:'Employee',department:'Dispatch',owner:false,canManage:false,canRelease:false,access:[{module:'People & HR',tab:'people',level:'Edit'}],hrResponsibilities:actions.map(action=>({action,scope:'Team'}))});

test('employees can manage their own headshot including onboarding; other photo access is scoped',()=>{
 const self={...viewer(),onboardingOnly:true,access:[]};
 assert.equal(canReadProfilePhoto(self,'employee',records),true);
 assert.equal(canEditProfilePhoto(self,'employee',records),true);
 assert.equal(canReadProfilePhoto(self,'manager',records),false);
 assert.equal(canEditProfilePhoto(viewer('manager',['managePersonnel']),'employee',records),true);
 assert.equal(canEditProfilePhoto(viewer('manager',['managePersonnel']),'outside',records),false);
 assert.equal(canReadProfilePhoto(viewer('manager',['viewPersonnel']),'employee',records),true);
 assert.equal(canEditProfilePhoto(viewer('manager',['viewPersonnel']),'employee',records),false);
 assert.equal(canReadProfilePhoto(viewer('manager'),'employee',records),false);
 assert.equal(canEditProfilePhoto({...viewer(),owner:true},'missing',records),false);
});
test('profile photos stay outside generic HR document list/download permissions',()=>{
 const record={id:'hrphoto:employee',personId:'employee',kind:'document',version:1,data:{category:'Profile Photo'},createdAt:'now',updatedAt:'now',createdBy:'employee',updatedBy:'employee'};
 assert.equal(canReadRecord(record,viewer(),records,[record]),false);
 assert.equal(canReadRecord(record,{...viewer('manager'),owner:true},records,[record]),false);
});
test('real JPEG, PNG and WebP images retain their verified dimensions',()=>{
 for(const [bytes,type] of [[jpeg,'image/jpeg'],[png,'image/png'],[webp,'image/webp']]){
  const result=prepareProfilePhoto(bytes,type);
  assert.equal(result.mimeType,type);assert.equal(result.width,32);assert.equal(result.height,32);
  assert.ok(result.bytes.length>30);
 }
});
test('MIME spoofing, SVG, oversized files, and truncated images are rejected',()=>{
 assert.throws(()=>prepareProfilePhoto(png,'image/jpeg'),/do not match/);
 assert.throws(()=>prepareProfilePhoto(Buffer.from('<svg onload="alert(1)"></svg>'),'image/svg+xml'),/not a supported photo/);
 assert.throws(()=>prepareProfilePhoto(new Uint8Array(profilePhotoLimit+1),'image/png'),/smaller than 5 MB/);
 assert.throws(()=>prepareProfilePhoto(jpeg.subarray(0,jpeg.length-2),'image/jpeg'),/not a supported photo/);
 assert.throws(()=>prepareProfilePhoto(png.subarray(0,55),'image/png'),/not a supported photo/);
});
test('PNG duplicate or oversized dimensions cannot bypass the pixel limit',()=>{
 const duplicate=Buffer.concat([png.subarray(0,33),png.subarray(8,33),png.subarray(33)]);
 assert.throws(()=>prepareProfilePhoto(duplicate,'image/png'),/not a supported photo/);
 const huge=Buffer.from(png);huge.writeUInt32BE(20000,16);
 assert.throws(()=>prepareProfilePhoto(huge,'image/png'),/megapixels/);
});
test('JPEG removes EXIF and comments before and after image scans, rejects a second frame header',()=>{
 const note=Buffer.from('private GPS metadata'),app=Buffer.concat([Buffer.from([255,225,0,note.length+2]),note]);
 const comment=Buffer.concat([Buffer.from([255,254,0,note.length+2]),note]);
 const source=Buffer.concat([jpeg.subarray(0,2),app,jpeg.subarray(2,jpeg.length-2),comment,jpeg.subarray(jpeg.length-2)]);
 const result=prepareProfilePhoto(source,'image/jpeg');
 assert.equal(Buffer.from(result.bytes).includes(note),false);
 const sof=jpeg.indexOf(Buffer.from([255,192])),size=jpeg.readUInt16BE(sof+2)+2;
 const duplicate=Buffer.concat([jpeg.subarray(0,sof),jpeg.subarray(sof,sof+size),jpeg.subarray(sof)]);
 assert.throws(()=>prepareProfilePhoto(duplicate,'image/jpeg'),/not a supported photo/);
});
test('WebP validates canvas dimensions against the encoded frame and drops EXIF chunks',()=>{
 const extension=Buffer.from([86,80,56,88,10,0,0,0,8,0,0,0,15,0,0,15,0,0]);
 const mismatch=Buffer.concat([webp.subarray(0,12),extension,webp.subarray(12)]);mismatch.writeUInt32LE(mismatch.length-8,4);
 assert.throws(()=>prepareProfilePhoto(mismatch,'image/webp'),/not a supported photo/);
 const exif=Buffer.from([69,88,73,70,4,0,0,0,65,66,67,68]);
 const withExif=Buffer.concat([webp,exif]);withExif.writeUInt32LE(withExif.length-8,4);
 const result=prepareProfilePhoto(withExif,'image/webp');
 assert.equal(Buffer.from(result.bytes).includes(Buffer.from('EXIF')),false);
 assert.equal(Buffer.from(result.bytes).readUInt32LE(4),result.bytes.length-8);
});
