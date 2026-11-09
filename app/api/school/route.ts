import {NextResponse} from 'next/server';
import {context,data,change} from '@/lib/school/server';
import {safeFailure,ForbiddenError,AppError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(x:unknown,status=200)=>NextResponse.json(x,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(r:Request){try{return json(await data(await context(r)));}catch(e){const f=safeFailure(e,'school.read');return json(f.body,f.status);}}
// Whole policy collections include complete readings and instructor rubrics.
// Keep the larger authoring allowance local to School House.
async function readSchoolPayload(r:Request){
 if(r.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError('Cross-site request rejected.');
 if(!r.headers.get('content-type')?.includes('application/json'))throw new AppError('Send a JSON record.');
 if(Number(r.headers.get('content-length')||0)>8000000)throw new AppError('This course is too large.',413);
 const raw=await r.text();if(raw.length>8000000)throw new AppError('This course is too large.',413);
 let body:unknown;try{body=JSON.parse(raw);}catch{throw new AppError('The submitted record is not valid JSON.');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new AppError('Submit a record object.');
 const payload=body as Record<string,unknown>;
 if(payload.action!=='save-course'&&raw.length>400000)throw new AppError('This record is too large.',413);
 return payload;
}
export async function POST(r:Request){try{if(r.headers.get('origin')!==new URL(r.url).origin)throw new ForbiddenError();return json(await change(await context(r),await readSchoolPayload(r)));}catch(e){const f=safeFailure(e,'school.write');return json(f.body,f.status);}}
