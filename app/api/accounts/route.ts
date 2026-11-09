import {contactPhotoVersions} from '@/lib/relationships/portrait-storage';
import {annotateWorkClosure} from '@/lib/year-history/work';
import { publicPersonIdentity } from '@/lib/people/display-name';
import { NextRequest, NextResponse } from 'next/server';
import { context, projection, save } from '@/lib/accounts/server';
import { head, assigned, canEdit, access } from '@/lib/accounts/policy';
import { settlementApprover } from '@/lib/accounts/claims';
import { canApprove } from '@/lib/accounts/releases';
import { canAccess, recordAccess } from '@/lib/finance/access';
import { financeDb } from '@/db/finance';
import { readPayload, safeFailure, ForbiddenError } from '@/lib/shared/errors';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: NextRequest) {
    try {
        const ctx = await context(request), surface = request.nextUrl.searchParams.get('surface') || 'manager', rows = projection(ctx.all, ctx.viewer, surface), history = request.nextUrl.searchParams.get('history');
        if (history) {
            if (!canAccess(ctx.viewer,'Admin','activity') || surface === 'dispatch' || !access(ctx.viewer, 'activity') || !rows.some(r => r.id === history))
                throw new ForbiddenError();
            return json({ history: (await financeDb().prepare('SELECT actor,at,action FROM account_audit WHERE record_id=? OR account_id=? ORDER BY at DESC LIMIT 100').bind(history, history).all()).results });
        }
        const photos=surface==='manager'&&access(ctx.viewer,'relationships')?await contactPhotoVersions(rows.filter(r=>r.kind==='contact').map(r=>r.id),ctx.all):{};
        const withPhotos=Object.keys(photos).length?rows.map(r=>r.kind==='contact'&&Object.hasOwn(photos,r.id)?{...r,relationshipPhotoVersion:photos[r.id]}:r):rows;
        const claimIntakeAccountIds=surface==='claims'&&access(ctx.viewer,'claims',true)?ctx.all.filter(r=>r.kind==='account'&&!r.readOnly&&!r.deletedAt&&(head(ctx.viewer,ctx.staff)||assigned(ctx.viewer,r))).map(r=>r.id):undefined;
        return json({ ...(claimIntakeAccountIds?{claimIntakeAccountIds}:{}), records: surface==='orders'||surface==='manager'?await annotateWorkClosure(withPhotos):withPhotos, claimApproval:settlementApprover(ctx.viewer,ctx.staff), viewer: ctx.viewer, head: head(ctx.viewer, ctx.staff), editable: rows.filter(r => canEdit(ctx.viewer, r, ctx.all, ctx.staff)).map(r => r.id), releaseApprovals: ctx.all.filter(r => r.kind === 'account' && canApprove(ctx.viewer, r, ctx.staff)).map(r => r.id), staff: ctx.staff.filter(r => r.kind === 'person' && r.status === 'Active').map(r => ({ id: r.id, ...publicPersonIdentity(r), department: r.department, title: r.title })), mileageSubmission: recordAccess(ctx.viewer, { id: '', kind: 'reimbursement', version: 0 }, true), dispatchPermissions: { notes: canAccess(ctx.viewer, 'Accounts', 'notes', true), signage: canAccess(ctx.viewer, 'Accounts', 'signage', true) }, operationsEditor:canAccess(ctx.viewer,'Work Orders','orders',true), capabilities: Object.fromEntries(['safety','accounts', 'relationships', 'work', 'activity', 'signage', 'files', 'decisions', 'performance', 'email', 'opportunities', 'team', 'setup', 'courtesy', 'claims', 'workOrders'].map(k => [k, { view: access(ctx.viewer, k), edit: access(ctx.viewer, k, true) }])) });
    }
    catch (e) {
        const f = safeFailure(e, 'accounts.read');
        return json(f.body, f.status);
    }
}
export async function POST(request: NextRequest) { try {
    return json({ records: await save(await readPayload(request), await context(request)) });
}
catch (e) {
    const f = safeFailure(e, 'accounts.write');
    return json(f.body, f.status);
} }
