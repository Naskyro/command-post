// Server-only course seeds. Never expose answer-key data from this module directly to a client.
import {vsfCourses} from './private/vsf-courses';
import {accountManagerCourses} from './private/account-manager-courses';
import type {SchoolCourse} from './model';
export const seedCourses:SchoolCourse[]=[...vsfCourses,...accountManagerCourses];
