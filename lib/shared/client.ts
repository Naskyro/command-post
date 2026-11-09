// Once a document has rendered a delegated session it stays read-only until a
// full navigation. Ending the cookie in another tab must never elevate this one.
let delegatedDocument=false;
let delegatedFetchInstalled=false;
const delegatedQuery='_command_view';
export const delegatedWriteMessage='This employee view is read-only. Return to My Account to make changes.';
export function isDelegatedClient(){return delegatedDocument;}
/** A restrictive marker, never an authorization token. Stale links fail closed. */
export function delegatedUrl(value:string|URL):string{
 const text=String(value);
 if(!delegatedDocument||typeof window==='undefined'||!text||text.startsWith('#'))return text;
 let url:URL;
 try{url=new URL(text,window.location.href);}catch{return text;}
 if(!['https:','http:'].includes(url.protocol)||url.origin!==window.location.origin)return text;
 url.searchParams.set(delegatedQuery,'1');
 return text.startsWith('/')&&!text.startsWith('//')?url.pathname+url.search+url.hash:url.href;
}

function lockDelegatedNavigation(){
 const history=window.history;
 if(history){
  const push=history.pushState.bind(history),replace=history.replaceState.bind(history);
  history.pushState=(data,unused,url)=>push(data,unused,url==null?url:delegatedUrl(url));
  history.replaceState=(data,unused,url)=>replace(data,unused,url==null?url:delegatedUrl(url));
  const markCurrent=()=>replace(history.state,'',delegatedUrl(window.location.href));
  markCurrent();window.addEventListener('popstate',markCurrent);
 }
 if(window.open){const open=window.open.bind(window);window.open=(url,target,features)=>open(url==null?url:delegatedUrl(url),target,features);}
 if(typeof document==='undefined')return;
 const mark=(element:Element,attribute:string,apiOnly=false)=>{
  const current=element.getAttribute(attribute);if(!current)return;
  if(apiOnly){try{if(!new URL(current,window.location.href).pathname.startsWith('/api/'))return;}catch{return;}}
  const marked=delegatedUrl(current);if(marked!==current)element.setAttribute(attribute,marked);
 };
 const decorate=()=>{
  for(const link of document.querySelectorAll('a[href],area[href]'))mark(link,'href');
  for(const resource of document.querySelectorAll('img[src],iframe[src],audio[src],video[src],source[src],embed[src],input[type=image][src]'))mark(resource,'src',true);
  for(const object of document.querySelectorAll('object[data]'))mark(object,'data',true);
  for(const video of document.querySelectorAll('video[poster]'))mark(video,'poster',true);
 };
 decorate();
 if(typeof MutationObserver!=='undefined'){
  const observer=new MutationObserver(decorate);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href','src','data','poster']});
 }
 // Mark the real href so native middle-click, context-menu and copied links
 // carry the same constraint. Resource JSX also marks src before loading starts.
 const follow=(event:Event)=>{const link=event.target instanceof Element?event.target.closest('a[href],area[href]'):null;if(link)mark(link,'href');};
 for(const event of ['click','auxclick','contextmenu'])document.addEventListener(event,follow,true);
}
export function lockDelegatedClient(){
 if(typeof window==='undefined')return;
 delegatedDocument=true;
 if(delegatedFetchInstalled)return;
 delegatedFetchInstalled=true;
 const original=window.fetch.bind(window);
 // Raw fetch callers retain the document identity lock after another tab ends
 // the cookie. Only a full navigation returns this document to normal access.
 window.fetch=async(input:RequestInfo|URL,init:RequestInit={})=>{
  const supplied=input instanceof Request?input:undefined,url=new URL(supplied?supplied.url:String(input),window.location.href);
  if(!['https:','http:'].includes(url.protocol)||url.origin!==window.location.origin)return original(input,init);
  const headers=new Headers(init.headers||supplied?.headers);headers.set('x-command-read-only','1');
  const method=String(init.method||supplied?.method||'GET').toUpperCase();
  if(!['GET','HEAD'].includes(method)&&!(method==='POST'&&url.pathname==='/api/delegated-access'&&!url.search))return Response.json({error:delegatedWriteMessage,readOnly:true},{status:403,headers:{'Cache-Control':'private, no-store'}});
  return original(input,{...init,headers});
 };
 lockDelegatedNavigation();
}
// New tabs opened from a marked URL must lock before their first data request.
if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).has(delegatedQuery))lockDelegatedClient();
export async function timedFetch(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let headers=init.headers;
        if(delegatedDocument&&typeof window!=='undefined'){
            const url=new URL(input instanceof Request?input.url:String(input),window.location.href);
            if(['https:','http:'].includes(url.protocol)&&url.origin===window.location.origin){
                const scoped=new Headers(headers||(input instanceof Request?input.headers:undefined)); scoped.set('x-command-read-only','1'); headers=scoped;
            }
        }
        return await fetch(input, { ...init, headers, cache: 'no-store', signal: controller.signal });
    }
    catch (e) {
        if (e instanceof Error && e.name === 'AbortError')
            throw new Error('The request timed out. Refresh to check whether it saved before trying again.');
        throw new Error('Connection lost. Your form is still open; refresh the records before retrying.');
    }
    finally {
        clearTimeout(timer);
    }
}
export async function requestJson<T>(url: string, body?: Record<string, unknown>, timeoutMs = 15000): Promise<T> {
    const res = await timedFetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}, timeoutMs);
    let value: unknown;
    try {
        value = await res.json();
    }
    catch {
        throw new Error('The server returned an unreadable response. Refresh and try again.');
    }
    if (!res.ok)
        throw new Error(typeof value === 'object' && value && 'error' in value ? String(value.error) : res.status === 429 ? 'Too many requests. Wait a moment and try again.' : 'The request could not be completed.');
    return value as T;
}
