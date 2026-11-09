import {NextResponse} from 'next/server';
import {context} from '@/lib/school/server';
import {importDocument} from '@/lib/school/document-import';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new ForbiddenError();
 const ctx=await context(request);if(!ctx.creator)throw new ForbiddenError('Course authoring access is required.');
 const length=Number(request.headers.get('content-length')||0);if(length>9*1024*1024)throw new AppError('Choose a document of 8 MB or smaller.');
 const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new AppError('Choose a file to import.');
 if(file.size>8*1024*1024)throw new AppError('Choose a document of 8 MB or smaller.');
 return NextResponse.json(await importDocument(new Uint8Array(await file.arrayBuffer()),file.name),{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){const failure=safeFailure(error,'school.import');return NextResponse.json(failure.body,{status:failure.status,headers:{'Cache-Control':'private, no-store'}})}}
