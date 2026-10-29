import {env} from 'cloudflare:workers';
export function financeDb(){if(!env.DB)throw new Error('Finance storage is unavailable. Please retry.');return env.DB;}
export function financeFiles(){if(!env.BUCKET)throw new Error('File storage is unavailable. Please retry.');return env.BUCKET;}
