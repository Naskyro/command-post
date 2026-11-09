import {financeDb,financeFiles} from '@/db/finance';
import {readPortraitFrom,portraitBytesFrom,savePortraitTo,contactPhotoVersionsFrom} from './portrait-repository';
import type {StoredPortrait} from './portraits';
import type {Viewer} from '../finance/model';
import type {Row} from '../accounts/model';
export const readPortrait=(id:string)=>readPortraitFrom(financeDb(),id);
export const portraitBytes=(record:StoredPortrait)=>portraitBytesFrom(financeFiles(),record);
export const savePortrait=(id:string,old:StoredPortrait|null,image:{bytes:Uint8Array;mimeType:string}|null,v:Viewer)=>savePortraitTo(financeDb(),financeFiles(),id,old,image,v);
export const contactPhotoVersions=(ids:string[],rows:Row[]=[])=>contactPhotoVersionsFrom(financeDb(),ids,rows);
