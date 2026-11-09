export type Grant='View'|'Edit'|'None';
export type FileVersion={key:string;name:string;size:number;type:string;at:string;by:string;hash:string};
export type DriveNode={id:string;parent:string;kind:'folder'|'file';name:string;icon?:string;createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;inherit?:boolean;grants?:Record<string,Grant>;versions?:FileVersion[];deletedAt?:string;deleteReason?:string};
export type DriveState={nodes:DriveNode[]};
export function access(nodes:DriveNode[],id:string,person:string,manager=false):Grant{
 let node=nodes.find(n=>n.id===id);if(!node||node.deletedAt)return 'None';
 // A removed ancestor hides the entire subtree, including direct shares.
 const seen=new Set<string>();let ancestor:DriveNode|undefined=node;
 while(ancestor){if(seen.has(ancestor.id)||ancestor.deletedAt)return 'None';seen.add(ancestor.id);ancestor=nodes.find(n=>n.id===ancestor?.parent);}
 if(manager)return 'Edit';
 if(node.kind==='file')node=nodes.find(n=>n.id===node?.parent);
 while(node){if(node.grants?.[person])return node.grants[person];if(!node.inherit)return 'None';node=nodes.find(n=>n.id===node?.parent);}return 'None';
}
export function validName(value:unknown){const s=String(value||'').trim();if(!s||s.length>180||/[\x00-\x1f/\\]/.test(s)||s==='.'||s==='..')throw new Error('Enter a name of 1–180 characters without slashes.');return s;}
export function duplicate(nodes:DriveNode[],parent:string,name:string,except=''){return nodes.some(n=>n.id!==except&&!n.deletedAt&&n.parent===parent&&n.name.toLowerCase()===name.toLowerCase());}
