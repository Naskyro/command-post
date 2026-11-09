import {readPreview} from '@/lib/admin/delegated-server';
export const dynamic='force-dynamic';
export const GET=(req:Request)=>readPreview(req,'/api/delegated-access/workspace');
