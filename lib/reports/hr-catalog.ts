import type {ReportDefinition,ReportFilters,ChartKind} from './types';
type Row=[string,string,string,ChartKind,boolean?];
const catalog:Record<string,Row[]>={
 'Workforce':[
 ['headcount','Active Headcount by Department','Where are active people assigned today?','bar'],
 ['employment-class','Employment Class Mix','Compare current full-time, part-time and other recorded classifications.','pie'],
 ['worker-type','Employees, Contractors & Owners','See the current workforce by recorded worker classification.','pie'],
 ['gender','Self-Reported Gender','Compare the recorded gender of active staff, including nonbinary, declined and unreported responses.','pie'],
 ['titles','Staffing by Job Title','Identify occupied roles and the number of active people in each.','bar'],
 ['employment-status','Employment Status Census','Count personnel files by current employment status, including former staff.','pie'],
 ['supervision','Supervisor Assignment Coverage','Find active staff whose reporting relationship has not been assigned.','bar'],
 ['tenure','Active Workforce Tenure','See how long active people with a known start date have worked here.','bar'],
 ['anniversaries','Upcoming Work Anniversaries','See upcoming service milestones within the next 90 days.','table'],
 ['start-gaps','Missing Start Dates','Find active personnel files that cannot be placed on the hiring timeline.','table'],
 ],
 'Workforce Movement':[
 ['hires','Hiring Trend','See monthly starts based on actual personnel start dates.','line',true],
 ['exit-trend','Separation Trend','See monthly endings based on recorded employment end dates.','line',true],
 ['net-growth','Net Workforce Movement','Compare monthly starts, endings and their net effect for dated records.','line',true],
 ['first-year-exits','First-Year Exits','Find separations before the first hire anniversary; inspect the dated employment spells.','table',true],
 ['retention','90-Day New-Hire Retention','Of hires with 90 observable days, how many remained through day 90?','bar',true],
 ],
 'Recruiting':[
 ['vacancy-status','Vacancy Status','Compare current openings, paused searches, filled roles and closed requisitions.','pie'],
 ['vacancy-age','Open Vacancy Aging','Rank current openings by days since the documented opening.','bar'],
 ['time-to-fill','Time to Fill Vacancies','Compare elapsed calendar days between opening and filling each vacancy.','bar',true],
 ['vacancy-targets','Vacancies Past Target Close','Find open requisitions past their target close date.','table'],
 ['fill-target','Actual vs Target Fill Date','See which filled roles met their target and by how many days.','bar',true],
 ['pipeline','Candidate Pipeline','Group applications by their current recruiting or onboarding stage.','bar'],
 ['applicants','Applicants per Vacancy','Identify open vacancies with many, few or no linked applications.','bar'],
 ['applications','Application Volume Over Time','See the monthly volume of recorded applications.','line',true],
 ['recruiter-load','Recruiter Workload','Count currently open searches assigned to each vacancy owner.','bar'],
 ],
 'Onboarding':[
 ['setup-status','Onboarding Work in Progress','See open setups by recorded workflow status.','bar'],
 ['setup-path','Onboarding Paths','Compare new-hire onboarding with existing-worker setup.','pie'],
 ['setup-age','Open Onboarding Age','Find staff still in setup and how long their workflow has been open.','table'],
 ['setup-duration','Time to Clear Onboarding','Compare elapsed days from setup creation through approved clearance.','bar',true],
 ['setup-trend','Onboarding Clearances by Month','See when employees actually received start clearance.','line',true],
 ],
 'Performance Notes':[
 ['notes-staff','Performance Notes by Employee','Find documented conversations, recognition and other notes for a person or team.','bar',true],
 ['notes-type','Performance Note Types','See the mix of coaching, verbal warnings, recognition and other event types.','pie',true],
 ['notes-category','Performance Topics','Find the most common categories on documented performance notes.','bar',true],
 ['notes-trend','Performance Documentation Trend','Compare documented events by month of conversation.','line',true],
 ['note-followups','Scheduled Performance Follow-Ups','See which recorded follow-up dates are approaching or have passed.','table',true],
 ],
 'Corrective Action':[
 ['actions-staff','Corrective Actions by Employee','Compare issued actions by staff member; drafts are excluded.','bar',true],
 ['cited-policies','Most Frequently Cited Policies','Rank accessible SOPs cited on issued corrective actions. A citation is not an independently confirmed violation.','bar',true],
 ['action-types','Issued Corrective Action Types','Compare written warnings, improvement plans and other issued actions.','bar',true],
 ['actions-trend','Corrective Actions Over Time','Trend issued actions by their recorded issue month.','line',true],
 ['action-status','Corrective Action Workflow','See how many records are drafts, awaiting signed copies, declined or signed.','pie'],
 ['unsigned','Awaiting Signed Corrective Actions','Find notices still awaiting the signed copy.','table'],
 ['action-followups','Corrective Action Follow-Ups','See follow-up dates recorded on issued actions.','table',true],
 ],
 'Compensation':[
 ['arrangements','Current Pay Arrangements','Compare active employees’ effective base pay arrangements, including mixed compensation.','pie'],
 ['pay-components','Pay Component Use','Count people with each effective compensation component; one person can have several.','bar'],
 ['hourly-raises','Hourly Pay Increases Over Time','Compare actual increases to an established hourly base rate.','line',true],
 ['salary-raises','Salary Increases Over Time','Compare actual increases to an established weekly-equivalent salary.','line',true],
 ['pay-changes','Pay Agreement History','Inspect effective-dated pay agreement changes, including promotions and training transitions.','table',true],
 ['scheduled-pay','Scheduled Pay Changes','See upcoming non-cancelled changes and their effective dates.','table',true],
 ['pay-reasons','Reasons for Pay Changes','See which recorded reasons drove effective agreement changes.','pie',true],
 ['career-pay-register','Pay by Historical Role','Inspect the hourly rate and employment class recorded for previous roles, even where the dates are not yet known.','table',true],
 ['pay-tenure','Hourly Pay vs Service Length','Explore the relationship between recorded hourly base and years of service for current staff.','scatter'],
 ['hourly-rates','Hourly Rate Distribution','See current hourly base rates in meaningful pay bands.','bar'],
 ],
 'Career History':[
 ['career-moves','Position & Career History','Inspect recorded role changes, including historical positions without a known effective date.','table',true],
 ['promotions','Promotions by Month','Count dated promotions recorded in the role or pay history.','line',true],
 ],
 'Education':[
 ['education-level','Highest Reported Education','Group active people by highest completed education; separate missing history from ongoing studies.','bar'],
 ['education-field','Fields of Study','See the reported fields of study across active staff.','bar'],
 ['education-progress','Education in Progress','Find staff with ongoing programs and the reported study level.','table'],
 ['education-coverage','Education Record Coverage','Compare how many active people have reported education by department.','bar'],
 ],
 'Separations':[
 ['separation-type','Reasons for Separation by Type','Group finalized offboarding records by structured separation type.','pie',true],
 ['rehire','Rehire Decisions','See recorded rehire outcomes for finalized separations.','bar',true],
 ],
};
export const hrDefinitions:ReportDefinition[]=Object.entries(catalog).flatMap(([group,items])=>items.map(([id,title,description,visual,dated])=>{
 const filters:(keyof ReportFilters)[]=group==='Recruiting'?['department']:['department','person'];
 if(dated)filters.push('from','to');
 return {id,title,description,visual,group,filters};
}));
