import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {docket} from '@/lib/ccr/docket-server';
import {registerSummary} from '@/lib/ccr/register-server';
import {ccrOverview} from '@/lib/ccr/overview';
import {overviewClaimLines} from '@/lib/ccr/overview-claims';
import {readAssetClaims} from '@/lib/hr/server';
import {listDamageIntakes} from '@/lib/ccr/damage-intake-server';
import {yearCaseRows} from '@/lib/accounts/server';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:NextRequest){
 try{
  const staff=await allRecords(),v=identify(staff,req.headers);
  const result=await ccrOverview(v,{register:who=>registerSummary(who,staff),court:docket,claims:async who=>{
   const [accountRecords,assets,intakes]=await Promise.all([yearCaseRows(),readAssetClaims(),listDamageIntakes(who)]);
   return overviewClaimLines(accountRecords,assets,intakes);
  }});
  return NextResponse.json(result,{headers});
 }catch(e){const f=safeFailure(e,'ccr.overview');return NextResponse.json(f.body,{status:f.status,headers});}
}
