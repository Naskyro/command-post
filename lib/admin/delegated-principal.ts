// These headers are set only after the outer worker has verified a live
// delegated session. trustedApplicationRequest removes every incoming
// x-command-internal-* header before that verification runs.
export const delegatedSubjectHeader='x-command-internal-delegated-person';
export const delegatedSessionHeader='x-command-internal-delegated-session';
export const delegatedActorHeader='x-command-internal-delegated-actor';

export function delegatedPrincipal(headers:Pick<Headers,'get'>){
 const person=headers.get(delegatedSubjectHeader),session=headers.get(delegatedSessionHeader),actor=headers.get(delegatedActorHeader);
 if(person===null&&session===null&&actor===null)return null;
 if(!person||!actor||!session||!/^[-A-Za-z0-9._:]{1,192}$/.test(person)||!/^[-A-Za-z0-9._:]{1,192}$/.test(actor)||! /^[a-f0-9-]{36}$/.test(session))throw new Error('The delegated identity could not be verified.');
 return {person,session,actor,id:'delegated:'+session};
}
