import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { createVehicle, listVehicles } from '@/lib/vehicles';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'vehicles'); return response(f.body, f.status); };

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { searchParams } = request.nextUrl;
    const vehicles = await listVehicles(v, {
      status: searchParams.get('status') ?? undefined,
      assigned_to: searchParams.get('assigned_to') ?? undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 50,
    });
    return response({ vehicles, count: vehicles.length });
  } catch (e) { return failure(e); }
}

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const body = await readPayload(request) as Record<string, unknown>;

    if (!body.vin && !body.make && !body.model) {
      throw new AppError('VIN or vehicle description is required.');
    }

    const num = (k: string) => body[k] !== undefined && body[k] !== null && body[k] !== '' ? Number(body[k]) : undefined;
    const str = (k: string) => body[k] ? String(body[k]) : undefined;
    const bool = (k: string) => body[k] === true || body[k] === 1;

    const result = await createVehicle(v, {
      vin: str('vin'),
      license_plate: str('license_plate'),
      license_plate_state: str('license_plate_state'),
      year: num('year'),
      make: str('make'),
      model: str('model'),
      color: str('color'),
      mileage: num('mileage'),
      has_keys: bool('has_keys'),
      runs: bool('runs'),
      condition_notes: str('condition_notes'),
      first_notice_date: str('first_notice_date'),
      first_notice_sent_by: str('first_notice_sent_by'),
      second_notice_date: str('second_notice_date'),
      second_notice_due_date: str('second_notice_due_date'),
      vtr_265_picked_up: bool('vtr_265_picked_up'),
      vtr_265_pickup_date: str('vtr_265_pickup_date'),
      recommended_disposition: str('recommended_disposition'),
      retail_estimate: num('retail_estimate'),
      auction_estimate: num('auction_estimate'),
      part_out_estimate: num('part_out_estimate'),
      scrap_estimate: num('scrap_estimate'),
      sale_price: num('sale_price'),
      sale_platform: str('sale_platform'),
      buyer_name: str('buyer_name'),
      sale_date: str('sale_date'),
      towing_cost: num('towing_cost'),
      storage_cost: num('storage_cost'),
      listing_cost: num('listing_cost'),
      marketing_cost: num('marketing_cost'),
      commission: num('commission'),
      other_costs: num('other_costs'),
      towbook_call_number: str('towbook_call_number'),
      released_from_towbook: bool('released_from_towbook'),
      status: str('status'),
      assigned_to: str('assigned_to'),
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
