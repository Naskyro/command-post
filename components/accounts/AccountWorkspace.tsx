'use client';
import FilterBar from '@/components/shared/FilterBar';

import {recordedEnforcementHours} from '@/lib/accounts/profile-summary';
import {fieldVisible,numberStep,numberError} from '@/lib/accounts/field-rules';
import {refreshAfterSave,mergeSavedRows} from '@/lib/shared/save-feedback';
import { canAccess } from '@/lib/finance/access';
import { useState, useEffect, useCallback, useRef, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Plus, RefreshCw, ChevronRight, Mail, Upload, Download, Search, Building2, Users, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { requestJson, timedFetch } from '@/lib/shared/client';
import type { Viewer } from '@/lib/finance/model';
import { forms, areas, current, today, lastContact, signageDue, queue, money, waived, assessment, type Row, type Kind, type Field } from '@/lib/accounts/model';
import {AgreementSummary,PatrolDetails,RevenueReport,VehicleHistory} from './AccountInsights';
import {healthScore,managerRoles} from '@/lib/accounts/insights';
import {Inbox} from './Inbox';
import {WorkQueue} from './WorkQueue';
import {contactName,affiliationDates,isWaiting,isFinished,actionDate} from '@/lib/accounts/work';
import {TodayDashboard} from './TodayDashboard';
import {InlineUpload} from './RecordUploads';
import {WorkTypePicker} from './WorkTypePicker';
import StaffSelect from '@/components/shared/StaffSelect';
import {ParkingLayoutSummary} from './ParkingLayoutSummary';
import {PermitSummary} from './PermitSummary';
import {DispatchInbox} from './DispatchInbox';
import {isDispatchNote,isDispatchReply,noteArchived,noteRecipients} from '@/lib/accounts/dispatch-notes';
import {hasDetail,phoneLink} from '@/lib/accounts/display';
import AccountDirectory from './AccountDirectory';
import TrespassRegister from '@/components/safety/TrespassRegister';
import {PropertyOverview,PropertyContacts} from './PropertyOverview';
import {PropertyContactEditor} from './PropertyContactEditor';
import './property-overview.css';
import {ContactProfile} from './ContactProfile';
import {profilePhoto} from '@/lib/accounts/contact-details';
import {isPendingAccount} from '@/lib/accounts/onboarding';
import {PendingAccounts,PropertyOnboarding} from './PendingAccounts';
import {Toaster} from '@/components/ui/sonner';
import {toast} from 'sonner';
import './onboarding.css';
import './insights-dashboard.css';
import './accounts.css';
type Staff = {
    id: string;
    name: string;
    department: string;
    title: string;
};
export type Data = {
    records: Row[];
    viewer: Viewer;
    head: boolean;
    claimApproval: boolean;
    operationsEditor: boolean;
    staff: Staff[];
    editable: string[];
    releaseApprovals: string[];
    mileageSubmission: boolean;
    dispatchPermissions: {
        notes: boolean;
        signage: boolean;
    };
    capabilities: Record<string, {
        view: boolean;
        edit: boolean;
    }>;
};
type Edit = {
    record: Row;
    extra?: Record<string, unknown>;
    fields?: string[];
    title?: string;
    contact?: boolean;
};
const text = (v: unknown) => v === undefined || v === null ? '' : String(v);
const date = (d: unknown) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not recorded';
const payload = (r: Row) => Object.fromEntries(['id', 'kind', 'version', 'name', 'accountId', ...forms[r.kind].map(f => f.key)].filter(k => r[k] !== undefined).map(k => [k, r[k]]));
const link = (r: Row, label?: string) => <a className="am-file-link" href={r.sourceOnly?text(r.sourceUrl):'/api/accounts/files?id=' + encodeURIComponent(r.id)} target={r.sourceOnly?'_blank':undefined} rel={r.sourceOnly?'noreferrer':undefined}>{label || r.name}</a>;
function Badge({ children }: {
    children: ReactNode;
}) { return <span className={'am-badge ' + (/review|risk|Paused|Missing|due|notice|Repair/i.test(text(children)) ? 'am-attention' : '')}>{children}</span>; }
function Empty({ children }: {
    children: ReactNode;
}) { return <p className="am-empty">{children}</p>; }
function Pick({ value, onChange, options, label, disabled = false }: {
    value: string;
    onChange: (v: string) => void;
    options: {
        value: string;
        label: string;
    }[];
    label: string;
    disabled?: boolean;
}) { return <select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}><option value="">{label}</option>{value && !options.some(o => o.value === value) && <option value={value}>{value}</option>}{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>; }
const options = (values: string[]) => values.map(value => ({ value, label: value }));
function Section({ id, title, count, open, onToggle, children }: {
    id: string;
    title: string;
    count?: ReactNode;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
}) { return <section className="am-section"><button className="am-section-heading" aria-expanded={open} aria-controls={'section-' + id} onClick={onToggle}><span>{title}</span><span>{count}<ChevronRight className={open ? 'am-rotated' : ''}/></span></button>{open && <div className="am-section-body" id={'section-' + id}>{children}</div>}</section>; }
function Table({ rows, columns, empty = 'No records yet.' }: {
    rows: Row[];
    columns: {
        label: string;
        render: (r: Row) => ReactNode;
    }[];
    empty?: string;
}) { return rows.length ? <div className="am-table-wrap"><table><thead><tr>{columns.map((c, i) => <th key={i}>{c.label}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.id}>{columns.map((c, i) => <td key={i}>{c.render(r)}</td>)}</tr>)}</tbody></table></div> : <Empty>{empty}</Empty>; }
export default function AccountWorkspace({ surface = 'manager', initialAccount = '', initialTab = '', onOpen }: {
    surface?: 'manager' | 'dispatch' | 'sales' | 'claims' | 'orders';
    initialAccount?: string;
    initialTab?: string;
    onOpen?: (module: string, tab?: string, section?:string, selection?:{account?:string}) => void;
}) {
    const [data, setData] = useState<Data>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [tab, setTab] = useState(surface === 'orders' ? 'orders' : surface === 'claims' ? 'claims' : surface === 'sales' ? 'opportunities' : surface === 'dispatch' ? 'accounts' : 'today');
    const [selected, setSelected] = useState(initialAccount), [search, setSearch] = useState(''), [company, setCompany] = useState(''), [regional, setRegional] = useState(''), [owner, setOwner] = useState(''), [assignee, setAssignee] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(0), [workType, setWorkType] = useState(''), [workLimit, setWorkLimit] = useState(40);
    const [drilldown,setDrilldown]=useState<{ids:string[];label:string}>();
    const [propertyType,setPropertyType]=useState(''),[service,setService]=useState(''),[health,setHealth]=useState('');
    const [editor, setEditor] = useState<Edit>(), [profile, setProfile] = useState(''), [upload, setUpload] = useState<{
        account: Row;
        category?: string;
        inspectionId?: string;
    }>(), [sections, setSections] = useState(['relationships', 'service']), [audit, setAudit] = useState<{
        actor: string;
        at: string;
        action: string;
    }[]>(), [dispatchNote, setDispatchNote] = useState<{
        action: string;
        details: string;
    }>();
    const [contactEditor,setContactEditor]=useState<{account:Row;contactId:string}>();
    const load = useCallback(async () => { try {
        setData(await requestJson<Data>('/api/accounts?surface=' + surface));
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    } }, [surface]);
    useEffect(() => { void load();const refresh=()=>{if(document.visibilityState==='visible')void load();};const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('command-post-accounts'):undefined;if(channel)channel.onmessage=refresh;const timer=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);channel?.close();};}, [load]);
    useEffect(() => { if (initialAccount) {
        setSelected(initialAccount);
        setTab('accounts');
    }
    else if (initialTab)
        setTab(initialTab==='activity'?'handoffs':['safety','accounts','terminated','handoffs', 'pending', 'today', 'relationships', 'work', 'reports', 'team', 'opportunities', 'orders', 'inbox', 'vehicles', 'claims'].includes(initialTab) ? initialTab : 'accounts'); }, [initialAccount, initialTab]);
    useEffect(() => setPage(0), [search, company, regional, owner, assignee, status,propertyType,service,health]);
    const all = data?.records || [], staff = data?.staff || [], accounts = all.filter(r => r.kind === 'account'), get = (id: unknown) => all.find(r => r.id === id), name = (id: unknown) => get(id)?.name || staff.find(p => p.id === id)?.name || 'Unassigned';
    const revision=all.map(r=>r.id+':'+r.version).join('|');
    const account = accounts.find(a => a.id === selected || a.name === selected), related = all.filter(r => r.accountId === account?.id), person = get(profile);
    const can = (r: Row) => !!data?.editable.includes(r.id), cap = (key: string, edit = false) => !!data?.capabilities[key]?.[edit ? 'edit' : 'view'];
    async function act(body: Record<string, unknown>, message = 'Saved') { setBusy(true); setError(''); try {
        const result = await requestJson<{
            records: Row[];
        }>('/api/accounts', body);
        setData(d=>d?{...d,records:mergeSavedRows(d.records,result.records)}:d);
        refreshAfterSave(load,()=>setError('Saved successfully. Refresh to update the account list.'));if(typeof BroadcastChannel==='function'){const channel=new BroadcastChannel('command-post-accounts');channel.postMessage('updated');channel.close();}
        toast.success(message,{duration:3500});
        return result.records;
    }
    catch (e) {
        setError((e as Error).message);
        throw e;
    }
    finally {
        setBusy(false);
    } }
    function fresh(kind: Kind, extra: Partial<Row> = {}) { setProfile(''); setEditor({ record: { id: crypto.randomUUID(), kind, version: 0, name: '', accountId: account?.id, assignee: account?.assignee || data?.viewer.person, date: today(), effectiveDate: today(), status: kind === 'workOrder' ? 'Requested' : kind === 'task' ? 'Open' : kind === 'financial' ? 'Recorded' : kind === 'playbook' ? 'Current' : kind === 'email' ? 'Draft' : kind === 'courtesy' ? 'Draft' : kind==='claim'?'Investigating':'', type: kind === 'task' ? 'Follow-up' : kind === 'playbook' ? 'Onboarding' : kind === 'company' ? 'Management company' : '', channel: 'Onsite visit', condition: 'Good', dateConfirmed: kind === 'inspection', complete: kind === 'inspection', stage: 'Prospect', priority: 'Normal', service: 'Unconfirmed', ...extra, ...(kind==='workOrder'?{assignee:'',status:'Requested'}:{}) } }); }
    function edit(r: Row, fields?: string[], title?: string) { setProfile(''); setEditor({ record: r, fields, title }); }
    function newProperty() { setProfile(''); setEditor({record:{id:crypto.randomUUID(),kind:'account',version:0,name:'',address:'',propertyType:'',service:'',assignee:data?.viewer.person,companyId:'',ownerId:'',units:'',parkingSpaces:'',officeContact:'',phone:''},fields:['name','address','propertyType','service','assignee','companyId','ownerId','units','parkingSpaces','officeContact','phone'],title:'New Property'}); }
    function openAccount(id: string, section?: string) { if(surface==='orders'){ if(onOpen&&canAccess(data?.viewer,'Accounts','overview'))onOpen('Accounts','overview',undefined,{account:id});return; } const target=get(id); setSelected(id); setTab(target&&isPendingAccount(target)&&surface==='manager'?'pending':target?.status==='Terminated'&&surface==='manager'?'terminated':'accounts'); setProfile(''); setSections(section ? [section] : ['relationships', 'service']); }
    async function history(id: string) { try {
        setAudit((await requestJson<{
            history: {
                actor: string;
                at: string;
                action: string;
            }[];
        }>('/api/accounts?history=' + encodeURIComponent(id))).history);
    }
    catch (e) {
        setError((e as Error).message);
    } }
    const add = (kind: Kind, label: string, extra: Partial<Row> = {}) => <Button variant="outline" size="sm" disabled={busy} onClick={() => fresh(kind, extra)}><Plus />{label}</Button>;
    const work = queue(all).filter(r => (!assignee || r.assignee === assignee) && (!workType || r.type === workType));
    const workTable = (rows: Row[]) => <Table rows={rows} columns={[{ label: 'Action', render: r => <button className="am-text-button" onClick={() => r.derived ? openAccount(text(r.accountId), r.type === 'Release review' ? 'courtesy' : r.type === 'Signage report' ? 'signage' : 'activity') : edit(r)}>{r.name}</button> }, { label: 'Account', render: r => <button className="am-text-button" onClick={() => openAccount(text(r.accountId))}>{name(r.accountId)}</button> }, { label: 'Assigned to', render: r => name(r.assignee) }, { label: 'Due / reminder', render: r => date(actionDate(r)) }, { label: 'Status', render: r => <Badge>{isWaiting(r)?'Waiting on '+r.waitingOn:r.status}</Badge> }]}/>;
    const fileTable = (rows: Row[]) => <Table rows={rows} columns={[{ label: 'File', render: r => link(r) }, { label: 'Category', render: r => r.category }, { label: 'Language', render: r => r.language }, { label: 'Version', render: r => <Badge>{r.status}</Badge> }, { label: '', render: r => <div className="am-actions">{can(r) && <Button size="sm" variant="outline" onClick={() => edit(r)}>Edit</Button>}{account && cap('email', true) && can(account) && r.category !== 'Internal policy' && !r.sourceOnly && <Button size="sm" variant="outline" onClick={() => fresh('email', { to: text(get(account.primaryContactId)?.email), attachmentIds: [r.id] })}><Mail />Attach to email</Button>}</div> }]}/>;
    const section = (id: string, title: string, count: ReactNode, children: ReactNode) => <Section id={id} title={title} count={count} open={sections.includes(id)} onToggle={() => setSections(s => s.includes(id) ? s.filter(v => v !== id) : [...s, id])}>{children}</Section>;
    const filtered = accounts.filter(a => !isPendingAccount(a) && (!drilldown||drilldown.ids.includes(a.id)) && (!search || [a.name, a.address, ...(a.sourceNames as string[]||[]), name(a.companyId)].join(' ').toLowerCase().includes(search.toLowerCase())) && (!propertyType||a.propertyType===propertyType)&&(!service||a.service===service)&&(!health||healthScore(a).status===health)&&(!company || a.companyId === company) && (!owner || a.ownerId === owner) && (!assignee || a.assignee === assignee) && (!status || a.status === status) && (!regional || all.some(f => f.kind === 'affiliation' && f.accountId === a.id && f.contactId === regional && f.role === 'Regional Manager' && current(f)))).sort((a, b) => a.name.localeCompare(b.name));
    const companyOptions = all.filter(r => r.kind === 'company').map(r => ({ value: r.id, label: r.name })), staffOptions = staff.map(p => ({ value: p.id, label: p.name }));
    if (!data)
        return <div className="am-workspace">{error ? <p className="am-error">{error}<Button onClick={() => void load()}>Retry</Button></p> : <p role="status">Loading accounts…</p>}</div>;
    return <div className="am-workspace"><header className="am-page-header"><div><span className="am-eyebrow">COMMAND POST</span><h1>{surface === 'orders' ? 'Work Orders' : surface === 'dispatch' ? 'Accounts' : surface === 'sales' ? 'Sales CRM' : 'Account Management'}</h1></div><div className="am-actions"><span>{data.viewer.name}</span>{surface==='manager'&&cap('accounts',true)&&<Button onClick={newProperty}><Plus/>New Property</Button>}<Button size="icon" variant="outline" aria-label="Refresh accounts" onClick={() => void load()}><RefreshCw /></Button></div></header>{error && <p className="am-error" role="alert">{error}</p>}<Toaster position="bottom-right" closeButton richColors/>
 {surface === 'manager' && (() => {
    const tabs = [['today', 'Today', 'work'], ['accounts', 'Accounts', 'accounts'], ['terminated', 'Terminated', 'accounts'], ['pending', 'Pending', 'accounts'], ['work', 'Work Queue', 'work'], ['relationships', 'Relationships', 'relationships'], ['reports', 'Reports', 'performance'], ['handoffs', 'Dispatch', 'activity'], ['inbox', 'Email', 'email'], ['vehicles', 'Vehicles', 'courtesy'], ['claims', 'Damage Claims', 'claims'], ['safety', 'Trespass & Safety', 'safety'], ['team', 'Settings', 'team']];
    const allowed = tabs.filter(([key, , area]) => cap(area) && (key !== 'team' || data.head));
    return <nav className="am-tabs" aria-label="Account Management">{allowed.map(([key, label]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setSelected(''); setSearch(''); setStatus(''); setDrilldown(undefined); }}>{label}</button>)}</nav>;
  })()}
 {tab==='pending'&&!account&&<PendingAccounts accounts={accounts.filter(isPendingAccount)} all={all} onOpen={openAccount} onNew={cap('accounts',true)?newProperty:undefined} onAction={act}/>}
 {tab==='pending'&&account&&<><Button variant="ghost" className="am-back" onClick={()=>setSelected('')}><ArrowLeft/>Pending Accounts</Button><PropertyOnboarding key={account.id} account={account} all={all} editable={can(account)} canFiles={cap('files',true)} canRelationships={cap('relationships',true)} canWork={cap('work',true)} canActivate={cap('decisions',true)} busy={busy} onEdit={edit} onRefresh={load} onViewProfile={()=>setTab('accounts')} onAction={async(body,message)=>{const result=await act(body,message);if(body.action==='activateOnboarding'){setSelected(account.id);setTab('accounts');setSections(['relationships','service']);}return result;}}/></>}
 {tab === 'today' && <TodayDashboard onHandoffs={cap('activity')?()=>setTab('handoffs'):undefined} handoffCount={all.filter(r=>isDispatchNote(r)&&!noteArchived(r)&&!r.acknowledgedAt&&(data.head||noteRecipients(get(r.accountId)||({kind:'account'} as Row)).includes(data.viewer.person))).length} all={all} staff={staff} viewer={data.viewer.person} head={data.head} canRevenue={cap('performance')} revision={revision} onAccount={openAccount} onAccounts={(ids,label)=>{setDrilldown({ids,label});setSelected('');setSearch('');setCompany('');setRegional('');setOwner('');setAssignee('');setStatus('');setPropertyType('');setService('');setHealth('');setPage(0);setTab('accounts');}} onAction={r=>r.derived?openAccount(text(r.accountId),r.type==='Signage report'?'signage':r.type==='Release review'?'courtesy':'activity'):edit(r)} onWork={()=>{setTab('work');setAssignee('');}} onClaims={()=>setTab('claims')}/>}
 {tab==='accounts'&&!account&&drilldown&&<div className="am-drilldown"><b>{drilldown.label}</b><span>{drilldown.ids.length} accounts</span><button className="am-text-button" onClick={()=>setDrilldown(undefined)}>Clear filter</button></div>}
 {tab==='safety'&&<TrespassRegister/>}
   {tab === 'accounts' && !account && <AccountDirectory all={all} staff={staff} viewer={data.viewer} ids={drilldown?.ids} onOpen={openAccount} onCompany={setProfile}/>}
   {tab === 'terminated' && !account && <><div className="am-drilldown"><b>Terminated Accounts</b><span>Historical properties retained for reference</span></div><AccountDirectory all={all} staff={staff} viewer={data.viewer} statusOnly="Terminated" onOpen={openAccount} onCompany={setProfile}/></>}
 {(tab === 'accounts'||tab === 'terminated') && account && <><Button variant="ghost" className="am-back" onClick={() => {setSelected('');if(isPendingAccount(account))setTab('pending');else if(account.status==='Terminated')setTab('terminated');}}><ArrowLeft />{isPendingAccount(account)?'Pending Accounts':account.status==='Terminated'?'Terminated Accounts':'Accounts'}</Button>{isPendingAccount(account)&&surface==='manager'&&<Button variant="outline" onClick={()=>setTab('pending')}>Continue onboarding</Button>}<header className="am-account-header"><div className="am-property-photo">{profilePhoto(all,account)?<img src={profilePhoto(all,account)} alt={account.name+' property exterior'}/>:<Building2 />}{can(account)&&<InlineUpload accountId={account.id} category="Account photo" label="Change photo" onUploaded={load}/>}{account.photoSource&&profilePhoto(all,account)===account.photo&&<a className="am-photo-source" href={text(account.photoSource)} target="_blank" rel="noreferrer">Photo source</a>}</div><div className="am-header-info"><div className="am-profile-heading"><div className="am-actions"><h2>{account.name}</h2><Badge>{account.status}</Badge><Badge>{account.service}</Badge></div><div className="am-actions">{can(account) && <Button variant="outline" onClick={() => edit(account)}>Edit account</Button>}{can(account) && account.status === 'Terminated' && <Button variant="outline" onClick={() => void act({action:'reOnboard', accountId: account.id, accountVersion: account.version}, 'Property returned to onboarding').then(() => setTab('pending'))}>Onboard company</Button>}{can(account) && cap('decisions', true) && add('decision', 'Record decision')}{surface === 'dispatch' && data.dispatchPermissions.notes && <Button variant="outline" onClick={() => setDispatchNote({ action: 'dispatcherNote', details: '' })}>Add note</Button>}{surface === 'dispatch' && data.dispatchPermissions.signage && <Button variant="outline" onClick={() => setDispatchNote({ action: 'signageReport', details: '' })}>Report signage issue</Button>}</div></div><p>{account.address || account.propertyType}{phoneLink(account.phone)&&<> · <a href={phoneLink(account.phone)}>{account.phone}</a></>}</p><div className="am-actions">{hasDetail(account.assignee)&&<span>Account Manager: {name(account.assignee)}</span>}{account.companyId && <button className="am-text-button" onClick={() => setProfile(text(account.companyId))}>{name(account.companyId)}</button>}</div></div><div className="am-hero-details"><PropertyOverview account={account} all={all} revision={revision} canRevenue={surface!=='dispatch'&&cap('performance')} onEdit={can(account)?edit:undefined}/><PropertyContacts account={account} all={all} managersOnly onOpen={setProfile} onEdit={can(account)&&cap('relationships',true)?id=>setContactEditor({account,contactId:id}):undefined} onAdd={can(account)&&cap('relationships',true)?()=>setContactEditor({account,contactId:''}):undefined}/></div><AgreementSummary account={account}/>{related.some(r=>r.kind==='file'&&r.category==='Agreement')&&<div className="am-actions am-wide">{related.filter(r=>r.kind==='file'&&r.category==='Agreement'&&r.status!=='Archived').map(r=><span key={r.id}>{link(r,'View agreement')}</span>)}{!account.agreementVerified&&<small>Agreement terms need review</small>}</div>}</header>
 <div className="am-profile-grid"><div className="am-profile-main">
 {surface !== 'dispatch' && cap('activity') && <section className="am-panel am-priority-activity" id="section-activity"><header><h3>Activity & follow-ups</h3><small>Last contact: {date(lastContact(all,account.id))}</small></header><div className="am-section-body"> <><div className="am-actions">{can(account) && cap('activity', true) && add('activity', 'Log contact')}{can(account) && cap('work', true) && add('task', 'New task')}{can(account)&&cap('workOrders',true)&&add('workOrder','Request Operations')}<Button variant="outline" size="sm" onClick={() => void history(account.id)}><History />Change history</Button></div>{related.some(r=>['task','workOrder'].includes(r.kind)&&!['Completed','Cancelled'].includes(text(r.status)))&&workTable(related.filter(r => ['task','workOrder'].includes(r.kind) && !['Completed', 'Cancelled'].includes(text(r.status))))}<div className="am-timeline">{related.filter(r => r.kind === 'activity'&&!isDispatchNote(r)&&!isDispatchReply(r)).sort((a, b) => text(b.date).localeCompare(text(a.date))).map(r => <article key={r.id}><div><b>{r.name}</b><small>{date(r.date)} · {r.channel} · {name(r.assignee)}{r.response&&<> · {r.response==='No response'?'No response received':r.response==='Attempted'?'Outreach attempted':r.response}</>}</small></div><p>{r.details}</p>{r.outcome && <p>{r.outcome}</p>}{r.miles && <small>{r.miles} business miles{r.reimbursementId ? ' · Submitted to Finance' : ''}</small>}<div className="am-actions">{can(r) && <Button size="sm" variant="outline" onClick={() => edit(r)}>Edit</Button>}{can(r) && data.mileageSubmission && r.assignee === data.viewer.person && Number(r.miles) > 0 && !r.reimbursementId && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: 'submitMileage', id: r.id, version: r.version }, 'Mileage submitted to Finance').catch(() => undefined)}>Submit mileage</Button>}</div></article>)}</div></></div></section>}
 {section('relationships', 'People & companies', related.filter(r => r.kind === 'affiliation' && current(r)).length, <><div className="am-actions">{can(account) && cap('relationships', true) && <><Button size="sm" variant="outline" onClick={()=>setContactEditor({account,contactId:''})}><Plus/>Add manager / contact</Button>{add('affiliation', 'Link contact')}</>}</div><PropertyContacts account={account} all={all} onOpen={setProfile} onEdit={can(account)&&cap('relationships',true)?id=>setContactEditor({account,contactId:id}):undefined}/><div className="am-facts">{account.companyId&&<div><span>Management company</span><button className="am-text-button" onClick={() => setProfile(text(account.companyId))} disabled={!account.companyId}>{name(account.companyId)}</button></div>}{account.propertyType!=='Commercial'&&account.ownerId&&<div><span>Apartment owner</span><button className="am-text-button" onClick={() => setProfile(text(account.ownerId))} disabled={!account.ownerId}>{account.ownerId ? name(account.ownerId) : 'Not recorded'}</button></div>}{hasDetail(account.officeContact)&&<div><span>Office contact</span>{account.officeContact}</div>}{hasDetail(account.contactPreference)&&<div><span>Contact preferences</span>{account.contactPreference}</div>}</div>{account.companyId && <details><summary>Sister properties ({accounts.filter(a => a.companyId === account.companyId && a.id !== account.id).length})</summary><div className="am-link-list">{accounts.filter(a => a.companyId === account.companyId && a.id !== account.id).map(a => <button key={a.id} onClick={() => openAccount(a.id)}>{a.name}<ChevronRight /></button>)}</div></details>}<details><summary>Former contacts</summary>{related.filter(r => r.kind === 'affiliation' && r.endDate).map(r => <p key={r.id}><button className="am-text-button" onClick={() => setProfile(text(r.contactId))}>{name(r.contactId)}</button> · {r.role} · {affiliationDates(r)}</p>)}</details></>)}
 {section('service', 'Dispatch instructions & access', null, <><ParkingLayoutSummary account={account} onEdit={can(account)?edit:undefined}/><PermitSummary account={account} onEdit={can(account)?edit:undefined}/><PatrolDetails account={account} rules={related.filter(r=>r.kind==='patrol')} onEdit={edit} onAdd={()=>fresh('patrol',{startDate:today(),scope:'Property / KDM',name:'Towing hours'})} editable={can(account)&&cap('setup',true)}/><div className="am-facts">{[['jurisdiction', 'Jurisdiction'], ['spaceCallAuthority', 'Space-call authority'], ['gateCode', 'Gate code'], ['launchDate', 'Launch date']].filter(([key])=>!!account[key]&&account[key]!=='N/A').map(([key, label]) => <div key={key} className={key === 'instructions' ? 'am-wide' : ''}><span>{label}</span><p>{account[key] || 'Not recorded'}</p></div>)}</div>{surface !== 'dispatch' && cap('setup') && <><div className="am-actions">{can(account) && cap('setup', true) && add('equipment', 'Add access item')}</div>{related.some(r=>r.kind==='equipment')&&<Table rows={related.filter(r => r.kind === 'equipment')} columns={[{ label: 'Item', render: r => r.name }, { label: 'Identifier', render: r => r.serial }, { label: 'Custodian', render: r => r.custodian }, { label: 'Last tested', render: r => date(r.testedDate) }, { label: 'Status', render: r => can(r) ? <Pick label="Status" value={text(r.status)} onChange={status => void act({ record: payload({ ...r, status }) }).catch(() => undefined)} options={options(['Provided', 'Tested', 'Not working', 'Returned', 'Lost'])}/> : r.status }, { label: '', render: r => can(r) && <Button size="sm" variant="outline" onClick={() => edit(r)}>Edit</Button> }]}/>}</>}</>)}
 {cap('courtesy') && section('courtesy', 'Courtesy & reduced releases', related.filter(r => r.kind === 'courtesy').length, <><div className="am-actions">{cap('courtesy', true) && add('courtesy', 'Record release')}<Button size="sm" variant="outline" onClick={()=>{setSelected('');setTab('vehicles')}}>Search vehicle history</Button>{cap('courtesy', true) && <Button variant="outline" size="sm" onClick={() => setUpload({ account, category: 'Release request' })}><Upload />Attach request</Button>}{cap('courtesy', true) && <Button variant="outline" size="sm" onClick={() => setUpload({ account, category: 'Release approval' })}>Attach approval</Button>}{all.filter(r => r.kind === 'file' && r.category === 'Internal policy').map(r => <span key={r.id}>{link(r)}</span>)}</div><CourtesyList rows={related.filter(r => r.kind === 'courtesy')} all={all} onOpen={edit}/>{fileTable(related.filter(r => r.kind === 'file' && ['Release request', 'Release approval'].includes(text(r.category))))}</>)}
 {surface === 'dispatch' && section('notes', 'Dispatch notes', related.filter(r => r.kind === 'activity').length, <div className="am-timeline">{related.filter(r => r.kind === 'activity').map(r => <article key={r.id}><small>{date(r.date)} · {r.updatedBy}</small><p>{r.details}</p></article>)}</div>)}
 {section('signage', 'Signage inspections', signageDue(all, account.id) ? 'Next check ' + date(signageDue(all, account.id)) : 'Check date needed', <><div className="am-actions">{can(account) && cap('signage', true) && add('inspection', 'Record inspection')}{can(account) && cap('files', true) && <Button variant="outline" size="sm" onClick={() => setUpload({ account, category: 'Signage' })}><Upload />Upload photos</Button>}</div><Signage rows={related} editable={can} onEdit={edit} onUpload={id => setUpload({ account, category: 'Signage', inspectionId: id })}/></>)}
 {section('files', 'Files & letters', related.filter(r => r.kind === 'file' && !['Signage', 'Internal policy', 'Release request', 'Release approval'].includes(text(r.category)) && r.status !== 'Archived').length, <><div className="am-actions">{can(account) && cap('files', true) && <><Button variant="outline" size="sm" onClick={() => setUpload({ account })}><Upload />Upload file</Button><Button variant="outline" size="sm" onClick={() => void saveTimeline(account, related).then(load).then(() => toast.success('Onboarding PDF saved to account files',{duration:3500})).catch(e => setError(e.message))}><Download />Save onboarding PDF</Button></>}</div>{fileTable(related.filter(r => r.kind === 'file' && !['Signage', 'Internal policy', 'Release request', 'Release approval'].includes(text(r.category)) && r.status !== 'Archived'))}<details><summary>Previous versions</summary>{fileTable(related.filter(r => r.kind === 'file' && r.status === 'Archived'))}</details></>)}
 {surface !== 'dispatch' && cap('email') && section('email', 'Email conversations', related.filter(r => r.kind === 'email').length, <EmailPanel account={account} records={related} editable={can(account) && cap('email', true)} viewer={data.viewer} onNew={() => fresh('email', { to: text(get(account.primaryContactId)?.email) })} onEdit={edit} onChange={load}/>)}
 {surface !== 'dispatch' && cap('performance') && section('performance', 'Property results', null, <><RevenueReport accountId={account.id} revision={revision}/><Performance rows={related} editable={can(account) && cap('performance', true)} onAdd={() => fresh('financial')} onEdit={edit}/></>)}
 {surface !== 'dispatch' && cap('work') && section('onboarding', 'Onboarding & launch history', related.filter(r => r.kind === 'task' && ['Onboarding', 'Post-launch check'].includes(text(r.type))).length, <><div className="am-actions">{can(account) && cap('work', true) && <>{add('task', 'Add milestone', { type: 'Post-launch check' })}</>}</div>{workTable(related.filter(r => r.kind === 'task' && ['Onboarding', 'Post-launch check'].includes(text(r.type))))}</>)}
 {surface!=='dispatch'&&cap('work')&&related.some(r=>r.kind==='task'&&r.type==='Pause recovery')&&section('paused-followup','Paused account follow-up',null,<><p>Actions to resolve the concerns that paused service at this property.</p>{workTable(related.filter(r=>r.kind==='task'&&r.type==='Pause recovery'))}</>)}
 </div><aside><section className="am-panel"><header><h3>Next actions</h3></header><div className="am-aside-body">{queue(all).filter(r => r.accountId === account.id && r.derived).slice(0, 3).map(r => <button className="am-next" key={r.id} onClick={() => r.derived ? setSections([r.type === 'Release review' ? 'courtesy' : r.type === 'Signage report' ? 'signage' : 'activity']) : edit(r)}><b>{r.name}</b><small>{date(r.dueDate)} · {name(r.assignee)}</small><ChevronRight /></button>)}</div></section><section className="am-panel"><header><h3>Operating decisions</h3></header><div className="am-aside-body">{related.filter(r => r.kind === 'decision').slice(-5).reverse().map(r => <article key={r.id}><b>{r.type}</b><p>{r.reason}</p><small>{r.updatedBy} · {date(r.effectiveDate)}</small>{r.acknowledgedBy ? <small>Acknowledged: {r.acknowledgedBy}</small> : <Button size="sm" variant="outline" onClick={() => void act({ action: 'acknowledge', id: r.id }).catch(() => undefined)}>Acknowledge</Button>}</article>)}{!related.some(r => r.kind === 'decision') && <Empty>No decisions recorded.</Empty>}</div></section></aside></div></>}
 {(surface==='dispatch'||surface==='claims')&&<div className="am-actions"><Button variant="outline" onClick={()=>setTab(surface==='claims'?'claims':'accounts')}>{surface==='claims'?'Damage Claims':'Accounts'}</Button><Button variant="outline" onClick={()=>{setSelected('');setTab('vehicles')}}>Vehicle History</Button></div>}
 {tab==='vehicles'&&<VehicleHistory revision={revision} onOpen={edit} onEdit={edit}/>}
 {tab==='handoffs'&&cap('activity')&&<DispatchInbox all={all} viewer={data.viewer.person} head={data.head} canWrite={cap('activity',true)} canManage={r=>!!get(r.accountId)&&can(get(r.accountId)!)&&cap('activity',true)} onAction={act} onAccount={openAccount}/>}
 {tab==='inbox'&&cap('email')&&<Inbox records={all} editable={data.editable} onDraft={r=>fresh('email',r)} onEdit={edit} onChange={load}/>}
 {(tab==='claims'||tab==='accounts'&&account&&cap('claims'))&&<section className="am-panel"><header><h2>Damage Claims</h2><div className="am-actions">{cap('claims',true)&&surface!=='claims'&&add('claim','New damage claim',{accountId:account?.id})}{account&&can(account)&&cap('files',true)&&<Button variant="outline" onClick={()=>setUpload({account,category:'Claim evidence'})}>Upload claim evidence</Button>}</div></header><Table rows={all.filter(r=>r.kind==='claim'&&(!account||r.accountId===account.id))} columns={[{label:'Claim / vehicle',render:r=><button className="am-text-button" onClick={()=>edit(r)}>{r.name}<small>{r.vin||r.plate}</small></button>},{label:'Account',render:r=>name(r.accountId)},{label:'Investigator',render:r=>name(r.assignee)},{label:'Status',render:r=><Badge>{r.status}</Badge>},{label:'Settlement',render:r=>money(r.status==='Paid'?r.paidAmount:r.approvedAmount??r.proposedSettlement)},{label:'',render:r=><Button variant="outline" size="sm" onClick={()=>edit(r)}>Open</Button>}]}/></section>}
 {(tab === 'work'||tab==='orders') && <WorkQueue rows={tab==='orders'?all.filter(r=>r.kind==='workOrder'):[...queue(all),...all.filter(r=>['task','workOrder'].includes(r.kind)&&isFinished(r))]} all={all} staff={staff} viewerId={data.viewer.person} editable={can} orders={tab==='orders'} onOpen={r=>r.derived?openAccount(text(r.accountId),r.type==='Release review'?'courtesy':r.type==='Signage report'?'signage':'activity'):edit(r)} onAccount={surface==='orders'&&!canAccess(data.viewer,'Accounts','overview')?undefined:id=>openAccount(id)} onNew={cap(tab==='orders'?'workOrders':'work',true)?()=>fresh(tab==='orders'?'workOrder':'task',{accountId:undefined}):undefined} onRequest={tab!=='orders'&&cap('workOrders',true)?()=>fresh('workOrder',{accountId:undefined}):undefined}/>}
 {tab === 'relationships' && <><div className="am-filters"><label>Search people & companies<input value={search} onChange={e => setSearch(e.target.value)}/></label>{cap('relationships', true) && <>{add('contact', 'New contact', { accountId: undefined })}{add('company', 'New company', { accountId: undefined })}</>}</div><section className="am-panel"><Table rows={all.filter(r => ['contact', 'company'].includes(r.kind) && [r.name, r.email, r.phone, r.title].join(' ').toLowerCase().includes(search.toLowerCase()))} columns={[{ label: 'Name', render: r => <button className="am-property" onClick={() => setProfile(r.id)}><Users /><span><b>{r.name}</b><small>{r.kind==='company'?r.type:all.filter(f=>f.kind==='affiliation'&&f.contactId===r.id&&current(f)).map(f=>f.role+' · '+name(f.accountId||f.companyId)).join('; ')||r.title}</small></span></button> }, { label: 'Email / phone', render: r => <>{r.email}<small>{r.phone}</small></> }, { label: 'Current properties', render: r => r.kind === 'company' ? accounts.filter(a => a.companyId === r.id || a.ownerId === r.id).length : all.filter(f => f.kind === 'affiliation' && f.contactId === r.id && current(f)).length }, { label: '', render: r => <Button size="sm" variant="outline" onClick={() => setProfile(r.id)}>Open<ChevronRight /></Button> }]}/></section></>}
 {tab === 'reports' && <section className="am-panel"><header><h2>Property results</h2></header><RevenueReport onOpen={id=>openAccount(id,'performance')} revision={revision}/><Performance rows={all} editable={false} onAdd={() => undefined} onEdit={edit}/><Table rows={accounts.filter(a => all.some(r => r.accountId === a.id && ['financial', 'courtesy'].includes(r.kind)))} columns={[{ label: 'Property', render: r => <button className="am-text-button" onClick={() => openAccount(r.id, 'performance')}>{r.name}</button> }, { label: 'Management company', render: r => name(r.companyId) }, { label: 'Releases', render: r => all.filter(x => x.kind === 'courtesy' && x.accountId === r.id && ['Released', 'Imported'].includes(text(x.status))).length }, { label: 'Known waived amount', render: r => money(all.filter(x => x.kind === 'courtesy' && x.accountId === r.id && ['Released', 'Imported'].includes(text(x.status))).reduce((s, x) => s + Number(x.amountWaived || 0), 0)) }]}/></section>}
 {tab === 'team' && data.head && <><div className="am-settings-intro"><h2>Account Management settings</h2><p>Manage the default launch checklist for new properties and match imported signage photos.</p></div><section className="am-panel"><header><h2>Onboarding checklist templates</h2>{cap('team', true) && add('playbook', 'Add step', { accountId: undefined })}</header><Table rows={all.filter(r => r.kind === 'playbook')} columns={[{ label: 'Step', render: r => <button className="am-text-button" onClick={() => edit(r)}>{r.name}</button> }, { label: 'Plan', render: r => r.type }, { label: 'Status', render: r => <Badge>{r.status}</Badge> }, { label: 'Review date', render: r => date(r.reviewDate) }]}/></section><section className="am-panel"><header><h2>Unmatched signage folders</h2></header><Table rows={all.filter(r => r.kind === 'file' && r.category === 'Signage' && !r.accountId)} columns={[{ label: 'Source folder', render: r => r.sourceFolder }, { label: 'Photo', render: r => link(r) }, { label: '', render: r => <Button size="sm" variant="outline" onClick={() => edit(r)}>Match account</Button> }]} empty="All photos are matched."/></section></>}
 {tab === 'opportunities' && <section className="am-panel"><header><h2>Sales opportunities</h2>{cap('opportunities', true) && add('opportunity', 'New opportunity', { accountId: undefined })}</header><Table rows={all.filter(r => r.kind === 'opportunity')} columns={[{ label: 'Opportunity', render: r => <button className="am-text-button" onClick={() => edit(r)}>{r.name}</button> }, { label: 'Contact', render: r => <button className="am-text-button" onClick={() => setProfile(text(r.contactId))}>{name(r.contactId)}</button> }, { label: 'Stage', render: r => can(r) ? <Pick label="Stage" value={text(r.stage)} options={options(['Prospect', 'Qualified', 'Meeting', 'Proposal', 'Contract review', 'Won', 'Lost'])} onChange={stage => void act({ record: payload({ ...r, stage }) }).catch(() => undefined)}/> : r.stage }, { label: 'Next action', render: r => r.nextAction }, { label: 'Due / reminder', render: r => date(actionDate(r)) }]}/></section>}
 {editor && <RecordEditor onRefresh={load} key={editor.record.id} edit={editor} data={data} editable={editor.record.kind==='vehicle'?!!editor.record.canEdit:can(editor.record) || !all.some(r => r.id === editor.record.id) && cap(areas[editor.record.kind], true)} onClose={() => setEditor(undefined)} onParticipant={async (n) => { await act({ action: 'participant', name: n }); }} onSave={async (r, action) => { if(r.kind==='vehicle'){await requestJson('/api/accounts/history',{record:payload(r)});toast.success('Vehicle details saved',{duration:3500});setEditor(undefined);refreshAfterSave(load,()=>setError('Vehicle saved. Refresh to update history.'));return;} const saved=await act({ action, record: payload(r), accountVersion: get(r.accountId)?.version, ...editor.extra },r.kind==='account'&&!all.some(x=>x.id===r.id)?'Property saved to Pending Accounts':'Saved'); setEditor(undefined);if(r.kind==='account'&&!all.some(x=>x.id===r.id)){const account=saved.find((a:Row)=>a.id===r.id);if(account)setContactEditor({account,contactId:''});} }}/>}
 {upload && <UploadDialog {...upload} onClose={() => setUpload(undefined)} onChange={load}/>}
 {contactEditor&&<PropertyContactEditor account={contactEditor.account} all={all} contactId={contactEditor.contactId} onClose={()=>setContactEditor(undefined)} onSave={async body=>{await act(body,'Property contact saved');setContactEditor(undefined);if(isPendingAccount(contactEditor.account)){setSelected(contactEditor.account.id);setTab('pending');}}}/>}
 <Dialog open={!!person} onOpenChange={o => !o && setProfile('')}><DialogContent className="am-dialog am-profile-dialog"><DialogHeader><DialogTitle>{person?.name}</DialogTitle><DialogDescription className="sr-only">Relationship profile</DialogDescription></DialogHeader>{person && <><div className="am-actions">{person.kind==='company'?<Badge>{person.type}</Badge>:all.filter(f=>f.kind==='affiliation'&&f.contactId===person.id&&current(f)).map(f=><Badge key={f.id}>{f.role} · {name(f.accountId||f.companyId)}</Badge>)}{can(person) && <Button variant="outline" size="sm" onClick={() => edit(person)}>Edit contact / company</Button>}{cap('opportunities', true) && add('opportunity', 'Create sales opportunity', { accountId: undefined, contactId: person.kind === 'contact' ? person.id : undefined, companyId: person.kind === 'company' ? person.id : undefined })}{cap('relationships', true) && add('affiliation', 'Add affiliation', { accountId: undefined, contactId: person.kind === 'contact' ? person.id : undefined, companyId: person.kind === 'company' ? person.id : undefined })}</div>{person.kind==='contact'?<ContactProfile person={person} all={all} editable={can(person)} onRefresh={load}/>:<div className="am-facts">{['email','phone','address','preferences','trackRecord'].filter(k=>person[k]).map(k=><div key={k}><span>{({email:'Email',phone:'Phone',address:'Address',preferences:'Working preferences',trackRecord:'Track record'} as Record<string,string>)[k]}</span><p>{person[k]}</p></div>)}</div>}<h3>Property & company history</h3><Table rows={all.filter(r => r.kind === 'affiliation' && (r.contactId === person.id || r.companyId === person.id))} columns={[{ label: 'Affiliation', render: r => <button className="am-text-button" onClick={() => r.accountId ? openAccount(text(r.accountId)) : setProfile(text(r.companyId))}>{name(r.accountId || r.companyId)}</button> }, { label: 'Role', render: r => r.role }, { label: 'Tenure', render: r => affiliationDates(r) }, {label:'Work contact at this affiliation',render:r=><>{r.workPhone&&<span>{r.workPhone}</span>}{r.workEmail&&<small>{r.workEmail}</small>}{!r.workPhone&&!r.workEmail&&'—'}</>}, { label: '', render: r => can(r) && <Button size="sm" variant="outline" onClick={() => edit(r)}>Edit</Button> }]}/>{person.kind === 'contact' && can(person) && <Button variant="outline" onClick={() => { const previous = all.find(r => r.kind === 'affiliation' && r.contactId === person.id && current(r)); setProfile(''); setEditor({ record: { id: crypto.randomUUID(), kind: 'affiliation', version: 0, name: '', contactId: person.id, role: previous?.role || '', startDate: today() }, extra: previous ? { endAffiliationId: previous.id, endAffiliationVersion: previous.version } : undefined }); }}>Change property / company</Button>}{person.kind === 'company' && <div className="am-link-list">{accounts.filter(a => a.companyId === person.id || a.ownerId === person.id).map(a => <button key={a.id} onClick={() => openAccount(a.id)}>{a.name}<ChevronRight /></button>)}</div>}{person.kind==='contact'&&cap('claims')&&<details><summary>Damage Claims during tenure</summary><Table rows={all.filter(r=>r.kind==='claim'&&all.some(f=>f.kind==='affiliation'&&f.accountId===r.accountId&&f.contactId===person.id&&f.startDate&&managerRoles.includes(String(f.role))&&current(f,String(r.incidentDate||r.date))))} columns={[{label:'Claim',render:r=><button className="am-text-button" onClick={()=>edit(r)}>{r.name}</button>},{label:'Account',render:r=>name(r.accountId)},{label:'Status',render:r=>r.status}]}/></details>}{person.kind==='contact'&&cap('performance')&&<RevenueReport contactId={person.id} revision={revision}/>} {person.kind==='contact'&&cap('email')&&<details><summary>Linked account conversations</summary>{all.filter(r=>r.kind==='email'&&r.contactId===person.id&&r.status!=='Draft').map(r=><article key={r.id}><b>{r.subject}</b><small>{r.date} · {r.from}</small><p>{r.body}</p></article>)}</details>}{person.kind === 'contact' && cap('courtesy') && <details><summary>Courtesy releases during this manager’s tenure</summary><CourtesyList rows={all.filter(r => r.kind === 'courtesy' && r.managerContactId === person.id)} all={all} onOpen={edit}/></details>}</>}</DialogContent></Dialog>
 <Dialog open={!!audit} onOpenChange={o => !o && setAudit(undefined)}><DialogContent className="am-dialog"><DialogHeader><DialogTitle>Change history</DialogTitle><DialogDescription className="sr-only">Account audit trail</DialogDescription></DialogHeader>{audit?.map((r, i) => <article className="am-audit" key={i}><b>{r.action}</b><small>{r.actor} · {new Date(r.at).toLocaleString()}</small></article>)}</DialogContent></Dialog>
 <Dialog open={!!dispatchNote} onOpenChange={o => !o && setDispatchNote(undefined)}><DialogContent className="am-dialog"><DialogHeader><DialogTitle>{dispatchNote?.action === 'signageReport' ? 'Report signage issue' : 'Dispatch note'}</DialogTitle><DialogDescription>{account?.name}</DialogDescription></DialogHeader>{dispatchNote && <form onSubmit={e => { e.preventDefault(); void act({ ...dispatchNote, accountId: account?.id }).then(() => setDispatchNote(undefined)).catch(() => undefined); }}><label>Details<textarea required value={dispatchNote.details} onChange={e => setDispatchNote({ ...dispatchNote, details: e.target.value })}/></label><Button disabled={busy}>Save</Button></form>}</DialogContent></Dialog>
 </div>;
}
export function RecordEditor({ edit, data, editable, onClose, onSave, onParticipant, onRefresh }: {
    edit: Edit;
    data: Data;
    editable: boolean;
    onClose: () => void;
    onSave: (r: Row, action: string) => Promise<void>;
    onParticipant: (name: string) => Promise<void>;
    onRefresh: () => Promise<void>;
}) {
    const formRef=useRef<HTMLFormElement>(null);
    const existing=data.records.some(x=>x.id===edit.record.id);
    const [r, setR] = useState(edit.record), [error, setError] = useState(''), [busy, setBusy] = useState(false), [participant, setParticipant] = useState('');
    const [companyName,setCompanyName]=useState(''),[addingCompany,setAddingCompany]=useState(''),[stepName,setStepName]=useState(''),[comment,setComment]=useState('');
    const release = r.kind === 'courtesy', claim=r.kind==='claim', commercial=(r.kind==='account'?r.propertyType:data.records.find(a=>a.id===r.accountId)?.propertyType)==='Commercial', fields = forms[r.kind].filter(f=>fieldVisible(r,f.key)&&(!edit.fields||edit.fields.includes(f.key))&&!(r.kind==='account'&&((commercial&&['ownerId','units'].includes(f.key))||(r.service!=='Full Patrol'&&f.key==='health_permits')))), a = data.records.find(a => a.id === r.accountId), canApprove = !!a && data.releaseApprovals.includes(a.id), policy = assessment(r, data.records);
    const set = (key: string, value: Row[string]) => setR(r => ({ ...r, [key]: value }));
    function showError(message:string){setError(message);toast.error(message,{duration:5000});}
    function validateForm(){
      const invalid=Array.from(formRef.current?.elements||[]).find(el=>el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement ? !el.validity.valid:false) as HTMLInputElement|undefined;
      if(invalid){invalid.closest('details')?.setAttribute('open','');const label=invalid.closest('label')?.querySelector('span')?.textContent||'Field';showError(label+': '+invalid.validationMessage);invalid.focus();invalid.reportValidity();return false;}
      for(const f of fields){const message=f.type==='number'?numberError(f,r[f.key]):f.required&&!String(r[f.key]??'').trim()?f.label+': complete this field.':'';if(message){showError(message);return false;}}
      return true;
    }
    async function submit(action = 'save') { if(busy||!validateForm())return;setBusy(true); setError(''); try {
        await onSave(r, action);
    }
    catch (e) {
        showError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function createCompany(key:string) {setBusy(true);setError('');try{const result=await requestJson<{records:Row[]}>('/api/accounts',{record:{id:crypto.randomUUID(),kind:'company',version:0,name:companyName,type:'Management company'}});set(key,result.records[0].id);setCompanyName('');setAddingCompany('');toast.success('Management company created',{duration:3000});refreshAfterSave(onRefresh,()=>showError('Company created. Refresh the account list to see it.'));}catch(e){showError((e as Error).message);}finally{setBusy(false);}}
    async function postComment(){setBusy(true);setError('');try{await requestJson('/api/accounts',{record:{id:crypto.randomUUID(),kind:'comment',version:0,name:'Comment',parentId:r.id,accountId:r.accountId||'',details:comment}});setComment('');toast.success('Comment added',{duration:3000});refreshAfterSave(onRefresh,()=>showError('Comment saved. Refresh to see the updated history.'));}catch(e){showError((e as Error).message);}finally{setBusy(false);}}
    function field(f: Field) {
        if(r.kind==='workOrder'&&f.key==='type') return <WorkTypePicker key={f.key} all={data.records} value={text(r.type)} disabled={!editable||busy} onChange={value=>set('type',value)} onRefresh={onRefresh}/>;
        if(f.type==='attachments') {const candidates=data.records.filter(x=>x.kind==='file'&&x.accountId===r.accountId&&!x.sourceOnly&&x.status!=='Archived'&&(claim?['Claim evidence','Email attachment','Other'].includes(text(x.category)):!['Internal policy','Contact photo','Account photo'].includes(text(x.category))));return <div className="am-wide am-evidence-field" key={f.key}><b>{f.label}</b>{claim&&editable&&<InlineUpload accountId={text(r.accountId)} category="Claim evidence" disabled={busy} onBusyChange={setBusy} onUploaded={async rows=>{setR(prev=>({...prev,attachmentIds:[...new Set([...(prev.attachmentIds as string[]||[]),...rows.filter(x=>x.kind==='file'&&x.status==='Current').map(x=>x.id)])]}));await onRefresh();}}/>}{!r.accountId&&claim&&<small>Choose an account to upload evidence.</small>}<div className="am-evidence-list">{candidates.map(x=><div key={x.id}><label><input type="checkbox" disabled={!editable||busy} checked={(r.attachmentIds as string[]||[]).includes(x.id)} onChange={e=>set('attachmentIds',e.target.checked?[...(r.attachmentIds as string[]||[]),x.id]:(r.attachmentIds as string[]||[]).filter(id=>id!==x.id))}/><span>{x.name}</span></label><a href={'/api/accounts/files?id='+encodeURIComponent(x.id)} target="_blank" rel="noreferrer">Open</a></div>)}</div>{!candidates.length&&r.accountId&&!claim&&<small>No account attachments yet.</small>}</div>;}
        if(f.type==='ids'||(['waitingOn','waitingContactId','remindOn'].includes(f.key)&&!isWaiting(r)))return null;
        if(f.type==='checklist')return <div key={f.key} className="am-wide am-checklist"><b>Checklist</b>{(r.checklist as string[]||[]).map(item=>{const [id,...label]=item.split('|');return <div key={id}><label><input type="checkbox" checked={(r.completedSteps as string[]||[]).includes(id)} disabled={!editable||(r.kind==='workOrder'&&!data.operationsEditor)} onChange={e=>set('completedSteps',e.target.checked?[...(r.completedSteps as string[]||[]),id]:(r.completedSteps as string[]||[]).filter(v=>v!==id))}/>{label.join('|')}</label>{editable&&(r.kind!=='workOrder'||!r.version||data.operationsEditor)&&<button type="button" aria-label={'Remove '+label.join('|')} onClick={()=>{set('checklist',(r.checklist as string[]).filter(v=>v!==item));set('completedSteps',(r.completedSteps as string[]||[]).filter(v=>v!==id))}}>×</button>}</div>})}{editable&&(r.kind!=='workOrder'||!r.version||data.operationsEditor)&&<div><input aria-label="New checklist step" placeholder="Add a step" value={stepName} onChange={e=>setStepName(e.target.value)}/><Button type="button" variant="outline" size="sm" disabled={!stepName.trim()} onClick={()=>{set('checklist',[...(r.checklist as string[]||[]),crypto.randomUUID()+'|'+stepName.trim()]);setStepName('')}}>Add</Button></div>}</div>;

        if(r.kind==='affiliation'&&['startDate','endDate'].includes(f.key)){const month=r.datePrecision==='Month',end=f.key==='endDate',raw=text(r[f.key]);const shown=raw?(end?new Date(Date.parse(raw+'T12:00Z')-86400000).toISOString().slice(0,10):raw):'';return <label key={f.key}><span>{month?(end?'Last month in role':'First month in role'):end?'Last day in role':'Started on'}</span><input type={month?'month':'date'} disabled={!editable||busy} value={month?shown.slice(0,7):shown} onChange={e=>{const value=e.target.value;if(!value){set(f.key,'');return;}const d=new Date((month?value+'-01':value)+'T12:00Z');if(end){if(month)d.setUTCMonth(d.getUTCMonth()+1);else d.setUTCDate(d.getUTCDate()+1);}set(f.key,d.toISOString().slice(0,10));}}/></label>;}
        const fieldEditable=r.kind==='workOrder'&&['assignee','scheduledDate','status','actualCost','estimatedCost','resolution'].includes(f.key)?editable&&data.operationsEditor:claim&&['reviewNotes','paidAmount','paidDate','paymentReference'].includes(f.key)?data.claimApproval:editable;
        if(f.ref==='staff'){const eligible=(p:{id:string;name:string;department?:string})=>(f.key!=='backup'||['Account Managers','Operations'].includes(String(p.department)))&&(r.kind!=='workOrder'||f.key!=='assignee'||p.department==='Operations')&&(!claim||f.key!=='assignee'||p.department==='Account Managers');return <label key={f.key}><span>{f.label}{f.required?' *':''}</span><StaffSelect aria-label={f.label} value={text(r[f.key])} onChange={value=>set(f.key,value)} options={data.staff.filter(eligible).map(p=>({value:p.id,label:p.name}))} eligible={eligible} disabled={!fieldEditable||busy}/></label>;}
        let list = f.ref ? data.records.filter(x => x.kind === f.ref && x.id !== r.id && (!['file', 'inspection', 'task'].includes(f.ref) || x.accountId === r.accountId) && (!(f.key === 'managerAffiliationId') || x.accountId === r.accountId && managerRoles.includes(String(x.role)))).map(x => ({ value: x.id, label: f.key === 'managerAffiliationId' ? (data.records.find(p => p.id === x.contactId)?.name || 'Manager') + ' · ' + date(x.startDate) + ' – ' + (x.endDate ? date(x.endDate) : 'Current') : x.kind==='contact'?contactName(x.name):x.name })) : options(f.options || []);
        if(f.key==='role'&&commercial)list=list.filter(o=>!['Property Manager','Assistant Property Manager','Leasing Team','Owner'].includes(o.value));
        return <label key={f.key} className={['textarea', 'attachments'].includes(f.type || '') ? 'am-wide' : ''}><span>{f.label}{f.required ? ' *' : ''}</span>{f.type === 'checkbox' ? <input type="checkbox" checked={!!r[f.key]} onChange={e => set(f.key, e.target.checked)} disabled={!fieldEditable || busy}/> : f.type === 'textarea' ? <textarea value={f.key==='enforcementHours'?recordedEnforcementHours(r):text(r[f.key])} required={f.required} onChange={e => set(f.key, e.target.value)} disabled={!fieldEditable || busy}/> : f.type === 'select' ? <Pick value={text(r[f.key])} label="Choose…" options={list} onChange={value => set(f.key, value)} disabled={!fieldEditable || busy}/> : <input type={f.type || 'text'} step={f.type === 'number' ? numberStep(f.key) : undefined} inputMode={f.type==='number'?(numberStep(f.key)===1?'numeric':'decimal'):undefined} min={f.type === 'number' ? 0 : undefined} value={text(r[f.key])} required={f.required} onChange={e => set(f.key, f.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} disabled={!fieldEditable || busy}/>} {f.ref==='company'&&fieldEditable&&data.capabilities.relationships?.edit&&<><button className="am-text-button" type="button" onClick={()=>{setAddingCompany(f.key);setCompanyName('')}}>+ New management company</button>{addingCompany===f.key&&<span className="am-inline-company"><input aria-label="New management company name" placeholder="Company name" value={companyName} onChange={e=>setCompanyName(e.target.value)}/><Button type="button" size="sm" disabled={busy||!companyName.trim()} onClick={()=>void createCompany(f.key)}>Create</Button><button type="button" onClick={()=>setAddingCompany('')}>Cancel</button></span>}</>}</label>;
    }
    return <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="am-dialog"><DialogHeader><DialogTitle>{edit.title || (release ? 'Courtesy / reduced release' : ({ workOrder: 'Operations work order', task:'Task', affiliation: 'Property / company affiliation', activity: 'Contact & follow-up', decision: 'Service decision', file: 'File details', account: 'Account profile', playbook: 'Playbook step' } as Record<string, string>)[r.kind] || r.kind[0].toUpperCase() + r.kind.slice(1))}</DialogTitle><DialogDescription>{a?.name || 'Account Management'}</DialogDescription></DialogHeader><form ref={formRef} noValidate onSubmit={e => { e.preventDefault(); void submit(); }}><fieldset disabled={busy}>
 {!['account', 'company', 'contact', 'playbook', 'affiliation'].includes(r.kind) && (!r.accountId || !data.records.some(x => x.id === r.id)) && <label>{r.kind==='email'?'Link to account (optional; shares sent conversation)':'Account'}<Pick label={r.kind==='email'?'Private email':'Choose account'} value={text(r.accountId)} onChange={value => setR(prev=>({...prev,accountId:value,attachmentIds:[]}))} options={data.records.filter(x => x.kind === 'account').map(x => ({ value: x.id, label: x.name }))} disabled={!editable}/></label>}
 {claim&&<p><Badge>{r.status||'Investigating'}</Badge> · Alleged damage{r.approvedAmount!==undefined&&<> · Approved {money(r.approvedAmount)}</>}{r.reviewedBy&&<> · Reviewed by {r.reviewedBy}</>}</p>}
 {release && <><div className="am-release-summary"><Badge>{r.status}</Badge><span>Waived amount <b>{money(waived(r.originalCharges, r.amountCharged))}</b></span><span>Prior matching releases <b>{policy.prior.length}</b></span>{policy.maxPercent !== undefined && <span>Policy allowance <b>{policy.maxPercent}%</b></span>}{policy.unknown > 0 && <Badge>{policy.unknown} earlier entries need classification</Badge>}</div><details><summary>Prior history for this property / person</summary><CourtesyList rows={data.records.filter(x => x.kind === 'courtesy' && x.id !== r.id && (x.accountId === r.accountId || r.subjectContactId && x.subjectContactId === r.subjectContactId))} all={data.records}/></details></>}
 <div className="am-form-grid">{fields.filter(f => !f.group||(release&&['Imported','Approved','Released'].includes(text(r.status))&&f.key==='correctionReason')).map(field)}</div>{[...new Set(fields.map(f => f.group).filter(Boolean))].map(group => <details key={group}><summary>{group}</summary><div className="am-form-grid">{fields.filter(f => f.group === group&&!(release&&['Imported','Approved','Released'].includes(text(r.status))&&f.key==='correctionReason')).map(field)}</div></details>)}
 {['task','workOrder'].includes(r.kind)&&r.version>0&&<section className="am-comments"><h3>Comments</h3>{data.records.filter(c=>c.kind==='comment'&&c.parentId===r.id).sort((a,b)=>text(a.updatedAt).localeCompare(text(b.updatedAt))).map(c=><article key={c.id}><small>{c.updatedBy} · {c.updatedAt?new Date(String(c.updatedAt)).toLocaleString('en-US',{timeZone:'America/Chicago'}):''}</small><p>{c.details}</p></article>)}{editable&&<><textarea aria-label="Add a comment" placeholder="Add an update or question" value={comment} onChange={e=>setComment(e.target.value)}/><Button type="button" size="sm" variant="outline" disabled={!comment.trim()||busy} onClick={()=>void postComment()}>Add comment</Button></>}</section>}
 {release && editable && <details><summary>Add resident / staff contact</summary><div className="am-actions"><input value={participant} aria-label="Participant name" placeholder="Full name" onChange={e => setParticipant(e.target.value)}/><Button type="button" variant="outline" disabled={busy || !participant.trim()} onClick={() => { setBusy(true); void onParticipant(participant).then(() => setParticipant('')).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>Add contact</Button></div></details>}
 {r.kind==='email'&&r.status==='Draft'&&<p className="am-report-note">{r.accountId?'This email will be shared with authorized staff in the linked account history after sending.':'This email stays private to your inbox.'}</p>}{r.sourceUrl && <details><summary>Original record</summary><p>{r.sourceReleaseType} · {r.sourceApprovedBy}</p><a href={text(r.sourceUrl)} target="_blank" rel="noreferrer">Open source tracker</a></details>}{r.managerName && <p>Recorded manager: {r.managerName} · {date(r.managerTenureStart)} – {r.managerTenureEnd ? date(r.managerTenureEnd) : 'Current at time recorded'}</p>}
 <footer className="am-dialog-footer">{error && <p className="am-error am-save-error" role="alert">{error}</p>}<Button type="button" variant="outline" disabled={busy} onClick={onClose}>Close</Button>{editable && !['Voided', 'Declined'].includes(text(r.status)) && <Button disabled={busy}>{busy?'Saving…':r.kind==='account'&&!existing?'Save & start onboarding':edit.fields&&r.status==='Onboarding'?'Save progress':'Save changes'}</Button>}{r.kind==='email'&&r.status==='Draft'&&r.version>0&&editable&&<Button type="button" disabled={busy||JSON.stringify(payload(r))!==JSON.stringify(payload(edit.record))} onClick={()=>{setBusy(true);void requestJson('/api/accounts/google',{action:'send',id:r.id,version:r.version,accountId:r.accountId}).then(()=>{toast.success('Email sent',{duration:3500});onClose();refreshAfterSave(onRefresh,()=>undefined);}).catch(e=>showError(e.message)).finally(()=>setBusy(false))}}>Send saved draft</Button>}{claim&&editable&&['Investigating','Pending review'].includes(text(r.status))&&<Button type="button" disabled={busy} onClick={()=>void submit('submitClaim')}>Submit investigation</Button>}{claim&&data.claimApproval&&r.status==='Pending review'&&<><Button type="button" variant="outline" disabled={busy} onClick={()=>void submit('returnClaim')}>Return for investigation</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>void submit('closeClaim')}>Close without settlement</Button><Button type="button" disabled={busy} onClick={()=>void submit('approveClaim')}>Approve settlement</Button></>}{claim&&data.claimApproval&&r.status==='Approved'&&<Button type="button" disabled={busy} onClick={()=>void submit('payClaim')}>Record payment</Button>}{release && editable && ['Draft', 'Pending review'].includes(text(r.status)) && <Button type="button" disabled={busy} onClick={() => void submit('submitRelease')}>Submit for review</Button>}{release && canApprove && r.status === 'Pending review' && <><Button type="button" variant="outline" disabled={busy} onClick={() => void submit('declineRelease')}>Decline</Button><Button type="button" disabled={busy} onClick={() => void submit('approveRelease')}>Approve release</Button></>}{release && editable && r.status === 'Approved' && <Button type="button" disabled={busy} onClick={() => void submit('completeRelease')}>Mark released</Button>}{release && canApprove && ['Approved', 'Released', 'Imported'].includes(text(r.status)) && <Button type="button" variant="outline" disabled={busy} onClick={() => void submit('voidRelease')}>Void entry</Button>}</footer></fieldset></form></DialogContent></Dialog>;
}
export function CourtesyList({ rows, all, onOpen }: {
    rows: Row[];
    all: Row[];
    onOpen?: (r: Row) => void;
}) {
    const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [manager, setManager] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(0);
    const filtered = rows.filter(r => (!search || [r.vehicle, r.vin, r.plate, r.plateState, r.reason, r.sourceApprovedBy, r.managerName, r.towbookReference].join(' ').toLowerCase().includes(search.toLowerCase())) && (!status || r.status === status) && (!manager || r.managerContactId === manager) && (!from || text(r.date) >= from) && (!to || text(r.date) <= to)).sort((a, b) => text(b.date).localeCompare(text(a.date))), recorded = filtered.filter(r => ['Released', 'Imported'].includes(text(r.status))), missing = recorded.filter(r => typeof r.amountWaived !== 'number').length;
    useEffect(() => setPage(0), [search, status, manager, from, to]);
    return <><div className="am-release-summary"><span><b>{filtered.length}</b> releases</span><span>Known waived <b>{money(recorded.reduce((sum, r) => sum + Number(r.amountWaived || 0), 0))}</b></span>{missing > 0 && <Badge>{missing} waived amounts not recorded</Badge>}</div><FilterBar className="am-filters am-small-filters"><label>Search releases<input value={search} onChange={e => setSearch(e.target.value)} placeholder="VIN, plate, vehicle or manager"/></label><label>Status<Pick label="All statuses" value={status} onChange={setStatus} options={options(['Draft', 'Pending review', 'Approved', 'Released', 'Imported', 'Declined', 'Voided'])}/></label><label>Manager<Pick label="All managers" value={manager} onChange={setManager} options={all.filter(r => r.kind === 'contact' && rows.some(x => x.managerContactId === r.id)).map(r => ({ value: r.id, label: r.name }))}/></label><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e => setTo(e.target.value)}/></label></FilterBar><Table rows={filtered.slice(page * 12, page * 12 + 12)} columns={[{ label: 'Date / property', render: r => <>{date(r.date)}<small>{all.find(a => a.id === r.accountId)?.name}</small></> }, { label: 'Vehicle / VIN', render: r => <>{onOpen ? <button className="am-text-button" onClick={() => onOpen(r)}>{r.vehicle || r.name}</button> : r.vehicle || r.name}<small>{r.vin || 'VIN not recorded'}</small></> }, { label: 'Manager at release', render: r => r.managerName || 'Not recorded' }, { label: 'Waived', render: r => money(r.amountWaived) }, { label: 'Status', render: r => <Badge>{r.status}</Badge> }, { label: '', render: r => onOpen && <Button size="sm" variant="outline" onClick={() => onOpen(r)}>Open<ChevronRight /></Button> }]}/>{filtered.length > 12 && <footer className="am-pagination"><Button size="sm" variant="outline" disabled={!page} onClick={() => setPage(n => n - 1)}>Previous</Button><span>{page * 12 + 1}–{Math.min(filtered.length, page * 12 + 12)} of {filtered.length}</span><Button size="sm" variant="outline" disabled={(page + 1) * 12 >= filtered.length} onClick={() => setPage(n => n + 1)}>Next</Button></footer>}</>;
}
function Signage({ rows, editable, onEdit, onUpload }: {
    rows: Row[];
    editable: (r: Row) => boolean;
    onEdit: (r: Row) => void;
    onUpload: (id: string) => void;
}) {
    const inspections = rows.filter(r => r.kind === 'inspection').sort((a, b) => Number(!!b.dateConfirmed) - Number(!!a.dateConfirmed) || text(b.date).localeCompare(text(a.date))), photos = rows.filter(r => r.kind === 'file' && r.category === 'Signage');
    function gallery(files: Row[]) { return <div className="am-photo-grid">{files.map(f => <figure key={f.id}><a href={'/api/accounts/files?id=' + encodeURIComponent(f.id) + '&preview=1'} target="_blank" rel="noreferrer"><img loading="lazy" src={'/api/accounts/files?id=' + encodeURIComponent(f.id) + '&preview=1'} alt={text(f.location || f.name)}/></a><figcaption><b>{f.location || f.name}</b><small>{date(f.date)} · {f.dateConfirmed ? 'Photo date' : 'Upload date'}</small>{f.sourceUrl && <a href={text(f.sourceUrl)} target="_blank" rel="noreferrer">Open original</a>}</figcaption></figure>)}</div>; }
    function visit(r: Row, latest = false) { const files = photos.filter(f => f.inspectionId === r.id); return <div className="am-inspection"><div className="am-subhead"><div><h3>{date(r.date)}</h3><small>{r.dateConfirmed ? 'Confirmed photo / inspection date' : 'Inspection date needs confirmation'}</small></div><div className="am-actions"><Badge>{r.condition}</Badge>{editable(r) && <><Button size="sm" variant="outline" onClick={() => onEdit(r)}>Edit inspection</Button><Button size="sm" variant="outline" onClick={() => onUpload(r.id)}>Add photos</Button></>}</div></div><p>{r.locations || r.details}</p>{gallery(latest ? files.slice(0, 3) : files)}{latest && files.length > 3 && <details><summary>More photos ({files.length - 3})</summary>{gallery(files.slice(3))}</details>}</div>; }
    return <>{photos.length>0&&<><h3>Latest signage photos</h3>{gallery([...photos].sort((a,b)=>text(b.date).localeCompare(text(a.date))).slice(0,3))}</>}{inspections.length>0?<details><summary>Inspection history ({inspections.length})</summary>{inspections.map(r=><details key={r.id}><summary>{date(r.date)} · {r.dateConfirmed?'Recorded check':'Date needs confirmation'}</summary>{visit(r)}</details>)}</details>:<Empty>No inspections recorded.</Empty>}{photos.some(f=>!f.inspectionId)&&<details><summary>Photos awaiting inspection record</summary>{gallery(photos.filter(f=>!f.inspectionId))}</details>}</>;
}
function UploadDialog({ account, category, inspectionId, onClose, onChange }: {
    account: Row;
    category?: string;
    inspectionId?: string;
    onClose: () => void;
    onChange: () => Promise<void>;
}) {
    const [files, setFiles] = useState<{
        id: string;
        file: File;
        saved: boolean;
    }[]>([]), [cat, setCat] = useState(category || 'Other'), [language, setLanguage] = useState(''), [location, setLocation] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try {
        for (const item of files.filter(x => !x.saved)) {
            const body = new FormData();
            body.set('file', item.file);
            body.set('id', item.id);
            body.set('accountId', account.id);
            body.set('inspectionId', inspectionId || '');
            body.set('category', cat);
            body.set('language', language);
            body.set('location', location);
            const res = await timedFetch('/api/accounts/files', { method: 'POST', body });
            if (!res.ok) {
                const r = await res.json() as {
                    error?: string;
                };
                throw new Error(r.error || 'Upload failed.');
            }
            setFiles(f => f.map(x => x.id === item.id ? { ...x, saved: true } : x));
        }
        toast.success('Files uploaded',{duration:3500});
        onClose();
        refreshAfterSave(onChange,()=>toast.error('Files uploaded. Refresh to update the file list.',{duration:5000}));
    }
    catch (e) {
        setError((e as Error).message);
        refreshAfterSave(onChange,()=>undefined);
    }
    finally {
        setBusy(false);
    } }
    return <Dialog open onOpenChange={o => !o && !busy && onClose()}><DialogContent className="am-dialog"><DialogHeader><DialogTitle>Upload {cat === 'Signage' ? 'signage photos' : 'account files'}</DialogTitle><DialogDescription>{account.name}</DialogDescription></DialogHeader><form onSubmit={submit}><div className="cp-file-selection"><label className="cp-file-picker"><Upload size={18}/><span>Choose files</span><input aria-label="Choose account files" type="file" accept={cat === 'Signage' ? 'image/jpeg,image/png,image/webp' : '.pdf,.jpg,.jpeg,.png,.webp'} multiple disabled={busy} onChange={e => { const chosen = Array.from(e.target.files || []); if (chosen.length > 15) {
        setError('Choose up to 15 files.');
        return;
    } setFiles(chosen.map(file => ({ id: crypto.randomUUID(), file, saved: false }))); }}/></label><span role="status">{files.length?files.length+' file'+(files.length===1?'':'s')+' selected':'Select photos or PDFs to upload'}</span></div><div className="am-form-grid"><label>Category<Pick label="Choose category" value={cat} onChange={setCat} disabled={busy || !!category} options={options(['Signage', 'Agreement', 'Resident letter', 'Welcome letter', 'Timeline', 'Other', 'Release request', 'Release approval', 'Claim evidence'])}/></label><label>{cat === 'Signage' ? 'Sign location' : 'Language'}{cat === 'Signage' ? <input value={location} onChange={e => setLocation(e.target.value)}/> : <Pick label="Language" value={language} onChange={setLanguage} options={options(['English', 'Spanish', 'Bilingual', 'Other'])}/>}</label></div>{files.map(f => <p key={f.id}>{f.file.name} · {f.saved ? 'Saved' : (f.file.size / 1024 / 1024).toFixed(1) + ' MB'}</p>)}<footer className="am-dialog-footer">{error && <p className="am-error am-save-error" role="alert">{error}</p>}<Button type="button" variant="outline" onClick={onClose} disabled={busy}>Close</Button><Button disabled={busy || !files.some(f => !f.saved)}>{busy ? 'Uploading…' : 'Upload'}</Button></footer></form></DialogContent></Dialog>;
}
function Performance({ rows, editable, onAdd, onEdit }: {
    rows: Row[];
    editable: boolean;
    onAdd: () => void;
    onEdit: (r: Row) => void;
}) {
    const entries=rows.filter(r=>r.kind==='financial');
    return <details><summary>Additional financial entries ({entries.length})</summary>{editable&&<Button variant="outline" size="sm" onClick={onAdd}>Add financial entry</Button>}<Table rows={entries} columns={[{label:'Date',render:r=>date(r.date)},{label:'Entry',render:r=>editable?<button className="am-text-button" onClick={()=>onEdit(r)}>{r.name}</button>:r.name},{label:'Type',render:r=>r.type},{label:'Amount',render:r=>money(r.amount)},{label:'Reference',render:r=>r.reference},{label:'Status',render:r=>r.status}]}/></details>;

}
function EmailPanel({ account, records, editable, viewer, onNew, onEdit, onChange }: {
    account: Row;
    records: Row[];
    editable: boolean;
    viewer: Viewer;
    onNew: () => void;
    onEdit: (r: Row) => void;
    onChange: () => Promise<void>;
}) {
    const [connection, setConnection] = useState<{
        configured: boolean;
        connected: boolean;
        email: string;
    }>(), [threads, setThreads] = useState<{
        id: string;
        snippet: string;
    }[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { void requestJson<{
        configured: boolean;
        connected: boolean;
        email: string;
    }>('/api/accounts/google').then(setConnection).catch(e => setError(e.message)); }, []);
    async function action(body: Record<string, unknown>) { setBusy(true); setError(''); try {
        const r = await requestJson<{
            url?: string;
            records?: Row[];
        }>('/api/accounts/google', { accountId: account.id, ...body });
        if (r.url)
            window.location.assign(r.url);
        await onChange();
        if (body.action === 'reply' && r.records?.[0])
            onEdit(r.records[0]);
        if (body.action === 'disconnect')
            setConnection(c => c ? { ...c, connected: false } : c);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function search() { setBusy(true); setError(''); try {
        setThreads((await requestJson<{
            threads: {
                id: string;
                snippet: string;
            }[];
        }>('/api/accounts/google?accountId=' + encodeURIComponent(account.id))).threads);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <>{error && <p className="am-error">{error}</p>}<div className="am-actions">{editable && <Button size="sm" onClick={onNew}><Plus />Compose</Button>}{connection?.connected ? <><span>{connection.email}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => void search()}>Find account conversations</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void action({ action: 'disconnect' })}>Disconnect</Button></> : connection?.configured ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void action({ action: 'connect' })}>Connect Google</Button> : <Badge>Google Workspace setup required</Badge>}</div>{threads.map(t => <article className="am-mail-search" key={t.id}><p>{t.snippet}</p>{editable && <Button size="sm" variant="outline" disabled={busy} onClick={() => void action({ action: 'link', threadId: t.id })}>Link conversation</Button>}</article>)}{records.filter(r => r.kind === 'email').sort((a, b) => text(b.date || b.updatedAt).localeCompare(text(a.date || a.updatedAt))).map(r => <details key={r.id} className="am-email"><summary><Mail /><span><b>{r.subject || r.name}</b><small>{r.from || r.to} · {date(r.date)}</small></span><Badge>{r.status}</Badge></summary><p className="am-email-body">{r.body}</p><div className="am-attachments">{(r.attachmentIds as string[] || []).map(id => <a key={id} href={'/api/accounts/files?id=' + encodeURIComponent(id)}>{records.find(f => f.id === id)?.name || 'Attachment'}</a>)}</div><div className="am-actions">{editable && r.status === 'Draft' && r.authorId === viewer.person && <><Button size="sm" variant="outline" onClick={() => onEdit(r)}>Edit draft</Button><Button size="sm" disabled={busy || !connection?.connected} onClick={() => void action({ action: 'send', id: r.id, version: r.version })}>Send email</Button></>}{editable && r.threadId && r.status !== 'Draft' && <><Button size="sm" variant="outline" disabled={busy} onClick={() => void action({ action: 'reply', id: r.id })}>Reply</Button>{r.authorId===viewer.person&&<Button size="sm" variant="outline" disabled={busy || !connection?.connected} onClick={() => void action({ action: 'link', threadId: r.threadId })}>Refresh conversation</Button>}</>}{editable && r.authorId === viewer.person && ['Sending', 'Send unconfirmed'].includes(text(r.status)) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void action({ action: 'checkSent', id: r.id })}>Check Sent status</Button>}{r.threadId && r.authorId===viewer.person && <a target="_blank" rel="noreferrer" href={'https://mail.google.com/mail/u/0/#all/' + encodeURIComponent(text(r.threadId))}>Open in Gmail</a>}</div></details>)}{!records.some(r => r.kind === 'email') && <Empty>No linked conversations.</Empty>}</>;
}
async function saveTimeline(account: Row, records: Row[]) { const tasks = records.filter(r => r.kind === 'task' && ['Onboarding', 'Post-launch check'].includes(text(r.type))); if (!tasks.length)
    throw new Error('Add onboarding milestones before creating the PDF.'); const { jsPDF } = await import('jspdf'), doc = new jsPDF(); let y = 25; doc.setFontSize(20); const heading=doc.splitTextToSize(account.name,170);doc.text(heading,18,y);y+=heading.length*9+3; doc.setFontSize(14); doc.text('Property onboarding plan', 18, y); y += 14; doc.setFontSize(11); for (const task of tasks) {
    const lines = doc.splitTextToSize(task.name + '\n' + (task.dueDate ? date(task.dueDate) : 'Date to be arranged') + ' · ' + text(task.status), 170);
    if (y + lines.length * 6 > 278) {
        doc.addPage();
        y = 20;
    }
    doc.text(lines, 18, y);
    y += lines.length * 6 + 8;
} const body = new FormData(); body.set('file', new File([doc.output('blob')], account.name.replace(/[^A-Za-z0-9_-]/g, '-') + '-Onboarding-Plan.pdf', { type: 'application/pdf' })); body.set('id', crypto.randomUUID()); body.set('accountId', account.id); body.set('category', 'Timeline'); const response = await timedFetch('/api/accounts/files', { method: 'POST', body }); if (!response.ok) {
    const r = await response.json() as {
        error?: string;
    };
    throw new Error(r.error || 'PDF could not be saved.');
} }
