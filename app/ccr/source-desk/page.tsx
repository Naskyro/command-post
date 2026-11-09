import type {Metadata} from 'next';
import SourceFilingDesk from '@/components/ccr/SourceFilingDesk';
export const metadata:Metadata={title:'Source Filing Desk | Command',robots:{index:false,follow:false}};
export default function Page(){return <SourceFilingDesk/>;}
