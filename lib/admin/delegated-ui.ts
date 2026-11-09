/** UI interaction hints. Server-side delegated request checks remain authoritative. */
export function delegatedMutationControl({label='',navigation=false,dialogClose=false,inputType='',href=''}:{label?:string;navigation?:boolean;dialogClose?:boolean;inputType?:string;href?:string}){
 if(dialogClose||navigation)return false;
 if(inputType==='file')return true;
 if(/^\/(?:command-access\/|ccr\/source-desk)/.test(href))return true;
 const text=label.replace(/\s+/g,' ').trim().toLowerCase();
 if(/^(?:clear|reset|add|remove|apply)\s+(?:all\s+)?(?:search|filters?|sorting|selection|zoom)\b/.test(text))return false;
 if(/(?:\band\b|&)\s+(?:save|submit|send|publish|approve|delete|record|sign|pay)\b/.test(text)||/^(?:close (?:case|claim|conversation|without settlement|investigation)|return for investigation|set (?:password|role|assignee|payment|as default))\b/.test(text))return true;
 if(/^(?:return to my account|close|cancel|back|dismiss|search|find|filter|sort|refresh|reload|retry|try again|view|open|inspect|preview|history|details|record details|previous|next|continue|show|hide|expand|collapse|print|download|export|copy)\b/.test(text))return false;
 return /^(?:save|submit|send|upload|publish|approve|reject|decline|delete|remove|archive|restore|unarchive|void|revoke|deactivate|activate|disable|enable|terminate|separate|complete|mark (?:as|complete|paid|reviewed|read|unread|closed|resolved|inactive|current)|record|sign|acknowledge|accept|finish|assign|unassign|transfer|reassign|add|new|create|update|reset|replace|release|pay|process|sync|connect|disconnect|reconnect|authorize|invite|resend|start|clock|check in|check out|stop|resume|reopen|confirm|verify|end|move|apply)\b/.test(text);
}
export function delegatedReadForm(label:string){return /^(?:search|find|filter|look up|lookup|preview|view|open|load|refresh|print|download|export|generate pdf|generate report|run report)\b/i.test(label.trim());}
