/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import { delegateRequestAction,delegatedReadResponse,restricted } from "../lib/admin/delegated-policy";
import {delegatedReadRequest} from "../lib/admin/delegated-server";
import {trustedApplicationRequest,verifiedRosterHeader,signInEntry,signOutEntry,authDestination} from "../lib/auth/edge-identity";
import handler from "vinext/server/app-router-entry";

interface Env {
  COMMAND_AUTH_MODE?:string;
  COMMAND_AUTH_GATEWAY_SECRET?:string;
  COMMAND_AUTH_INTERNAL_SECRET?:string;
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const normalized=await trustedApplicationRequest(request,env);
    if(normalized instanceof Response)return normalized;
    request=normalized;
    const url = new URL(request.url);

    // Every request crosses this boundary, including legacy raw-fetch requests.
    // Delegated reads are session-verified; mutations and callbacks stay closed.
    const action=delegateRequestAction(request);
    if(action==='deny')return restricted();
    if(action==='asset')return env.ASSETS.fetch(new Request(url.origin+url.pathname,{method:request.method}));
    if(action==='read'){
      const scoped=await delegatedReadRequest(request);
      if(scoped instanceof Response)return scoped;
      return delegatedReadResponse(request,await handler.fetch(scoped,env,ctx));
    }
    if(action==='shell'){
      // Both shells load protected data from the verified APIs. Preserve the
      // render protocol for client navigation, without forwarding any identity.
      const renderHeaders=new Headers({accept:'text/html'});
      for(const key of ['accept','rsc','next-router-state-tree','next-router-prefetch','next-router-segment-prefetch','next-url','x-vinext-interception-context','x-vinext-mounted-slots','x-vinext-rsc-render-mode']){
        const value=request.headers.get(key);if(value!==null)renderHeaders.set(key,value);
      }
      const res=await handler.fetch(new Request(url,{method:request.method,headers:renderHeaders}),env,ctx);
      return delegatedReadResponse(request,res);
    }
    if(action==='control'||action==='project'){
      // Fixed internal route and a strictly allowlisted original path. No identity
      // header is rewritten to impersonate the subject. Ignore routing overrides.
      const dest=new URL(action==='control'?'/api/delegated-access':'/api/delegated-access/view',url.origin);
      if(action==='project'){
        dest.searchParams.set('surface',url.pathname);
        for(const k of ['module','tab'])if(url.searchParams.has(k))dest.searchParams.set(k,url.searchParams.get(k)!);
      }
      const headers=new Headers();
      for(const k of ['cookie','origin','sec-fetch-site','content-type','content-length','x-command-read-only','oai-authenticated-user-id','oai-authenticated-user-email',verifiedRosterHeader]){
        const value=request.headers.get(k);if(value!==null)headers.set(k,value);
      }
      return handler.fetch(new Request(dest,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body}),env,ctx);
    }
    if(url.pathname===signInEntry||url.pathname===signOutEntry){
      if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
      return new Response(null,{status:303,headers:{Location:authDestination(request.headers,url.pathname===signOutEntry),'Cache-Control':'private, no-store'}});
    }
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
