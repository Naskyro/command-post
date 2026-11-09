import type {SopRequest} from './model';
export const sampleRequest:SopRequest={
  id:'sample-sop-shift-handoff',sample:true,kind:'Request a Change',topicId:'DSP',policyId:'',
  question:'Could the shift handoff checklist include a place to note where an open item was left and who is following up?',
  reason:'The sample dispatcher handed a pending callback to the next shift. The phone note explained what had happened but didn’t identify who would call back.',
  requestedBy:'Sample Dispatcher',createdAt:'2026-10-27T13:00:00Z',status:'In Review',
  note:'The sample reviewer is checking the proposed handoff step with the dispatch supervisor before revising the policy.',
  updatedBy:'Sample Policy Reviewer',updatedAt:'2026-10-27T16:00:00Z',
};
