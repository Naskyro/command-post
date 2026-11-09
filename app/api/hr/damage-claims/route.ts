import {NextRequest,NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {personnelDriverClaims} from '@/lib/hr/driver-claims-server';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(request:NextRequest){try{const people=await allRecords(),viewer=financeIdentity(request.headers,people);return json(await personnelDriverClaims(viewer,request.nextUrl.searchParams.get('personId'),people));}catch(error){const failure=safeFailure(error,'hr.driver-claims.read');return json(failure.body,failure.status);}}
