import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { getVehicle, updateVehicle, approveDisposition } from '@/lib/vehicles';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'vehicles'); return response(f.body, f.status); };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const records = await allRecords();
    const v = identify(records, request.headers);
    const vehicle = await getVehicle(v, id);
    return response({ vehicle });
  } catch (e) { return failure(e); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const records = await allRecords();
    const v = identify(records, request.headers);
    const body = await readPayload(request) as Record<string, unknown>;
    const version = Number(body.version);
    if (!version) throw new AppError('Record version is required for an update.');

    const num = (k: string) => body[k] !== undefined ? Number(body[k]) : undefined;
    const str = (k: string) => body[k] !== undefined ? String(body[k]) : undefined;
    const bool = (k: string) => body[k] !== undefined ? (body[k] === true || body[k] === 1) : undefined;

    // Approve disposition shortcut
    if (body.action === 'approve') {
      const disposition = str('approved_disposition');
      if (!disposition) throw new AppError('Approved disposition value is required.');
      const result = await approveDisposition(v, id, disposition, version);
      return response(result);
    }

    const patch: Record<string, unknown> = {};
    const keys = [
      'vin','license_plate','license_plate_state','year','make','model','color','mileage',
      'has_keys','runs','condition_notes',
      'first_notice_date','first_notice_sent_by','second_notice_date','second_notice_due_date',
      'vtr_265_picked_up','vtr_265_pickup_date',
      'recommended_disposition',
      'retail_estimate','auction_estimate','part_out_estimate','scrap_estimate',
      'sale_price','sale_platform','buyer_name','sale_date','days_on_market',
      'towing_cost','storage_cost','listing_cost','marketing_cost','commission','other_costs',
      'towbook_call_number','released_from_towbook',
      'status','assigned_to'
    ];
    const boolKeys = new Set(['has_keys','runs','vtr_265_picked_up','released_from_towbook']);
    const numKeys = new Set(['year','mileage','retail_estimate','auction_estimate','part_out_estimate','scrap_estimate','sale_price','days_on_market','towing_cost','storage_cost','listing_cost','marketing_cost','commission','other_costs']);
    for (const k of keys) {
      if (k in body) {
        if (boolKeys.has(k)) patch[k] = bool(k);
        else if (numKeys.has(k)) patch[k] = num(k);
        else patch[k] = str(k);
      }
    }
    // Approve disposition fields if supplied directly
    if ('approved_disposition' in body) patch['approved_disposition'] = str('approved_disposition');

    const result = await updateVehicle(v, id, patch, version);
    return response(result);
  } catch (e) { return failure(e); }
}
