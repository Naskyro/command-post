export const taskStatuses = ['Open', 'In progress', 'Waiting', 'Completed', 'Cancelled'];
export const orderStatuses = ['Requested', 'Scheduled', 'In progress', 'Waiting', 'Ready for review', 'Completed', 'Cancelled'];
export const waitingRoles = ['Property manager', 'Assistant property manager', 'Regional manager', 'Management company', 'Operations', 'Vendor', 'Other'];
export const orderTypes = ['Signage Install', 'Signage Removal', 'Custom Signage', 'Visitor Stenciling', 'Handicap Stenciling', 'Reserved Spot Stenciling', 'Paint Removal', 'Flyering'];

export const workTypeSettingsId = 'settings:work-types';
export function workTypeOptions(all: {kind:string; id:string; options?:unknown}[]) {
  const config = all.find(r => r.id === workTypeSettingsId && r.kind === 'workTypes');
  return config && Array.isArray(config.options) ? config.options as string[] : orderTypes;
}
