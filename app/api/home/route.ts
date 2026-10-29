import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';
import { availableWidgets, defaultLayout, validateLayout } from '@/lib/home/widgets';
import { defaultGrid, validateGrid } from '@/lib/home/layout';
import { homeContent } from '@/lib/home/content';
import { readHomeLayout, writeHomeLayout } from '@/lib/home/storage';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  try {
    const records = await allRecords(), viewer = identify(records, request.headers);
    const widgets = availableWidgets(viewer, records), saved = await readHomeLayout(viewer, widgets);
    return NextResponse.json({ viewer, title: String(records.find(r => r.id === viewer.person)?.title || ''), timeZone: String(records.find(r => r.id === 'company')?.timezone || 'America/Chicago'), widgets, defaults: defaultLayout(viewer, widgets), ...saved, content: homeContent(viewer, records, widgets) }, { headers });
  } catch (error) {
    const failure = safeFailure(error, 'home.read');
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
export async function POST(request: NextRequest) {
  try {
    const body = await readPayload(request);
    if (Object.keys(body).some(key => !['layout', 'version', 'grid'].includes(key))) throw new AppError('Only your Home layout can be changed here.');
    if (!Number.isSafeInteger(body.version) || Number(body.version) < 0) throw new AppError('Refresh Home before saving.');
    const records = await allRecords(), viewer = identify(records, request.headers);
    const layout = validateLayout(body.layout, availableWidgets(viewer, records));
    const grid = body.grid === undefined ? (await readHomeLayout(viewer, availableWidgets(viewer, records))).grid || defaultGrid : validateGrid(body.grid);
    return NextResponse.json(await writeHomeLayout(viewer, layout, Number(body.version), grid), { headers });
  } catch (error) {
    const failure = safeFailure(error, 'home.save');
    return NextResponse.json(failure.body, { status: failure.status, headers });
  }
}
