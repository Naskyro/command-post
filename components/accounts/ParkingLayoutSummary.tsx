import {hasDetail} from '@/lib/accounts/display';
import type {Row} from '@/lib/accounts/model';
import {layoutFields,layoutFieldKeys} from '@/lib/accounts/property-layout';
import {fieldVisible,isMixed} from '@/lib/accounts/field-rules';
import {Button} from '@/components/ui/button';
export function ParkingLayoutSummary({account:a,onEdit}:{account:Row;onEdit?:(r:Row,fields:string[],title:string)=>void}) {
 const groups=[...new Set(layoutFields.filter(f=>hasDetail(a[f.key])&&fieldVisible(a,f.key)&&(f.group!=='Leasing office parking'||['Enforced','Do not tow'].includes(String(a.leasingOfficeParking)))).map(f=>f.group))];
 if(!groups.length&&!hasDetail(a.propertyType))return onEdit?<Button className="am-add-detail" variant="outline" size="sm" onClick={()=>onEdit(a,['propertyType','carportParking','carportEnforcement',...layoutFieldKeys],'Property layout & parking areas')}>Add property layout</Button>:null;
 return <section className="ah-permits ah-layout-summary"><header><h3>Property layout & parking areas</h3>{onEdit&&<Button variant="outline" size="sm" onClick={()=>onEdit(a,['propertyType','carportParking','carportEnforcement',...layoutFieldKeys],'Property layout & parking areas')}>Edit property layout</Button>}</header>
 <p><b>{a.propertyType}</b>{a.residentialBuildingType?' · '+a.residentialBuildingType:''}</p>{isMixed(a)&&<p className="ah-rule-callout">Check the caller’s parking area. Residential, commercial tenant, and customer parking can have different permits, enforcement hours, and authorized callers.</p>}
 {groups.map(group=>{const fields=layoutFields.filter(f=>f.group===group&&fieldVisible(a,f.key)&&hasDetail(a[f.key])&&f.key!=='residentialBuildingType');if(!fields.length)return null;return <section className="ah-parking-area" key={group}><h4>{group}</h4><dl>{fields.map(f=><div className={f.type==='textarea'?'ah-area-note':''} key={f.key}><dt>{f.label}</dt><dd>{String(a[f.key])}</dd></div>)}</dl></section>;})}
 </section>;
}
