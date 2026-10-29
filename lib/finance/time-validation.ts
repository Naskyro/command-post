import { canReviewOvertime, overtimeReasons } from './overtime.ts';
import { canAccess } from './access.ts';
import type { FinRecord, Viewer } from './model';
import { isExempt, overtimeEligible, leaveBalance, localInstant, managesPerson } from './timeclock.ts';
export const timeKinds = ['shift', 'timeCorrection', 'leaveRequest', 'leaveCredit', 'overtime', 'time', 'shiftTemplate', 'shiftRequest'];
export function validateTime(next: FinRecord, old: FinRecord | undefined, v: Viewer, records: FinRecord[]) {
    if (!timeKinds.includes(next.kind))
        return;
    const p = records.find(r => r.kind === 'person' && r.id === next.person);
    const manager = managesPerson(v, String(next.person), records);
    if (!p && !(['shift', 'shiftTemplate'].includes(next.kind) && !next.person && (v.canManage || next.department === v.department && ['Department Head', 'Supervisor'].includes(v.role))))
        throw new Error('Choose a worker.');
    if (old && (old.person !== next.person && !(['shift', 'shiftTemplate'].includes(next.kind) && v.canManage) || old.kind !== next.kind))
        throw new Error('Create a new record to change the worker.');
    if (old && ['Approved', 'Denied', 'Cancelled'].includes(String(old.status)) && next.kind !== 'time')
        throw new Error('This decision is saved. Add a linked adjustment or ask a manager to cancel it.');
    if (old?.correctionId && next.kind === 'time')
        throw new Error('Use another time correction to preserve the approved correction.');
    if (!manager && next.person !== v.person && !(['shift', 'shiftTemplate'].includes(next.kind) && !next.person && (v.canManage || next.department === v.department && ['Department Head', 'Supervisor'].includes(v.role))))
        throw new Error('You can only submit your own time and leave requests.');
    const ownStatuses: Record<string, string[]> = { time: ['Draft'], timeCorrection: ['Requested'], leaveRequest: ['Requested'], overtime: ['Pending'], shiftRequest: ['Requested'] };
    if (!manager && !(['shift', 'shiftTemplate'].includes(next.kind) && !next.person && (v.canManage || next.department === v.department && ['Department Head', 'Supervisor'].includes(v.role))) && (!ownStatuses[next.kind]?.includes(String(next.status)) || old && String(old.status) !== String(next.status)))
        throw new Error('Your supervisor must review this change.');
    if (['time', 'timeCorrection'].includes(next.kind)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(next.date)) || !Number.isFinite(Number(next.hours)) || Number(next.hours) < 0 || Number(next.hours) > 24)
            throw new Error('Enter a date and 0–24 hours worked.');
        if (records.some(r => r.kind === 'payrun' && r.status === 'Released' && String(next.date) >= String(r.period) && String(next.date) <= String(r.periodEnd) && ((r.people || []) as string[]).includes(String(next.person))))
            throw new Error('Payroll for this date is released. Submit a pay correction in Finance.');
        if (next.kind === 'time' && !['Draft', 'Approved', 'Scheduled', 'Voided'].includes(String(next.status)))
            throw new Error('Choose a valid time status.');
    }
    if (next.kind === 'timeCorrection') {
        if (!String(next.reason || '').trim())
            throw new Error('Explain what needs to be corrected.');
        if (!['Requested', 'Approved', 'Denied'].includes(String(next.status)))
            throw new Error('Choose a valid correction status.');
        if (next.timeId) {
            const target = records.find(r => r.id === next.timeId && r.kind === 'time');
            if (!target || target.person !== next.person || target.date !== next.date)
                throw new Error('Select a time entry for this person and date.');
        }
        if (next.status === 'Approved' && next.timeId && records.some(r => r.kind === 'timeCorrection' && r.timeId === next.timeId && r.status === 'Approved' && r.id !== next.id))
            throw new Error('A correction already exists for this entry. Review its saved history first.');
    }
    if (['leaveRequest', 'leaveCredit'].includes(next.kind)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(next.date)) || !Number.isFinite(Number(next.hours)) || Number(next.hours) === 0)
            throw new Error('Enter a date and hours.');
        if (!['PTO', 'Comp time', 'Unpaid'].includes(String(next.type)) || next.kind === 'leaveCredit' && next.type === 'Unpaid')
            throw new Error('Choose a valid time-off type.');
        if (next.type === 'Comp time' && (!p || !isExempt(p)))
            throw new Error('Comp time is available only to workers marked salaried exempt in their pay agreement.');
        if (next.kind === 'leaveCredit' && (!manager || !canAccess(v, 'Timeclock', 'Time off', true) || !['Approved'].includes(String(next.status)) || !String(next.reason || '').trim()))
            throw new Error('Your supervisor must record the balance adjustment and reason.');
        if (next.kind === 'leaveRequest') {
            if (Number(next.hours) <= 0 || Number(next.hours) > 24 || !['Requested', 'Approved', 'Denied', 'Cancelled'].includes(String(next.status)))
                throw new Error('Request 0–24 hours for one date.');
            if (next.status === 'Approved' && next.type !== 'Unpaid') {
                const b = leaveBalance(records.filter(r => r.id !== next.id), String(next.person), String(next.type));
                if (!b.known || b.available < Number(next.hours))
                    throw new Error('Verify the leave balance and available hours before approving.');
            }
            if (next.status === 'Approved' && records.some(r => r.kind === 'shift' && r.person === next.person && r.status === 'Published' && String(r.start).slice(0, 10) <= String(next.date) && String(r.end).slice(0, 10) >= String(next.date)))
                throw new Error('Reassign the published shift before approving time off for this date.');
        }
    }
    if (next.kind === 'shiftTemplate') {
        if (!canAccess(v, 'Timeclock', 'Schedule', true) || !manager && !(next.department === v.department && ['Department Head', 'Supervisor'].includes(v.role) && !next.person) && !v.owner)
            throw new Error('Schedule changes require access to this department.');
        if (!['Active', 'Inactive'].includes(String(next.status)) || !Number.isInteger(Number(next.day)) || Number(next.day) < 0 || Number(next.day) > 6)
            throw new Error('Choose a weekday and active status.');
        const a = localInstant(String(next.date) + 'T' + next.startTime), b = localInstant(String(next.date) + 'T' + next.endTime);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b)
            throw new Error('Enter valid shift times.');
        next.overnight = String(next.endTime) <= String(next.startTime);
    }
    if (next.kind === 'shiftRequest') {
        const shift = records.find(r => r.kind === 'shift' && r.id === next.shiftId);
        if (!shift || shift.status === 'Cancelled' || shift.person)
            throw new Error('This shift is no longer available.');
        if (p?.status !== 'Active' || p?.department !== shift.department)
            throw new Error('You can request open shifts in your own department.');
        if (localInstant(shift.end) <= Date.now())
            throw new Error('This shift has already ended.');
        if (!['Requested', 'Approved', 'Denied'].includes(String(next.status)))
            throw new Error('Choose a valid request status.');
        if (records.some(r => r.kind === 'shiftRequest' && r.id !== next.id && r.shiftId === next.shiftId && r.person === next.person && r.status === 'Requested'))
            throw new Error('This worker already requested the shift.');
        if (next.status === 'Approved' && records.some(r => r.kind === 'shift' && r.id !== shift.id && r.person === next.person && r.status !== 'Cancelled' && localInstant(r.start) < localInstant(shift.end) && localInstant(r.end) > localInstant(shift.start)))
            throw new Error('This worker has an overlapping shift.');
        next.date = String(shift.start).slice(0, 10);
        next.department = shift.department;
        next.hours = (localInstant(shift.end) - localInstant(shift.start)) / 3600000;
    }
    if (next.kind === 'shift') {
        if (!manager && !(v.canManage && !next.person) && !(next.department === v.department && ['Department Head', 'Supervisor'].includes(v.role) && !next.person))
            throw new Error('Only a supervisor can schedule this worker.');
        if (!['Draft', 'Published', 'Cancelled'].includes(String(next.status)))
            throw new Error('Choose a valid shift status.');
        if (next.status === 'Published' && (!old || old.status !== 'Published'))
            throw new Error('Save the shift as Draft, then publish the week after checking coverage.');
        if (next.status === 'Published' && old && (next.start !== old.start || next.end !== old.end || next.coverageRole !== old.coverageRole))
            throw new Error('Save schedule changes as Draft and publish the updated week.');
        const a = localInstant(next.start), b = localInstant(next.end);
        if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 24 * 3600000)
            throw new Error('Choose valid Central start and end times, up to 24 hours apart.');
        if (next.status !== 'Cancelled' && next.person) {
            if (p?.status !== 'Active')
                throw new Error('Schedule an active worker.');
            if (records.some(r => r.kind === 'shift' && r.id !== next.id && r.person === next.person && r.status !== 'Cancelled' && localInstant(r.start) < b && localInstant(r.end) > a))
                throw new Error('This worker already has a shift during these hours.');
            if (records.some(r => r.kind === 'leaveRequest' && r.person === next.person && r.status === 'Approved' && String(r.date) >= String(next.start).slice(0, 10) && String(r.date) <= String(next.end).slice(0, 10)))
                throw new Error('This worker has approved time off on that date.');
        }
    }
    if (next.kind === 'overtime') {
        if (!p || !overtimeEligible(p) || p.status !== 'Active') throw new Error('Overtime requests are available to active nonexempt employees.');
        if (old && ['Approved', 'Denied'].includes(String(old.decision))) throw new Error('This overtime decision is saved. Submit a new request for additional hours.');
        const date = String(next.date || ''), hours = Number(next.hours);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || !Number.isFinite(hours) || hours <= 0 || hours > 128)
            throw new Error('Enter a valid date and additional overtime hours greater than zero, up to 128 for one workweek.');
        if (!overtimeReasons.includes(String(next.requestType)) && !(old && old.requestType === next.requestType)) throw new Error('Choose a reason for requesting overtime.');
        if (!['Pending', 'Approved', 'Denied'].includes(String(next.decision))) throw new Error('Choose a valid overtime decision.');
        const deciding = next.decision !== 'Pending';
        if (deciding && (!old || old.decision !== 'Pending' || !canReviewOvertime(v, String(next.person), records)))
            throw new Error('A supervisor must review a saved request. You cannot approve your own overtime.');
        if (deciding && ['date', 'hours', 'requestType', 'explanation'].some(k => next[k] !== old?.[k])) throw new Error('Review the request as submitted. Edit and save it before deciding.');
        if (deciding && !String(next.reviewNote || '').trim()) throw new Error('Add a review note.');
        if (!deciding && old && next.person !== v.person) throw new Error('Only the employee can edit their pending overtime request.');
        if (!old && next.person !== v.person && !manager) throw new Error('You can only request your own overtime.');
        next.status = deciding ? 'Reviewed' : 'Pending';
        next.submittedBy = old?.submittedBy || v.person;
        next.submittedAt = old?.submittedAt || new Date().toISOString();
        if (!deciding) { delete next.reviewedBy; delete next.reviewedAt; delete next.reviewNote; }
        const dept = records.find(r => r.kind === 'department' && r.name === p.department);
        next.departmentHead = dept?.head || '';
        next.supervisor = p.supervisor || dept?.head || '';
    }
    if (['Approved', 'Denied'].includes(String(next.status)) || next.kind === 'overtime' && next.decision !== 'Pending') {
        if (!manager)
            throw new Error('A supervisor must review this request.');
        next.reviewedBy = v.name;
        next.reviewedAt = new Date().toISOString();
    }
}
