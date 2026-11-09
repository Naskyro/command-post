import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {canAccess} from '@/lib/finance/access';
import {CCR} from '@/lib/ccr/docket-model';
import {assertDamageIntakeAccess,damageImport,getDamageIntake,listDamageIntakes,noteDamage} from '@/lib/ccr/damage-intake-server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:NextRequest){try{const v=await requestViewer(req.headers);assertDamageIntakeAccess(v);const scoped=(r:Awaited<ReturnType<typeof getDamageIntake>>)=>v.owner?r:{...r,files:[],references:[],evidenceRestricted:true};if(req.nextUrl.searchParams.has('id'))return json({record:scoped(await getDamageIntake(req.nextUrl.searchParams.get('id')||''))});return json({records:(await listDamageIntakes(v)).map(scoped),canEdit:canAccess(v,CCR,'damage',true),canFile:!!v.owner&&canAccess(v,CCR,'damage',true)});}catch(e){const f=safeFailure(e,'ccr.damage.intake.list');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const v=await requestViewer(req.headers),b=await readPayload(req);if(b.action==='update')return json(await noteDamage(v,b));if(b.action==='receipt'||b.action==='import'){if(!v.owner)throw new ForbiddenError();return json(await damageImport(v,b.record,b.action==='receipt'));}throw new AppError('Choose a claim or filing action.');}catch(e){const f=safeFailure(e,'ccr.damage.intake.write');return json(f.body,f.status);}}
