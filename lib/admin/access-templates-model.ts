import type {AccessGrant} from '../finance/access';
import type {HrResponsibility} from '../hr/permissions';
export type AccessTemplate={id:string;kind:'accessTemplate';version:number;name:string;description:string;status:'Active'|'Archived';access:AccessGrant[];hrResponsibilities:HrResponsibility[];updatedAt?:string;updatedBy?:string;builtin?:boolean};
export type TemplateChange={personId:string;name:string;version:number;added:AccessGrant[];removed:AccessGrant[];changed:{module:string;tab:string;from:string;to:string}[];responsibilityChanges:{action:string;from:string;to:string}[]};
export type TemplateData={templates:AccessTemplate[];canEdit:boolean;people:{id:string;name:string;version:number;canEdit:boolean;status:string;department:string;templateName?:string}[];catalog:Record<string,Record<string,string>>};
