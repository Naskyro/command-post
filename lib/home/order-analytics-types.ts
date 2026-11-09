// No property names, assignments, notes, costs or audit details leave the server.
export type HomeOrderWeek={week:string;opened:number|null;completed:number|null;partial:boolean};
export type HomeOrderAnalytics={
 weeks:HomeOrderWeek[];asOf:string;coverageFrom:string|null;
 undatedOpened:number;undatedCompleted:number;
};
