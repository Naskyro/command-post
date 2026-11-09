import {readPreview} from '@/lib/admin/delegated-server';
export const dynamic='force-dynamic';
export function GET(req:Request){return readPreview(req,new URL(req.url).searchParams.get('surface')||'');}
