// Return the most descriptive complete hint that fits. Never truncate the query itself.
export function fitSearchHint(full:string,compact:string|undefined,available:number,measure:(s:string)=>number){
 const candidates=[full,compact||'',/^find\b/i.test(full)?'Find…':'Search…','Search','Find'];
 return candidates.find(h=>h&&measure(h)<=available)||'';
}
