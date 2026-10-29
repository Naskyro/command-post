import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify,persist} from '@/lib/finance/server';
import {staffNameData,prepareStaffName} from '@/lib/people/names';
import {ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function context(request:Request){const all=await allRecords(),viewer=identify(all,request.headers);if(!all.some(p=>p.kind==='person'&&p.id===viewer.person&&p.status==='Active'))throw new ForbiddenError();return {all,viewer};}
export async function GET(request:NextRequest){try{const {all,viewer}=await context(request);return json(staffNameData(all,viewer));}catch(e){const f=safeFailure(e,'names.read');return json(f.body,f.status);}}
export async function POST(request:NextRequest){try{const body=await readPayload(request),{all,viewer}=await context(request),{old,next,reason}=prepareStaffName(body,all,viewer),saved=await persist(old,next,viewer,reason);return json({id:saved.id,...staffNameData([...all.filter(p=>p.id!==saved.id),saved],viewer)});}catch(e){const f=safeFailure(e,'names.write');return json(f.body,f.status);}}
