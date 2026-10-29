import {NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {records as accountRecords} from '@/lib/accounts/server';
import {notifications} from '@/lib/shared/notifications';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request){try {
  const staff=await allRecords(),viewer=identify(staff,request.headers);
  const rows=notifications(viewer,staff,await accountRecords());
  return NextResponse.json({notifications:rows},{headers:{'Cache-Control':'private, no-store'}});
} catch(e){const f=safeFailure(e,'notifications.read');return NextResponse.json(f.body,{status:f.status});}}
