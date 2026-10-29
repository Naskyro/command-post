export const taskStatuses = ['Open', 'In progress', 'Waiting', 'Completed', 'Cancelled'];
export const orderStatuses = ['Requested', 'Scheduled', 'In progress', 'Waiting', 'Ready for review', 'Completed', 'Cancelled'];
export const waitingRoles = ['Property manager', 'Assistant property manager', 'Regional manager', 'Management company', 'Operations', 'Vendor', 'Other'];
export const orderTypes = ['Signage Install', 'Signage Removal', 'Custom Signage', 'Visitor Stenciling', 'Handicap Stenciling', 'Reserved Spot Stenciling', 'Paint Removal', 'Flyering'];

export const workTypeSettingsId = 'settings:work-types';
export function workTypeOptions(all: {kind:string; id:string; options?:unknown}[]) {
  const config = all.find(r => r.id === workTypeSettingsId && r.kind === 'workTypes');
  return config && Array.isArray(config.options) ? config.options as string[] : orderTypes;
}

// ── Full Work Order module statuses, priorities, and categories ─────────────────
export const woStatuses = [
  'New','Needs Review','Needs More Information','Awaiting Approval','Approved',
  'Assigned','Scheduled','In Progress','Awaiting Service Provider','Awaiting Parts',
  'Awaiting Delivery','Awaiting Requester','Ready for Verification',
  'Completed','Deferred','Cancelled','Duplicate','Unable to Complete',
] as const;
export type WOStatus = typeof woStatuses[number];

export const woPriorities = ['Emergency','Urgent','Normal','Low'] as const;
export type WOPriority = typeof woPriorities[number];

export const woCategories = [
  'Account Management','Fleet Maintenance & Repairs','IT Support',
  'Facilities & Maintenance','Supplies & Purchasing',
  'Hardware, Software & Access','Safety','Project','Other',
] as const;
export type WOCategory = typeof woCategories[number];

export const fleetVehicleStatuses = [
  'Ready','Ready With Noncritical Issues','Limited Use',
  'Scheduled for Service','Awaiting Repair','Out of Service',
  'Sold','Retired','Totaled','Historical',
] as const;

export const inspectionAnswers = ['Yes','No','Not Checked','Not Applicable'] as const;
export const inspectionGrades  = ['Pass','Needs Attention','Fail','Not Checked','Not Applicable'] as const;

export const woPaymentMethods = [
  'Company card','Personal card — reimbursement','Cash','Check','ACH',
  'Zelle','Cash App','Venmo','Financing','Warranty','Other',
] as const;

export const woAssetStatuses = [
  'Available','Assigned','Checked Out','Missing','Damaged','In Repair','Disposed',
] as const;

export const woProviderStatuses = [
  'Active','Inactive','Pending Review','Do Not Use',
] as const;

// Category → default request types
export const woCategoryTypes: Record<string, string[]> = {
  'Account Management': ['Property sign issue','Property access request','Property service change','Signage install','Signage repair or replacement','Other account request'],
  'Fleet Maintenance & Repairs': ['Oil change','Brake inspection or repair','Tire rotation or replacement','Transmission service','Engine repair','Electrical issue','Hydraulics / wheel lift','Winch or cable','Lightbar','Suspension','Battery','AC / heat','Scheduled PM','State inspection','Registration renewal','Tow truck permit renewal','Breakdown follow-up','Defect report','Other fleet repair'],
  'IT Support': ['Printer not working','Computer issue','Internet or network problem','Email issue','Software access','Phone or tablet problem','Camera or recorder issue','Radio issue','Other IT request'],
  'Facilities & Maintenance': ['Plumbing – toilet','Plumbing – sink / drain','Plumbing – water leak','Plumbing – low pressure','Restroom supplies low','Door or lock issue','Gate issue','Window or blind','Lighting – interior','Lighting – exterior / parking','Electrical outlet or breaker','Window AC issue','Landscaping','Yard cleanup','Drainage or surface','Pressure washing','Pest control','Janitorial service','Dumpster pickup / missed service','Portable toilet service','Other facility issue'],
  'Supplies & Purchasing': ['Printer paper','Toner or ink','Labels / label-printer rolls','Pens / markers','File folders / envelopes','Cleaning supplies','Restroom supplies','Trash bags','Water / breakroom','Safety supplies','Operational consumables','Other supply request'],
  'Hardware, Software & Access': ['New or replacement phone','New or replacement iPad / tablet','New or replacement laptop or desktop','Monitor / printer / accessory','Software license or seat','ChatGPT usage','Dialpad license','Email account','ADP access','Towbook access','TowCentric access','Shared drive or file access','New employee tech setup','Employee offboarding','Access removal','Device return or reassignment','Other hardware or access request'],
  'Safety': ['Immediate safety hazard','Injury or near miss','Unsafe equipment','Unsafe condition','Fire or evacuation','Chemical or spill','Security concern','Vehicle safety concern','Other safety concern'],
  'Project': ['New project','Add work to existing project'],
  'Other': ['Not listed – describe below'],
};
