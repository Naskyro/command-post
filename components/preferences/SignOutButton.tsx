'use client';
import {useRef,useState} from 'react';
import {LogOut} from 'lucide-react';
import {commandSignOutDestination} from '@/lib/shared/sign-out';
import './sign-out.css';

export default function SignOutButton({delegated=false,authenticated=true}:{delegated?:boolean;authenticated?:boolean}){
  const pending=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function signOut(){
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{
      const destination=await commandSignOutDestination({delegated,authenticated});
      window.location.assign(destination);
    }catch(e){
      pending.current=false;setBusy(false);
      setError(e instanceof Error?e.message:'Could not sign out. Please try again.');
    }
  }
  return <div className="command-sign-out"><button type="button" className="command-sign-out-button" aria-label="Sign Out" aria-busy={busy} disabled={busy} onClick={()=>void signOut()}><LogOut size={17} aria-hidden="true"/><span>{busy?'Signing Out…':'Sign Out'}</span></button>{error&&<div className="command-sign-out-error" role="alert">{error}</div>}</div>;
}
