import { current, today, type Row } from './model';
import { profilePhoto } from './contact-details';

export const isPendingAccount = (r: Row) => r.kind === 'account' && r.status === 'Onboarding';
export type OnboardingStep = string;
const present = (v: unknown) => typeof v === 'string' && !!v.trim();
const email = (v: unknown) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const phone = (v: unknown) => typeof v === 'string' && v.replace(/\D/g, '').length >= 10;
const skipTaskNames = new Set(['confirm agreement and operating plan', 'prepare resident communications', 'agree on launch milestones']);

export function onboardingTasks(account: Row, all: Row[]): Row[] {
  return all.filter(r => r.kind === 'playbook' && r.type === 'Onboarding' && r.status === 'Current' && !skipTaskNames.has(String(r.name || '').toLowerCase())
    && !all.some(t => t.id === 'onboard:' + account.id + ':' + r.id)).map(r => ({
      id: 'onboard:' + account.id + ':' + r.id, kind: 'task', version: 0, name: r.name,
      accountId: account.id, type: r.phase === 'After activation' ? 'Post-launch check' : 'Onboarding',
      details: r.details, required: r.phase !== 'After activation' && !!r.required,
      status: 'Open', assignee: account.assignee,
    }));
}

export function onboardingReadiness(account: Row, all: Row[], day = today()) {
  const contacts = all.filter(r => r.kind === 'affiliation' && r.accountId === account.id && current(r, day));
  const contact = all.find(r => r.kind === 'contact' && r.id === account.primaryContactId);
  const affiliation = contacts.find(r => r.contactId === contact?.id);
  const agreement = all.some(r => r.kind === 'file' && r.accountId === account.id && r.category === 'Agreement'
    && r.status === 'Current' && !!(r.storageKey || r.sourceUrl));
  const tasks = all.filter(r => r.kind === 'task' && r.accountId === account.id && r.type === 'Onboarding' && !skipTaskNames.has(String(r.name || '').toLowerCase()));
  const required = tasks.filter(r => r.required);
  const launchMissing = [
    ...(!account.onboardingStartedAt ? ['Start the launch checklist'] : []),
    ...(!present(account.instructions) ? ['Add operating instructions'] : []),
    ...(!account.launchDate ? ['Set a launch date'] : String(account.launchDate) > day ? ['Wait until the planned launch date'] : []),
  ];
  const taskSteps = tasks.map(t => ({ id: t.id, title: t.name, missing: t.status === 'Completed' ? [] : [t.details || 'Complete this step'], done: false }));
  const baseSteps: {id: OnboardingStep; title: string; missing: string[]; done: boolean}[] = [
    { id: 'details', title: 'Property details', missing: [
      ...(!present(account.name) ? ['Property name'] : []), ...(!present(account.address) ? ['Property address'] : []),
      ...(!['Residential', 'Commercial'].includes(String(account.propertyType)) ? ['Property type'] : []),
      ...(!['Full Patrol', 'Basic Patrol', 'Call In'].includes(String(account.service)) ? ['Service level'] : []),
      ...(!account.assignee ? ['Assigned account manager'] : []),
      ...(contact && affiliation && (email(affiliation.workEmail) || phone(affiliation.workPhone) || email(contact.email) || phone(contact.personalPhone)) ? [] : ['Link a primary contact with an email or phone number for this property']),
    ], done: false },
    { id: 'photos', title: 'Property photo', missing: profilePhoto(all, account) ? [] : ['Upload a property profile photo'], done: false },
    { id: 'agreement', title: 'Towing agreement', missing: [
      ...(!agreement ? ['Upload the signed towing agreement'] : []),
      ...(!account.agreementVerified ? ['Confirm the signed agreement and its terms'] : []),
    ], done: false },
    { id: 'launch', title: 'Launch plan', missing: launchMissing, done: false },
    ...taskSteps,
  ].map(step => ({...step, done: !step.missing.length})) as {id:OnboardingStep;title:string;missing:string[];done:boolean}[];
  const allBaseDone = baseSteps.every(s => s.done);
  const finishStep = { id: 'finish', title: 'Finish', missing: allBaseDone ? [] : ['Complete all previous sections'], done: allBaseDone };
  const steps = [...baseSteps, finishStep];
  const completed = steps.filter(s => s.done).length;
  return {steps, tasks, required, completed, total: steps.length, percent: Math.round(completed / steps.length * 100),
    ready: allBaseDone, missing: steps.flatMap(s => s.missing)};
}
