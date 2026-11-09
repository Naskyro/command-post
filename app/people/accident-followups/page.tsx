import type {Metadata} from 'next';
import AccidentFollowups from '@/components/people/AccidentFollowups';

export const metadata:Metadata={title:'Accident Follow-Ups | Command',robots:{index:false,follow:false,noarchive:true},referrer:'no-referrer'};
export default function Page(){return <AccidentFollowups/>;}
