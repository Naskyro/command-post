import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {FinanceAccessError} from '@/lib/finance/identity';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{const viewer=identify(await allRecords(),request.headers);return NextResponse.json({viewer},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to load your account',email:request.headers.get('oai-authenticated-user-email')||'',signInUrl:'/signin-with-chatgpt?return_to=/'},{status:e instanceof FinanceAccessError?e.status:400,headers:{'Cache-Control':'private, no-store'}});}}
