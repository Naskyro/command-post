export type AnnouncementStatus='Draft'|'Published'|'Archived';
export type Announcement={id:string;version:number;title:string;body:string;priority:'Information'|'Important'|'Urgent';status:AnnouncementStatus;startsAt:string;endsAt:string;requiresAcknowledgment:boolean;contentRevision:number;createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;publishedAt?:string;publishedBy?:string;archivedAt?:string;archivedBy?:string};
export type AnnouncementView=Announcement&{state:'Draft'|'Scheduled'|'Active'|'Expired'|'Archived';acknowledged:boolean};
export type AnnouncementRecipient={personId:string;name:string;department:string;status:string;acknowledgedAt?:string;revision:number};
export type AnnouncementAdminView=AnnouncementView&{recipientCount:number;acknowledgedCount:number;pendingCount:number;recipients:AnnouncementRecipient[]};
export type AnnouncementData={canViewAdmin:boolean;canManage:boolean;active:AnnouncementView[];announcements:AnnouncementAdminView[]};
/** GET /api/site-announcements (or /api/announcements) returns active, unacknowledged banners for this person.
 GET ?admin=1 adds all announcements and current-revision recipient acknowledgement detail, requires Admin/announcements View.
 POST save {announcement:{id?:string,version?:number,title,body,priority,startsAt,endsAt,requiresAcknowledgment}}
 returns {announcement}. Save preserves Published status for an already-published message: content changes immediately require acknowledgement of a new contentRevision. UI button must say Save & Update Announcement for published, Save Draft otherwise.
 POST publish {id,version} -> {announcement}; POST archive {id,version,reason} -> {announcement}.
 POST ack {id,revision} -> {acknowledged:true,acknowledgedAt}; affects only signed-in person's current revision receipt.
 Dates are ISO strings with timezone; empty start means immediate and empty end means no expiration. */
