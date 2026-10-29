import type { FinRecord } from './model';
export type CalendarSegment = {
    record: FinRecord;
    start: number;
    end: number;
    continued: boolean;
    continues: boolean;
    lane: number;
    lanes: number;
};
export function daySegments(shifts: FinRecord[], day: string): CalendarSegment[] {
    const start = day + 'T00:00', next = new Date(day + 'T12:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    const end = next.toISOString().slice(0, 10) + 'T00:00';
    const minute = (text: string) => Number(text.slice(11, 13)) * 60 + Number(text.slice(14, 16));
    const segments = shifts.filter(r => String(r.start) < end && String(r.end) > start && r.status !== 'Cancelled').map(record => ({ record, start: String(record.start) < start ? 0 : minute(String(record.start)), end: String(record.end) >= end ? 1440 : minute(String(record.end)), continued: String(record.start) < start, continues: String(record.end) > end, lane: 0, lanes: 1 })).filter(s => s.end > s.start).sort((a, b) => a.start - b.start || b.end - a.end);
    let group: CalendarSegment[] = [], laneEnds: number[] = [], groupEnd = -1;
    const close = () => { for (const s of group)
        s.lanes = laneEnds.length; group = []; laneEnds = []; };
    for (const s of segments) {
        if (s.start >= groupEnd) {
            close();
            groupEnd = -1;
        }
        let lane = laneEnds.findIndex(end => end <= s.start);
        if (lane < 0)
            lane = laneEnds.length;
        laneEnds[lane] = s.end;
        s.lane = lane;
        group.push(s);
        groupEnd = Math.max(groupEnd, s.end);
    }
    close();
    return segments;
}
export type CalendarGroup = { start: number; end: number; segments: CalendarSegment[] };
export function overlapGroups(segments: CalendarSegment[]): CalendarGroup[] {
    const groups: CalendarGroup[] = [];
    for (const segment of [...segments].sort((a, b) => a.start - b.start || b.end - a.end)) {
        const previous = groups[groups.length - 1];
        if (previous && segment.start < previous.end) {
            previous.end = Math.max(previous.end, segment.end);
            previous.segments.push(segment);
        } else {
            groups.push({ start: segment.start, end: segment.end, segments: [segment] });
        }
    }
    return groups;
}
export const hourLabel = (minute: number) => { const h = Math.floor(minute / 60) % 24, m = minute % 60; return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`; };
