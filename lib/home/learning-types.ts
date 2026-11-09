import type {HomeTarget} from './widgets';
export type HomeLearningItem={id:string;title:string;percent:number;due?:string;overdue:boolean;awaitingReview:boolean;nextLesson?:string;target:HomeTarget};
export type HomeLearning={assigned:number;pending:number;completed:number;inProgress:number;overdue:number;awaitingReview:number;percent:number;items:HomeLearningItem[];team?:{pending:number;overdue:number;awaitingReview:number;people:number}};
