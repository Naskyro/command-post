import {isDelegatedClient,requestJson} from './client';

/** Leave the read-only employee view before crossing the real authentication boundary. */
export async function commandSignOutDestination({delegated=false,authenticated=true}:{delegated?:boolean;authenticated?:boolean}={}) {
  if(delegated||isDelegatedClient()){
    await requestJson('/api/delegated-access',{action:'end'});
    // A full navigation drops the document's restrictive marker. The server has
    // already cleared the view cookie; never unlock this mounted document.
    return '/command-access/sign-out';
  }
  if(!authenticated)return '/command-access/sign-out';
  const response=await requestJson<{redirect:string}>('/api/session',{});
  // These are the two authentication providers supported by the server. Never
  // redirect a sign-out action to an arbitrary URL returned by a failed proxy.
  if(response.redirect!=='/auth/logout'&&response.redirect!=='/signout-with-chatgpt?return_to=/'){
    throw new Error('The sign-out destination could not be verified. Please try again.');
  }
  return response.redirect;
}
