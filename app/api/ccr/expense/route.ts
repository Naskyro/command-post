import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {reviewExpense} from '@/lib/ccr/expense-handoff-server';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:NextRequest){
 try{const records=await allRecords(),viewer=identify(records,req.headers),result=await reviewExpense(viewer,records,req.nextUrl.searchParams.get('cost')||'');return json({record:result.existing||result.draft,sourceChanged:!!result.existing&&(result.existing.date!==result.draft.date||result.existing.amount!==result.draft.amount),sourceDate:result.draft.date,sourceAmount:result.draft.amount});}
 catch(e){const f=safeFailure(e,'ccr.expense.preview');return json(f.body,f.status);}
}
