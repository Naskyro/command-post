/** User-facing property review. File IDs are selected from the case, never typed hashes. */
export type PropertyLinkReview={caseId:string;version:number;expectedAccountId:string;accountId:string;method:'source'|'manual';propertyAsPrinted:string;basis:string;confirmed:boolean;evidence:{fileId:string;page:number}[]};
export type PropertyLinkReviewResult={status:'ready'|'review'|'confirmed';reason:string;id?:string;version?:number};
