import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {readHrRecords} from '@/lib/hr/server';
import {canOpenPersonnelReview,reviewPermissions,personnelReview} from '@/lib/ccr/personnel-review';
import {ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}});
export async function GET(req:NextRequest){try{const staff=await allRecords(),v=identify(staff,req.headers);if(!canOpenPersonnelReview(v))throw new ForbiddenError();const rights=reviewPermissions(v,staff);return json({rights,rows:rights.twc||rights.screening?personnelReview(v,staff,await readHrRecords()):[]});}catch(e){const f=safeFailure(e,'ccr.personnel.review');return json(f.body,f.status);}}
