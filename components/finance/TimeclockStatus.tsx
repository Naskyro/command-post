'use client';
import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { requestJson } from '@/lib/shared/client';
import { canAccess } from '@/lib/finance/access';
import type { Viewer } from '@/lib/finance/model';

type Entry = { id: string; employee_id: string; started_at?: string; clock_out?: string; on_break?: boolean };
type StatusData = { time_entries: Entry[] };

function fmtDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TimeclockStatus({ viewer }: { viewer: Viewer }) {
  const [active, setActive] = useState<{ startedAt: string; onBreak: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!canAccess(viewer, 'Timeclock')) return;
    let mounted = true;
    async function load() {
      try {
        const data = await requestJson<StatusData>(`/api/finance/timeclock?employee_id=${encodeURIComponent(viewer.person)}&status=pending`);
        const entry = data.time_entries.find(e => e.employee_id === viewer.person && e.id.startsWith('clock-active:') && e.started_at && !e.clock_out);
        if (!mounted) return;
        setActive(entry ? { startedAt: entry.started_at!, onBreak: entry.on_break || false } : null);
      } catch (e) { /* ignore polling errors */ }
    }
    load();
    const poll = setInterval(load, 30000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onUpdate = () => { if (!mounted) return; load(); };
    window.addEventListener('cp-timeclock-updated', onUpdate);
    return () => { mounted = false; clearInterval(poll); clearInterval(tick); window.removeEventListener('cp-timeclock-updated', onUpdate); };
  }, [viewer]);
  if (!canAccess(viewer, 'Timeclock')) return null;
  const go = () => { window.location.href = '/?module=Timeclock'; };
  if (active) {
    if (active.onBreak) return <button className="p-clock-status" onClick={go} aria-label="On break"><Clock3 size={18}/><span>On break</span></button>;
    const duration = now - new Date(active.startedAt).getTime();
    return <button className="p-clock-status active" onClick={go} aria-label={`Clocked in for ${fmtDuration(duration)}`}><Clock3 size={18}/><span>Clocked in · {fmtDuration(duration)}</span></button>;
  }
  return <button className="p-clock-status" onClick={go} aria-label="Not clocked in"><Clock3 size={18}/><span>Not clocked in</span></button>;
}
