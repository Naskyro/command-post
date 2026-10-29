'use client';
import { useState, useEffect } from 'react';
import { ArrowRight, RefreshCw, Mail, MessageSquare, CalendarDays, Clock3, Wallet, Receipt, Users, ShieldCheck, Wrench, LayoutGrid, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { requestJson } from '@/lib/shared/client';
import { canAccess } from '@/lib/finance/access';
import { greeting } from '@/lib/home/layout';
import type { HomeData, HomeTarget, HomeSelection, HomeChart, WidgetPlacement } from '@/lib/home/widgets';
import TeamHoursWidget from './TeamHoursWidget';
import '@/components/finance/finance.css';
import './home.css';

const icons: Record<string, typeof Mail> = { inbox: Mail, slack: MessageSquare, shifts: CalendarDays, hours: Clock3, time_off: CalendarDays, open_shifts: CalendarDays, pay: Wallet, spending: Receipt, approvals: ShieldCheck, coverage: Users, team_time: Clock3, payroll: Wallet, bills: Receipt, taxes: CalendarDays, work_orders: Wrench };

const chartColors = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#f43f5e', '#64748b'];

function HomeChart({ chart }: { chart: HomeChart }) {
  const data = chart.data as Record<string, unknown>[];
  if (chart.type === 'bar') {
    return <div className="h-chart"><ResponsiveContainer width="100%" height={150}><BarChart data={data} margin={{ left: 4, right: 4, bottom: 16 }}>
      <XAxis dataKey={chart.xKey} tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={36} />
      <YAxis hide />
      <Tooltip formatter={(v) => [v, chart.yKey]} />
      <Bar dataKey={chart.yKey} fill={chart.color || '#3b82f6'} radius={[4, 4, 0, 0]} />
    </BarChart></ResponsiveContainer></div>;
  }
  if (chart.type === 'line') {
    return <div className="h-chart"><ResponsiveContainer width="100%" height={150}><LineChart data={data} margin={{ left: 4, right: 4, bottom: 4 }}>
      <XAxis dataKey={chart.xKey} tick={{ fontSize: 10 }} />
      <YAxis hide />
      <Tooltip />
      <Line type="monotone" dataKey={chart.yKey} stroke={chart.color || '#3b82f6'} strokeWidth={2} dot={{ r: 3 }} />
    </LineChart></ResponsiveContainer></div>;
  }
  if (chart.type === 'pie' || chart.type === 'doughnut') {
    const entries = data.map((d, i) => ({ name: String(d[chart.nameKey || 'name']), value: Number(d[chart.valueKey || 'value']) }));
    return <div className="h-chart"><ResponsiveContainer width="100%" height={150}><PieChart>
      <Pie data={entries} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} innerRadius={chart.type === 'doughnut' ? 30 : 0} labelLine={false} label={({ name, value }) => `${name}: ${value}`}>
        {entries.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
      </Pie>
      <Tooltip />
    </PieChart></ResponsiveContainer></div>;
  }
  return null;
}

type Open = (module: string, tab?: string, section?: string, selection?: HomeSelection) => void;
export default function HomeWorkspace({ onOpen }: { onOpen: Open }) {
  const [data, setData] = useState<HomeData | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(false), [now, setNow] = useState(() => Date.now());
  async function load() {
    setLoading(true);
    try { setData(await requestJson<HomeData>('/api/home')); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Home could not be loaded.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const tick = setInterval(() => setNow(Date.now()), 60000);
    const refreshGreeting = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', refreshGreeting);
    return () => { clearTimeout(timer); clearInterval(tick); document.removeEventListener('visibilitychange', refreshGreeting); };
  }, []);
  const open = (target: HomeTarget) => onOpen(target.module, target.tab, target.section, target);
  if (!data) return <div className="f-workspace f-loading h-workspace"><h2>{error || 'Loading your Home…'}</h2>{error && <button onClick={() => void load()} className="f-button">Try again</button>}</div>;
  const saved = data.layout || [];
  const missing = (data.defaults || []).filter((d: WidgetPlacement) => !saved.find(s => s.id === d.id));
  const layout = saved.length ? [...saved, ...missing] : data.defaults;
  return <div className="f-workspace h-workspace">
    <header className="f-heading h-heading">
      <div>
        <h1>{greeting(data.viewer.name, now, data.timeZone)}</h1>
        {data.title && <span>{data.title}</span>}
      </div>
      <div className="f-actions">
        <button className="f-icon" aria-label="Refresh Home" disabled={loading} onClick={() => void load()}><RefreshCw size={19} /></button>
      </div>
    </header>
    {error && <p className="f-error h-message" role="alert">{error}</p>}
    <div className="h-grid">
      {layout.map(placement => {
        const widget = data.widgets.find(item => item.id === placement.id), content = data.content[placement.id];
        if (!widget || !content) return null;
        const Icon = icons[widget.id] || LayoutGrid;
        return <section key={widget.id} className="h-widget" data-widget={widget.id} aria-label={widget.title}>
          <header className="h-widget-heading">
            <span className="h-widget-icon"><Icon size={20} /></span>
            <h2>{widget.title}</h2>
            {widget.target && <button className="f-icon" aria-label={'Open ' + widget.title} onClick={() => open(widget.target!)}><ArrowRight size={18} /></button>}
          </header>
          <div className="h-widget-viewport">
            <div className="h-widget-content">
              <div className="h-widget-body">
                {content.status && <span className={'h-status' + (/review|overtime|Not submitted/.test(content.status) ? ' attention' : '')}>{content.status}</span>}
                {content.metric !== undefined && <strong className="h-metric">{content.metric}</strong>}
                {content.detail && <p className="h-detail">{content.detail}</p>}
                <div className={'h-items' + (widget.id === 'workspaces' ? ' h-workspaces' : '')}>
                  {content.items.map(item => item.target
                    ? <button className="h-item" key={item.id} onClick={() => open(item.target!)}>
                        <span><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</span>
                        {item.value && <strong>{item.value}</strong>}
                        <ArrowRight size={16} />
                      </button>
                    : <div className="h-item" key={item.id}>
                        <span><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</span>
                        {item.value && <strong>{item.value}</strong>}
                      </div>)}
                </div>
                {!content.items.length && content.empty && <p className="h-empty">{content.empty}</p>}
                {content.href && <a className="h-external" href={content.href} target="_blank" rel="noreferrer">{content.action}<ExternalLink size={15} /></a>}
                {content.chart && <HomeChart chart={content.chart} />}
              </div>
            </div>
          </div>
        </section>;
      })}
    </div>
    {canAccess(data.viewer,'Timeclock')&&<TeamHoursWidget viewer={data.viewer}/>}
    {!layout.length && <section className="h-empty-home"><LayoutGrid size={30} /><h2>Your Home is empty</h2><p>No widgets are available for your role right now.</p></section>}
  </div>;
}
