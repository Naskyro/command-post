import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {claimChoiceRows} from '@/lib/accounts/server';
import {assertDamageIntakeAccess} from '@/lib/ccr/damage-intake-server';
import {operationalChoices} from '@/lib/ccr/claim-operations';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{const staff=await allRecords(),v=identify(staff,req.headers);assertDamageIntakeAccess(v);const rows=await claimChoiceRows();return NextResponse.json(operationalChoices(staff,rows),{headers:{'Cache-Control':'private, no-store'}});}catch(e){const f=safeFailure(e,'ccr.damage.choices');return NextResponse.json(f.body,{status:f.status,headers:{'Cache-Control':'private, no-store'}});}}
