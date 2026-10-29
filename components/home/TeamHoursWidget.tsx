'use client';
import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { requestJson } from '@/lib/shared/client';
import { canAccess } from '@/lib/finance/access';
import { today, workweek } from '@/lib/finance/model';
import { hoursLabel, weekHours, overtimeEligible, managesPerson } from '@/lib/finance/timeclock';
import type { Viewer, FinRecord } from '@/lib/finance/model';

export default function TeamHoursWidget({ viewer }: { viewer: Viewer }) {
  const [records, setRecords] = useState<FinRecord[] | null>(null), [error, setError] = useState('');
  const [now] = useState(() => Date.now());
  useEffect(() => {
    if (!canAccess(viewer, 'Timeclock')) return;
    let mounted = true;
    (async () => {
      try {
        const d = await requestJson<{ records: FinRecord[] }>('/api/finance?surface=timeclock');
        if (mounted) setRecords(d.records);
      } catch (e) { if (mounted) setError((e as Error).message); }
    })();
    return () => { mounted = false; };
  }, [viewer]);
  if (!canAccess(viewer, 'Timeclock')) return null;
  if (!records) return <section className="h-widget"><p className="h-detail">{error || 'Loading team hours…'}</p></section>;
  const company = records.find(r => r.id === 'company');
  const period = workweek(today(), company);
  const people = records.filter(r => r.kind === 'person' && (viewer.canManage ? managesPerson(viewer, r.id, records) : r.id === viewer.person));
  const near = people
    .map(p => ({ person: p, h: weekHours(records, p.id, period.start, period.end, now) }))
    .filter(({ person, h }) => overtimeEligible(person) && h.worked >= 32)
    .sort((a, b) => b.h.worked - a.h.worked);
  return (
    <section className="h-widget" data-widget="team_hours">
      <header className="h-widget-heading">
        <span className="h-widget-icon"><Clock3 size={20} /></span>
        <h2>Team hours this week</h2>
      </header>
      <div className="h-widget-body">
        <div className="h-items">
          {near.map(({ person: p, h }) => (
            <div className="h-item" key={p.id}>
              <span><b>{String(p.name)}</b><small>{String(p.department)}</small></span>
              <strong>{h.worked >= 40 ? `Over 40 by ${hoursLabel(h.worked - 40)}` : h.worked >= 36 ? 'Nearing 40 hours' : `${hoursLabel(40 - h.worked)} from 40 hours`}</strong>
            </div>
          ))}
        </div>
        {!near.length && <p className="h-empty">No one is close to 40 hours yet this week.</p>}
      </div>
    </section>
  );
}
