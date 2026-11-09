import { NextRequest, NextResponse } from 'next/server';
import { financeIdentity } from '@/lib/finance/identity';
import { allRecords } from '@/lib/finance/server';
import { hrCan } from '@/lib/hr/permissions';
import { recordId } from '@/lib/hr/server';
import { canUseHr } from '@/lib/hr/workflow';
import { ForbiddenError, safeFailure } from '@/lib/shared/errors';
import { sopSignatureHistoryFor } from '@/lib/sop/onboarding';

export const dynamic = 'force-dynamic';
const headers = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export async function GET(request:NextRequest) {
  try {
    const records = await allRecords();
    const viewer = financeIdentity(request.headers, records, {allowOnboarding:true});
    const personId = recordId(request.nextUrl.searchParams.get('personId'));
    const viewerPerson = records.find(p=>p.kind==='person' && p.id===viewer.person);
    const subject = records.some(p=>p.kind==='person' && p.id===personId);
    if (!subject || !viewerPerson || !['Active','Onboarding'].includes(String(viewerPerson.status)) || !canUseHr(viewer) ||
      (viewer.person!==personId && !['viewPersonnel','managePersonnel','manageOnboarding','manageTwc'].some(action=>hrCan(viewer,action,personId,records)))) {
      throw new ForbiddenError();
    }
    // Only the receipt is a personnel record. This endpoint does not release any policy PDF or audience.
    const receipts = (await sopSignatureHistoryFor(personId)).map(({code,version,title,signerName,signedAt,attestation,contentHash,accessEdition})=>({code,version,title,signerName,signedAt,attestation,contentHash,accessEdition}));
    return NextResponse.json({receipts},{headers});
  } catch (e) {const f=safeFailure(e,'hr.sop-signatures');return NextResponse.json(f.body,{status:f.status,headers});}
}
