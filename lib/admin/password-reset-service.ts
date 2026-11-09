// Server-only transport. Never store a returned reset link or include it in log/error data.
export type ResetConfig={internal:URL;publicOrigin:string;secret:string};
export type ResetsEnv={COMMAND_AUTH_INTERNAL_URL?:string;COMMAND_AUTH_PUBLIC_ORIGIN?:string;COMMAND_PUBLIC_ORIGIN?:string;COMMAND_AUTH_INTERNAL_SECRET?:string};
export function resetConfig(env:ResetsEnv):ResetConfig|null{
 try{
  const internal=new URL(env.COMMAND_AUTH_INTERNAL_URL||''),site=new URL(env.COMMAND_PUBLIC_ORIGIN||env.COMMAND_AUTH_PUBLIC_ORIGIN||''),secret=env.COMMAND_AUTH_INTERNAL_SECRET||'';
  if(new TextEncoder().encode(secret).length<32||internal.username||internal.password||internal.search||internal.hash||site.username||site.password||site.search||site.hash||site.pathname!=='/'||site.protocol!=='https:')return null;
  if(internal.protocol!=='https:'&&!(internal.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(internal.hostname)))return null;
  return {internal:new URL('/internal/command/reset',internal),publicOrigin:site.origin,secret};
 }catch{return null;}
}
export async function issuePasswordReset(config:ResetConfig,data:{personId:string;username?:string;actorId:string;reason:string},transport:typeof fetch=fetch){
 const response=await transport(config.internal.toString(),{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+config.secret,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)});
 if(!response.ok)throw Error('service-unavailable');
 const b=await response.json() as {username?:unknown;resetUrl?:unknown;expiresAt?:unknown};
 if(typeof b.username!=='string'||!b.username||b.username.length>150||typeof b.resetUrl!=='string'||typeof b.expiresAt!=='string')throw Error('invalid-result');
 const url=new URL(b.resetUrl),at=Date.parse(b.expiresAt);
 if(url.origin!==config.publicOrigin||url.pathname!=='/auth/reset'||url.username||url.password||!Number.isFinite(at)||at<=Date.now()||at>Date.now()+24*60*60*1000||!url.searchParams.get('token'))throw Error('invalid-result');
 return {username:b.username,expiresAt:b.expiresAt,resetUrl:url.href};
}
