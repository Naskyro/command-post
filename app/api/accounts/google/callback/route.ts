import { NextRequest, NextResponse } from 'next/server';
import { context } from '@/lib/accounts/server';
import { finish } from '@/lib/accounts/google';
import { access } from '@/lib/accounts/policy';
import { ForbiddenError, safeFailure } from '@/lib/shared/errors';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { try {
    const { viewer } = await context(request);
    if (!access(viewer, 'email', true))
        throw new ForbiddenError();
    await finish(viewer, request.nextUrl.searchParams.get('code') || '', request.nextUrl.searchParams.get('state') || '');
    return NextResponse.redirect(new URL('/?google=connected', request.url));
}
catch (e) {
    const r = safeFailure(e, 'accounts.google_callback');
    return NextResponse.json(r.body, { status: r.status });
} }
