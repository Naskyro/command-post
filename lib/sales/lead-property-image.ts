import type {Row} from '../accounts/model';
const examples=new Map(['cedar','oak','willow','laurel'].map(name=>['sales-example:'+name,'/sample-properties/'+name+'.webp']));
export function leadPropertyImage(lead:Pick<Row,'id'|'kind'> & Partial<Row>):string {
 if(lead.kind!=='opportunity')return '';
 if(lead.id.startsWith('sales-example:'))return examples.get(lead.id)||'';
 if(lead.example||lead.sample||lead.isSample||lead.isDemo||lead.trainingSample)return '';
 const url=String(lead.propertyPhotoUrl||'');
 return /^\/api\/(?:sales\/property-photo|accounts\/files)(?:\?|$)/.test(url)&&!/[\\\x00-\x20]/.test(url)?url:'';
}
export function canManageLeadPropertyPhoto(lead:Row,editable:boolean){return editable&&lead.kind==='opportunity'&&lead.version>0&&!lead.readOnly&&!lead.example&&!lead.sample&&!lead.isSample&&!lead.isDemo&&!lead.trainingSample&&!lead.id.startsWith('sales-example:');}
export function propertyImageSize(width:number,height:number,maxEdge=1920){if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width*height>50_000_000)throw new Error('Choose a photo with at least 16 pixels per side and no more than 50 megapixels.');const f=Math.min(1,maxEdge/Math.max(width,height));return {width:Math.max(1,Math.round(f*width)),height:Math.max(1,Math.round(f*height))};}
