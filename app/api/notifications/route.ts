import {NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {records as accountRecords} from '@/lib/accounts/server';
import {pendingActiveSopCount} from '@/lib/sop/onboarding';
import {notifications} from '@/lib/shared/notifications';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request){try {
  const staff=await allRecords(),viewer=identify(staff,request.headers);
  const [records,count]=await Promise.all([accountRecords(),pendingActiveSopCount(viewer,staff).catch(()=>{console.warn('SOP reminder count unavailable');return 0;})]);
  const rows=notifications(viewer,staff,records);
  if(count){const i=rows.findIndex(r=>r.tone!=='urgent');rows.splice(i<0?rows.length:i,0,{id:'sop-signatures-due',title:count===1?'1 Policy Needs Your Signature':count+' Policies Need Your Signature',detail:'Open My Acknowledgments to read and sign.',module:'SOP Library',tab:'assigned'});}
  return NextResponse.json({notifications:rows,sopPending:count},{headers:{'Cache-Control':'private, no-store'}});
} catch(e){const f=safeFailure(e,'notifications.read');return NextResponse.json(f.body,{status:f.status});}}
