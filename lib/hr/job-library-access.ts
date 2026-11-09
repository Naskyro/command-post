import type { FinRecord, Viewer } from '../finance/model';
import { canUseHiring } from './hiring.ts';
import { hrCan } from './permissions.ts';

/** Keep the library link, direct navigation, and module search consistent. */
export const showJobLibrary = (viewer: Viewer, people: FinRecord[]) =>
  !viewer.onboardingOnly && (canUseHiring(viewer) || hrCan(viewer, 'managePositions', undefined, people));
