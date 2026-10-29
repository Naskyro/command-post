'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { FinRecord } from '@/lib/finance/model';
import { daySegments, hourLabel, overlapGroups, type CalendarSegment } from '@/lib/finance/calendar';

type Props = {
  days: string[];
  shifts: FinRecord[];
  records: FinRecord[];
  editable: boolean;
  onEdit: (record: FinRecord) => void;
  onAdd: (day: string) => void;
};

const HOUR_HEIGHT = 48;
const dateLabel = (day: string) => new Date(day + 'T12:00Z').toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
});
const rangeLabel = (segment: { start: number; end: number }) => `${hourLabel(segment.start)}–${hourLabel(segment.end)}`;

export default function ShiftCalendar({ days, shifts, records, editable, onEdit, onAdd }: Props) {
  const [view, setView] = useState<'Week' | 'Day'>('Week');
  const [selectedDay, setSelectedDay] = useState(days[0] || '');
  const day = days.includes(selectedDay) ? selectedDay : days[0];
  const visibleDays = view === 'Day' ? days.filter(value => value === day) : days;
  const segmentsByDay = new Map(visibleDays.map(value => [value, daySegments(shifts, value)]));
  const dayLanes = Math.max(1, ...(segmentsByDay.get(day) || []).map(segment => segment.lanes));
  const names = new Map(records.filter(record => record.kind === 'person').map(record => [record.id, String(record.name)]));
  const workerName = (segment: CalendarSegment) => names.get(String(segment.record.person)) || 'Open shift';
  const openDay = (value: string) => { setSelectedDay(value); setView('Day'); };

  const shiftCard = (segment: CalendarSegment, date: string) => {
    const name = workerName(segment);
    const label = `${name} · ${dateLabel(date)} · ${rangeLabel(segment)} · ${segment.record.department} · ${segment.record.status}`;
    const lanes = view === 'Day' ? segment.lanes : 1;
    const lane = view === 'Day' ? segment.lane : 0;
    const height = (segment.end - segment.start) / 60 * HOUR_HEIGHT - 2;
    return <button key={segment.record.id} aria-label={label} title={label}
      className={['tc-hour-shift', !segment.record.person ? 'open' : '', segment.record.department === 'Drivers' ? 'driver' : '', height < 90 ? 'compact' : ''].join(' ')}
      style={{ top: segment.start / 60 * HOUR_HEIGHT, height: Math.max(20, height), left: `calc(${lane / lanes * 100}% + 4px)`, width: `calc(${100 / lanes}% - 8px)` }}
      onClick={() => onEdit(segment.record)}>
      <b>{name}</b>
      <span>{rangeLabel(segment)}</span>
      <small>{String(segment.record.department)}</small>
      {segment.record.status === 'Draft' && <small>Draft</small>}
      {!segment.record.person && <small>Available</small>}
      {segment.continued && <small>From previous day</small>}
      {segment.continues && <small>Continues tomorrow</small>}
    </button>;
  };

  return <section aria-label="Shift calendar">
    <div className="tc-calendar-controls">
      <div className="tc-calendar-switch" role="group" aria-label="Calendar view">
        {(['Week', 'Day'] as const).map(value => <button key={value} aria-pressed={view === value}
          onClick={() => setView(value)}>{value}</button>)}
      </div>
      {view === 'Day' && <label className="tc-calendar-date">Day
        <select aria-label="Calendar day" value={day} onChange={event => setSelectedDay(event.target.value)}>
          {days.map(value => <option key={value} value={value}>{dateLabel(value)}</option>)}
        </select>
      </label>}
    </div>
    <div className="tc-hour-scroll" role="region" aria-label={`${view} shift calendar`} tabIndex={0}>
      <div className="tc-hour-grid" style={{
        gridTemplateColumns: `72px repeat(${Math.max(1, visibleDays.length)}, minmax(0, 1fr))`,
        minWidth: view === 'Day' ? 72 + dayLanes * 180 : 72 + visibleDays.length * 160,
      }}>
        <div className="tc-hour-heading tc-time-heading">Time</div>
        {visibleDays.map(value => <header className="tc-hour-heading" key={'head' + value}>
          <button className="tc-calendar-day-link" onClick={() => openDay(value)} aria-label={`View ${dateLabel(value)} shifts`}>
            {dateLabel(value)}
          </button>
          {editable && <button className="f-icon" aria-label={'Add shift ' + value} onClick={() => onAdd(value)}><Plus size={16} /></button>}
        </header>)}
        <div className="tc-hour-axis">
          {Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: hour * HOUR_HEIGHT }}>{hourLabel(hour * 60)}</span>)}
        </div>
        {visibleDays.map(value => <div className="tc-hour-day" key={value}>
          {view === 'Day' ? segmentsByDay.get(value)?.map(segment => shiftCard(segment, value)) :
            overlapGroups(segmentsByDay.get(value) || []).map(group => {
              if (group.segments.length === 1) return shiftCard(group.segments[0], value);
              const height = (group.end - group.start) / 60 * HOUR_HEIGHT - 2;
              const visibleCount = Math.max(0, Math.floor((height - 88) / 44));
              const members = group.segments.slice(0, visibleCount);
              const remaining = group.segments.length - members.length;
              return <button className={'tc-hour-group' + (height < 80 ? ' compact' : '')} key={group.segments[0].record.id}
                style={{ top: group.start / 60 * HOUR_HEIGHT, height: Math.max(20, height) }}
                aria-label={`${group.segments.length} overlapping shifts on ${dateLabel(value)}, ${rangeLabel(group)}. View day.`}
                onClick={() => openDay(value)}>
                <b>{group.segments.length} shifts</b>
                <span className="tc-group-range">{rangeLabel(group)}</span>
                <span className="tc-group-members">{members.map(segment => <span className="tc-group-member" key={segment.record.id}>
                  <b title={workerName(segment)}>{workerName(segment)}</b><span>{rangeLabel(segment)}</span>
                </span>)}</span>
                <span className="tc-group-link">{remaining > 0 ? `+${remaining} more · ` : ''}View day →</span>
              </button>;
            })}
        </div>)}
      </div>
    </div>
  </section>;
}
