import type {Metadata} from 'next';
import FiledClaimPhotos from '@/components/ccr/FiledClaimPhotos';
export const metadata:Metadata={title:'Claim Photos | Command',robots:{index:false,follow:false,noarchive:true},referrer:'no-referrer'};
export default function Page(){return <FiledClaimPhotos/>;}
