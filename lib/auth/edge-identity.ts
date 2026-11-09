// Only the outer worker writes this header. It clears all client-supplied
// versions before entering the application (including requests on hosted Sites).
export const verifiedRosterHeader='x-command-internal-verified-person';
export const managedSitesOrigin='https://command-post-accounts.jersonarauz.chatgpt.site';
const privateResetPath='/api/internal/command/check-reset';
const gatewayHeader='x-command-gateway-key', principalHeader='x-command-person-id';
export const standaloneActorKey=(person:string)=>'command-roster:'+person;
export const signInEntry='/command-access/sign-in',signOutEntry='/command-access/sign-out';
type AuthEnv={COMMAND_AUTH_MODE?:string;COMMAND_AUTH_GATEWAY_SECRET?:string;COMMAND_AUTH_INTERNAL_SECRET?:string};
const utf8=new TextEncoder();
const failure=(status:number)=>Response.json({error:status===503?'Command authentication is not configured.':'A verified Command sign-in is required.'},{status,headers:{'Cache-Control':'private, no-store'}});
const canRemoveRouteHeader=(k:string)=>/^(?:x-(?:middleware-|invoke-|nextjs-|vinext-rewrite|vinext-invoke|original-url$|rewrite-url$|matched-path$|now-route-matches$)|next-resume$)/i.test(k);
const rosterId=(s:string|null)=>!!s && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(s);

async function authenticKey(secret:string,supplied:string){
 // WebCrypto verifies the fixed-length MAC in constant time in both the web
 // worker and Node. Never log, forward, concatenate into a URL or store this key.
 const key=await crypto.subtle.importKey('raw',utf8.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const tag=await crypto.subtle.sign('HMAC',key,utf8.encode(secret));
 return crypto.subtle.verify('HMAC',key,tag,utf8.encode(supplied));
}
export async function trustedApplicationRequest(req:Request,env:AuthEnv):Promise<Request|Response>{
 const url=new URL(req.url);
 // Existing managed deployment is known by its exact gateway-routed URL. Never
 // infer Sites from arbitrary Host, X-Forwarded-Host or user-identity headers.
 const mode=env.COMMAND_AUTH_MODE??(url.origin===managedSitesOrigin?'sites':'');
 const internalPath=url.pathname.startsWith('/api/internal/');
 if(mode!=='sites'&&mode!=='standalone')return failure(503);
 const h=new Headers(req.headers),supplied=h.get(gatewayHeader),person=h.get(principalHeader);
 let changed=false;
 for(const k of Array.from(h.keys())){
  if(k===gatewayHeader||k===principalHeader||k.startsWith('x-command-internal-')||canRemoveRouteHeader(k)
   ||(mode==='standalone'&&(k.startsWith('oai-')||k.startsWith('cf-access-')||k.startsWith('x-auth-request-')||k==='remote-user'||k==='x-remote-user'||k==='x-forwarded-user'||k==='x-forwarded-email'))){
   h.delete(k);changed=true;
  }
 }
 if(internalPath && !(mode==='standalone'&&url.pathname===privateResetPath&&!url.search&&req.method==='POST'))return failure(401);
 if(mode==='standalone'){
  const secret=env.COMMAND_AUTH_GATEWAY_SECRET;
  if(typeof secret!=='string'||utf8.encode(secret.trim()).length<32||secret!==secret.trim())return failure(503);
  if(!supplied||!(await authenticKey(secret,supplied)))return failure(401);
  if(internalPath){
   const internal=env.COMMAND_AUTH_INTERNAL_SECRET,auth=h.get('authorization')||'';
   if(typeof internal!=='string'||utf8.encode(internal.trim()).length<32||internal!==internal.trim()||internal===secret)return failure(503);
   if(person!==null||!auth.startsWith('Bearer ')||!(await authenticKey(internal,auth.slice(7))))return failure(401);
   // Internal route independently verifies Authorization. No person identity or active session cookie.
   h.delete('cookie'); h.delete('x-command-read-only'); h.set('x-command-internal-reset-check','1');
  }else{
   if(!rosterId(person))return failure(401);
   h.set(verifiedRosterHeader,person!);
  }
  changed=true;
 }
 return changed?new Request(req,{headers:h}):req;
}
export function authDestination(headers:Pick<Headers,'get'>,out=false){
 return headers.get(verifiedRosterHeader)?(out?'/auth/logout':'/auth/login'):(out?'/signout-with-chatgpt?return_to=/':'/signin-with-chatgpt?return_to=/');
}
