"use client";
import {uiTitle} from '@/lib/shared/ui-title';
import {auditStamp} from '@/lib/shared/audit-format';
import ReportingHrWorkspace from '@/components/people/ReportingHrWorkspace';
import SchoolHouseWorkspace from '@/components/school/SchoolHouseWorkspace';
import {moduleLabel} from '@/lib/shared/module-labels';
import {CcrExpenseNavigation} from '@/components/ccr/ChargebackExpenseLink';
import CcrWorkspace from '@/components/ccr/CcrWorkspace';
import {sectionOutcome,validOutcomeFilter} from '@/lib/ccr/court-outcomes';
import {directoryTab,directoryPath} from '@/lib/ccr/navigation';
import CompanyDrive from '@/components/drive/CompanyDrive';
import VehicleDispositionWorkspace from '@/components/vehicle-disposition/VehicleDispositionWorkspace';
import {actionDate} from '@/lib/accounts/work';
import {today as accountToday} from '@/lib/accounts/model';
import ModuleSearch from '@/components/shared/ModuleSearch';
import SafetyCenter from '@/components/safety/SafetyCenter';
import Notifications from '@/components/Notifications';
import AccountHub from "@/components/dispatch/AccountHub";
import SalesWorkspace from "@/components/sales/SalesWorkspace";
import AccountWorkspace from "@/components/accounts/AccountWorkspace";
import {queue as accountQueue,type Row as AccountRow} from "@/lib/accounts/model";
import {DelegatedAccessBanner, DelegatedAccessTabSync, type DelegatedView} from '@/components/admin/DelegatedAccessBanner';
import {canOpenYearHistory} from '@/lib/year-history/access';
import {DelegatedWorkspace} from '@/components/admin/DelegatedWorkspace';
import {requestJson, timedFetch, lockDelegatedClient, delegatedUrl} from '@/lib/shared/client';

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import FinanceWorkspace from "@/components/finance/FinanceWorkspace";
import HomeWorkspace from "@/components/home/HomeWorkspace";
import {WorkspaceThemeArt} from '@/components/preferences/WorkspaceTheme';
import UserSettingsMenu from "@/components/preferences/UserSettingsMenu";
import SignOutButton from "@/components/preferences/SignOutButton";
import AnnouncementBanner from "@/components/shared/AnnouncementBanner";
import PeopleDirectory,{HireSetup} from "@/components/people/PeopleDirectory";
import HrWorkspace from "@/components/people/HrWorkspace";
import UserAccessWorkspace from "@/components/finance/UserAccessWorkspace";
import AccessScope from "@/components/finance/AccessScope";
import {canEnterPersonalSopTab} from '@/lib/sop/acknowledgment-access';
import {canAccess} from "@/lib/finance/access";
import type {Viewer} from "@/lib/finance/model";
import TimeclockWorkspace from "@/components/finance/TimeclockWorkspace";
import {
  Activity, AlertTriangle, Archive, ArrowLeft, Bell, BookOpen, BriefcaseBusiness, Building2,
  CalendarDays, Car, Check, CheckCircle2, ChevronRight, ClipboardCheck, ClipboardList, Clock3, Copy,
  DollarSign, Download, ExternalLink, Eye, FileCheck2, FileText, FolderOpen, Gauge, GraduationCap, HandCoins, HeartHandshake, Home, IdCard, ImageIcon, LockKeyhole, Mail, MapPin, MapPinned, Menu,
  MessageSquare, MessageSquareText, Navigation, Phone, Pin, Plus, Route, Scale, Search, Send, Settings, ShieldCheck, Target, Upload, UserCheck, UserPlus, UserRoundX, Users, Video, WalletCards, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type CellValue = string | number | boolean | null;


const modules = [
  { label: "Home", icon: Home }, { label: "Accounts", icon: Building2 },
  { label: "Account Management", icon: BriefcaseBusiness }, { label: "Sales CRM", icon: Target }, { label: "Finance", icon: WalletCards }, { label: "Timeclock", icon: Clock3 }, { label: "Work Orders", icon: Wrench },
  { label: "Compliance, Claims & Recovery", icon: Scale }, { label: "Company Drive", icon: FolderOpen }, { label: "Vehicle Disposition & Sales", icon: Car },
  { label: "People & HR", icon: Users }, { label: "Slack", icon: MessageSquareText }, { label: "SOP Library", icon: BookOpen },
  { label: "Admin", icon: Settings },
];

const scheduleDays = [
  { day: "Sun", date: "Sep 6", dispatch: ["Dalila", "Nessa Rios", "Jarif Garcia"], drivers: ["Mingo", "Jendel Arauz", "Mingo"] },
  { day: "Mon", date: "Sep 7", dispatch: ["Dalila", "Nessa Rios", "Jarif Garcia"], drivers: ["Jendel Arauz", "Mingo", "Mingo"] },
  { day: "Tue", date: "Sep 8", dispatch: ["Dalila", "Nessa Rios", "Jarif Garcia"], drivers: ["Mingo", "Jendel Arauz", "Mingo"] },
  { day: "Wed", date: "Sep 9", dispatch: ["Dalila", "Nessa Rios", "Jarif Garcia"], drivers: ["Jendel Arauz", "Mingo", "Jendel Arauz"] },
  { day: "Thu", date: "Sep 10", dispatch: ["Dalila", "Nessa Rios", "Jarif Garcia"], drivers: ["Mingo", "Jendel Arauz", "Mingo"] },
  { day: "Fri", date: "Sep 11", dispatch: ["Dalila", "Gabrielle Jones", "Jarif Garcia"], drivers: ["Jendel Arauz", "Mingo", "Jendel Arauz"] },
  { day: "Sat", date: "Sep 12", dispatch: ["Dalila", "Gabrielle Jones", "Jarif Garcia"], drivers: ["Mingo", "Jendel Arauz", "Mingo"] },
];



function stringValue(value: CellValue | FormDataEntryValue | undefined, empty = "—") {
  if (value === null || value === undefined || value === "") return empty;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  // Only exact dates or explicitly zoned instants can be safely reformatted.
  // An actual midnight UTC event can be on the prior Austin date.
  if(typeof value==='string'){const stamp=auditStamp(value);if(stamp)return stamp;}
  return String(value);
}
function toneFor(value: string) {
  const text = value.toLowerCase();
  if (/(critical|high|risk|missing|late|hold|cancel|terminated|blocked|no$)/.test(text)) return "red";
  if (/(warning|pending|review|scheduled|upcoming|medium)/.test(text)) return "orange";
  if (/(complete|approved|active|healthy|yes|current|logged)/.test(text)) return "green";
  if (/(notice|recovery|exception|pause)/.test(text)) return "purple";
  return "blue";
}
function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) { const label = String(children ?? ""); return <span className={`badge ${tone ?? toneFor(label)}`}>{children}</span>; }
function SectionCard({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) { return <section className={`card ${className}`}><header><h2>{title}</h2>{action}</header>{children}</section>; }
function Metric({ value, label, tone = "blue" }: { value: string; label: string; tone?: string }) { return <div className="metric"><span className={tone}><Activity size={18} /></span><div><strong>{value}</strong><small>{uiTitle(label)}</small></div></div>; }

function Field({ label, value }: { label: string; value: CellValue | undefined }) { return <div className="field"><small>{uiTitle(label)}</small><b>{stringValue(value)}</b></div>; }
function Heading({ title, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="heading"><div><h1>{title}</h1></div>{action}</div>; }

export default function CommandPost() {
  const [activeModule, setActiveModule] = useState("Home");
  const [workspaceTarget, setWorkspaceTarget] = useState<{tab?:string;section?:string;person?:string;date?:string;department?:string}>({});
  const [sessionViewer,setSessionViewer]=useState<Viewer|undefined>(undefined),[sessionError,setSessionError]=useState('');
  const [reportingOnly,setReportingOnly]=useState(false);
  const [delegation,setDelegation]=useState<DelegatedView|null>(null);
  const identityKey=useRef<string|null>(null);
  const viewing=delegation?.state==='active';
  const limitedHr=reportingOnly||Boolean(sessionViewer&&!canAccess(sessionViewer,'People & HR'));
  useEffect(()=>{
    let current=0,closed=false;
    const load=async()=>{
      const attempt=++current;
      try{
        const res=await timedFetch('/api/session',{cache:'no-store'},30000);
        const b=await res.json() as {viewer?:Viewer;delegation?:DelegatedView;error?:string;email?:string;reportingOnly?:boolean};
        if(closed||attempt!==current)return;
        const d=b.delegation??null;
        // A full navigation clears every component cache across identity boundaries.
        const key=d?.state==='active'?'view:'+d.subjectId:d?.state==='ended'?'ended':res.ok&&b.viewer?'own:'+b.viewer.person:'guest';
        if(identityKey.current!==null&&identityKey.current!==key){window.location.replace(delegatedUrl(d?.state==='active'?'/':key.startsWith('own:')?'/?module=Admin&tab=delegated-access':'/'));return;}
        identityKey.current=key;
        if(d)lockDelegatedClient();
        setDelegation(d);
        setReportingOnly(!d&&!res.ok&&res.status===403&&b.reportingOnly===true);
        setSessionViewer(res.ok?b.viewer:undefined);
        setSessionError(res.ok?'':(b.error||'Unable to load your account')+(b.email?' Signed in as '+b.email:''));
      }catch(e){
        if(!closed&&attempt===current){setReportingOnly(false);setSessionViewer(undefined);setSessionError(e instanceof Error?e.message:'Unable to load your account.');}
      }
    };
    void load();
    const refresh=()=>{if(document.visibilityState==='visible')void load();};
    document.addEventListener('visibilitychange',refresh);
    for(const event of ['hr-updated','people-updated','staff-names-changed'])window.addEventListener(event,load);
    return()=>{closed=true;document.removeEventListener('visibilitychange',refresh);for(const event of ['hr-updated','people-updated','staff-names-changed'])window.removeEventListener(event,load);};
  },[]);
  useEffect(() => {
    const query=new URLSearchParams(window.location.search),requested=query.get("module");
    const chosen=requested==="School House"?"SOP Library":requested;
    if(chosen&&modules.some(m=>m.label===chosen))setActiveModule(chosen);
    if(chosen==='Admin'&&query.get('tab')==='delegated-access')setWorkspaceTarget({tab:'delegated-access'});
    const directory=directoryTab(chosen,query.get('tab'));
    if(directory){const outcome=directory==='hearings'?validOutcomeFilter(query.get('outcome')):'all';setWorkspaceTarget({tab:directory,...(outcome!=='all'?{section:'outcome:'+outcome}:{})});}
  },[]);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProperty, setSelectedProperty] = useState("Wildhorse Flats");
  const [accountsView, setAccountsView] = useState<"directory" | "property" | "tools">("directory");
  const [accountsTab, setAccountsTab] = useState("overview");
  const [managerTab, setManagerTab] = useState("today");
  const [genericOpen, setGenericOpen] = useState("");
  const [toast, setToast] = useState("");
  const [hrTab, setHrTab] = useState("home");
  const [personOpen, setPersonOpen] = useState(false);
  const [, setFinanceTab] = useState("home");
  const [salesTab, setSalesTab] = useState("dashboard");
  const [workOrderTab, setWorkOrderTab] = useState("dashboard");
  const [workOrderStatuses, setWorkOrderStatuses] = useState<Record<string, string>>({});
  const [sopTab, setSopTab] = useState("learning");
  const [vehicleTab, setVehicleTab] = useState("queue");
  const [vehicleCompliance, setVehicleCompliance] = useState<Record<string, string>>({});

  const [sharedAccounts,setSharedAccounts]=useState<AccountRow[]>([]);
  useEffect(()=>{if(!sessionViewer||sessionViewer.onboardingOnly)return;const refresh=()=>{void requestJson<{records:AccountRow[]}>('/api/accounts?surface='+ (canAccess(sessionViewer,'Account Management')?'manager':'dispatch')).then(r=>setSharedAccounts(r.records)).catch(()=>setSharedAccounts([]));};refresh();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[sessionViewer,viewing]);
  const pendingAccountActions=accountQueue(sharedAccounts).filter(r=>r.assignee===sessionViewer?.person&&!!actionDate(r)&&actionDate(r)<=accountToday()).length;
  const visibleSearchResults=searchTerm.trim()?sharedAccounts.filter(r=>r.kind==='account'&&r.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0,8).map(r=>({label:r.name,module:canAccess(sessionViewer,'Account Management')?'Account Management':'Accounts',detail:String(r.service||'')})):[];
  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }
  function navigate(label: string, tab?: string, section?: string, selection?:{person?:string;date?:string;department?:string;account?:string}) {
    const personalSop=canEnterPersonalSopTab(sessionViewer,label,tab);
    const historyLink=tab==='year-history'&&canOpenYearHistory(sessionViewer,label);
    if (!personalSop&&!historyLink&&!canAccess(sessionViewer,label,tab) && !(limitedHr&&label==='People & HR'&&!tab)) return;
    if(!viewing){
      const params=new URLSearchParams(window.location.search),directory=directoryTab(label,tab);
      if(directory)window.history.replaceState(window.history.state,'',directoryPath(directory,sectionOutcome(section)));
      else if(directoryTab(params.get('module'),params.get('tab')))window.history.replaceState(window.history.state,'',label==='Home'?'/':'/?module='+encodeURIComponent(label));
    }
    if(historyLink&&label==='Finance'){tab='Reports & Taxes';section='Archive & Year in Review';}
    if(selection?.account){setSelectedProperty(selection.account);setAccountsView('property');}else if(['Accounts','Account Management'].includes(label)&&tab){setAccountsView('directory');}
    setWorkspaceTarget({tab,section,person:selection?.person,date:selection?.date,department:selection?.department});
    if(tab){
      if(label==='Accounts')setAccountsTab(tab);
      if(label==='Account Management')setManagerTab(tab==='accounts'&&['pending','terminated'].includes(section||'')?section!:tab);
      if(label==='Sales CRM')setSalesTab(tab);
      if(label==='People & HR')setHrTab(tab);
      if(label==='Work Orders')setWorkOrderTab(tab);

      if(label==='SOP Library'){setSopTab(tab);if(activeModule===label)window.dispatchEvent(new CustomEvent('sop-search-open',{detail:{tab,section}}));}
    }
    setActiveModule(label); setMobileNav(false); setSearchTerm("");
  }
  const content = activeModule === "Accounts" ? <AccountHub initialTab={accountsTab} initialAccount={accountsView==="property"?selectedProperty:""} /> : activeModule === "Account Management" ? <AccountWorkspace initialAccount={accountsView==="property"?selectedProperty:""} initialTab={managerTab} onOpen={navigate} /> : renderOtherModule(activeModule);

  const hrModuleActive=!!sessionViewer&&(sessionViewer.onboardingOnly===true&&activeModule!=="SOP Library"||(activeModule==="People & HR"&&canAccess(sessionViewer,"People & HR")));

  if(delegation?.state==='ended')return <><DelegatedAccessTabSync/><DelegatedAccessBanner delegation={delegation}/><main className="f-loading"><h1>Employee View Has Ended</h1><p>Return to your account to continue.</p></main></>;
  const previewModule=sessionViewer?.onboardingOnly&&activeModule!=='SOP Library'?'People & HR':activeModule;
  return <div className={`shell ${hrModuleActive?"hr-module-active":""}`}>
    <DelegatedAccessTabSync/>
    <aside className={`side ${mobileNav ? "open" : ""}`}><div className="command-brand"><img src="/pte-road.svg" alt="Parking & Towing Enforcement"/><b>Command</b></div><WorkspaceThemeArt placement="menu"/><nav aria-label="Main navigation">{modules.filter(m=>sessionViewer?.onboardingOnly ? ["People & HR","SOP Library"].includes(m.label) : (limitedHr&&m.label==="People & HR")||canEnterPersonalSopTab(sessionViewer,m.label)||canAccess(sessionViewer,m.label)).map(({ label, icon: Icon }) => <button key={label} className={(viewing?previewModule:activeModule) === label ? "active" : ""} onClick={() => { if (label === "Accounts") setAccountsView("directory"); if (label === "Account Management") { setManagerTab("today"); setAccountsView("directory"); } navigate(label); }}><i><Icon size={19} /></i>{moduleLabel(label)}{label === "Account Management" && pendingAccountActions > 0 && <em>{pendingAccountActions}</em>}</button>)}</nav>{!viewing&&<button className="issue" onClick={() => setGenericOpen("Report software issue")}><MessageSquareText size={15} /> Report Software Issue</button>}</aside>
    {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <div className="stage">{viewing&&<DelegatedAccessBanner delegation={delegation}/>}<header className="top"><WorkspaceThemeArt placement="header"/><button className="hamb" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu /></button>{sessionViewer&&!sessionViewer.onboardingOnly&&!(limitedHr&&activeModule==="People & HR")&&<ModuleSearch module={activeModule} viewer={sessionViewer} accounts={sharedAccounts} onOpen={navigate}/>}<div className="top-account-controls">{!viewing&&sessionViewer&&!sessionViewer.onboardingOnly&&<Notifications key={sessionViewer.person} person={sessionViewer.person} onOpen={navigate}/>}{viewing?<strong className="delegated-subject-name">{delegation.subjectName}</strong>:<UserSettingsMenu viewer={sessionViewer}/>}<SignOutButton delegated={Boolean(delegation)} authenticated={Boolean(sessionViewer)}/></div></header>{!viewing&&sessionViewer&&<AnnouncementBanner key={sessionViewer.person}/>} {!viewing&&activeModule==="Accounts"&&sessionViewer&&!sessionViewer.onboardingOnly&&<SafetyCenter key={sessionViewer.person}/>}<main>{viewing?sessionViewer?<DelegatedWorkspace key={sessionViewer.person} module={previewModule}>{limitedHr&&activeModule==='People & HR'?<ReportingHrWorkspace/>:sessionViewer.onboardingOnly&&activeModule!=='SOP Library'?<HrWorkspace/>:!canAccess(sessionViewer,activeModule)&&!canEnterPersonalSopTab(sessionViewer,activeModule)?<div className="f-loading"><h2>Choose an Available Module</h2><p>This employee’s assigned modules are in the menu.</p></div>:<AccessScope viewer={sessionViewer} module={activeModule}>{content}</AccessScope>}</DelegatedWorkspace>:<div className="f-loading" role="alert">Could not verify the employee view. Use Return to My Account or refresh.</div>:limitedHr&&activeModule==="People & HR"?<ReportingHrWorkspace/>:!sessionViewer?<div className="f-loading"><h2>{sessionError?'Account Access':'Loading your account…'}</h2>{sessionError&&<><p>{sessionError}</p>{reportingOnly&&<button type="button" className="f-button" onClick={()=>navigate("People & HR")}>Open People &amp; HR</button>}<a className="f-button primary" href="/command-access/sign-in" target="_top">Sign In to Command</a><a className="f-button" href="/command-access/sign-out" target="_top">Switch Account</a></>}</div>:sessionViewer.onboardingOnly&&activeModule!=="SOP Library"?<HrWorkspace />:!canAccess(sessionViewer,activeModule)&&!canEnterPersonalSopTab(sessionViewer,activeModule)?<div className="f-loading"><h2>Choose an Available Module</h2><p>Your assigned modules are in the menu.</p></div>:<AccessScope viewer={sessionViewer} module={activeModule}>{content}</AccessScope>}</main><WorkspaceThemeArt placement="footer"/></div>
    
    

    
    {personOpen&&<HireSetup onClose={()=>setPersonOpen(false)}/>}
    
    <Dialog open={Boolean(genericOpen)} onOpenChange={(open) => !open && setGenericOpen("")}><DialogContent><DialogHeader><DialogTitle>{genericOpen}</DialogTitle><DialogDescription className="sr-only">New record</DialogDescription></DialogHeader><div className="dialogForm"><label className="wide"><span>Summary *</span><Input placeholder="Enter a clear title" /></label><label className="wide"><span>Details *</span><Textarea placeholder="Record the facts, owner, deadline, and desired outcome." /></label></div><DialogFooter><Button variant="outline" onClick={() => setGenericOpen("")}>Cancel</Button><Button onClick={() => { setGenericOpen(""); showToast("Record saved for this session."); }}>Save Record</Button></DialogFooter></DialogContent></Dialog>
    {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
  </div>;

  function renderOtherModule(label: string) {
    if (label === "Home") return <HomeWorkspace readOnly={viewing} key={(sessionViewer?.person||"")+"|"+JSON.stringify(sessionViewer?.access||[])} onOpen={navigate}/>;
    if (label === "Work Orders") return <AccountWorkspace surface="orders" initialTab={workspaceTarget.tab==='year-history'?'year-history':workspaceTarget.tab==='assets'?'assets':undefined} onOpen={navigate}/>;
    if (label === "People & HR") return <HrWorkspace initialTab={hrTab} initialHomeSection={workspaceTarget.section} initialHomePerson={workspaceTarget.person} onNavigate={navigate}/>;
    if (label === "Sales CRM") return <SalesWorkspace initialTab={salesTab} onOpen={navigate} />;
    if (label === "Admin") return <UserAccessWorkspace initialTab={workspaceTarget.tab} />;
    if (label === "Finance") return <FinanceWorkspace key={"finance"+workspaceTarget.tab+workspaceTarget.section} initialTab={workspaceTarget.tab} initialSection={workspaceTarget.section} />;
    if (label === "Timeclock") return <TimeclockWorkspace key={"timeclock"+JSON.stringify(workspaceTarget)} initialView={workspaceTarget.tab} initialPerson={workspaceTarget.person} initialWeek={workspaceTarget.date} initialDepartment={workspaceTarget.department} />;
    if (label === "Compliance, Claims & Recovery" && sessionViewer) return <CcrExpenseNavigation viewer={sessionViewer} go={navigate}><CcrWorkspace key={sessionViewer.person+'|'+JSON.stringify(sessionViewer.access)} viewer={sessionViewer} requestedTab={workspaceTarget.tab} record={workspaceTarget.section} onNavigate={navigate} /></CcrExpenseNavigation>;
    if (label === "Company Drive") return <CompanyDrive initialNode={workspaceTarget.section}/>;
    if (label === "Vehicle Disposition & Sales") return <VehicleDispositionWorkspace />;
    if (label === "Slack") return <FinanceWorkspace key="slack" mode="slack" />;
    if (label === "SOP Library") return <SchoolHouseWorkspace viewer={sessionViewer} key={sessionViewer?.person+'|'+sessionViewer?.role+'|'+JSON.stringify(sessionViewer?.access||[])} initialTab={sopTab} initialPolicy={workspaceTarget.section} />;
    const moduleCopy: Record<string, { subtitle: string; metrics: [string, string, string?][]; items: { title: string; detail: string; status: string }[] }> = {
      "People & HR": { subtitle: "Employees, contractors, onboarding, performance, discipline, losses, and recognition.", metrics: [["19", "Active people"], ["3", "Onboarding", "orange"], ["4", "On probation", "purple"], ["4", "Six-month reviews"]], items: [{ title: "Austin Koska", detail: "Operations Director · reports to Jerson", status: "Active" }, { title: "Alex Englert", detail: "Director of Sales & Development", status: "Active" }, { title: "Nessa Rios", detail: "Permit Specialist / Dispatcher", status: "License due" }] },
      Admin: { subtitle: "Users, permissions, reporting lines, integrations, system settings, and audit controls.", metrics: [["19", "Active users"], ["12", "Role templates"], ["3", "Connected services", "teal"], ["0", "Audit gaps", "green"]], items: [{ title: "Users & access", detail: "Role and tab-level permissions", status: "19 active" }, { title: "Reporting lines", detail: "Supervisor-by-position relationships", status: "Current" }, { title: "Integration access", detail: "Towbook, Gmail, Slack, and financial connection permissions", status: "Controlled" }, { title: "Document templates", detail: "18 approved templates", status: "Current" }] },
    };
    const config = moduleCopy[label] ?? moduleCopy.Admin;
    return <><Heading title={label} subtitle={config.subtitle} action={<Button onClick={() => setGenericOpen(`New ${label} record`)}><Plus /> New Record</Button>} /><div className="metrics four">{config.metrics.map(([value, metricLabel, tone]) => <Metric key={metricLabel} value={value} label={metricLabel} tone={tone} />)}</div><div className="grid3"><SectionCard title="Required Actions">{config.items.map((item) => <button className="row" key={item.title} onClick={() => setGenericOpen(item.title)}><span className={`dot ${toneFor(item.status)}`} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><Pill>{item.status}</Pill></button>)}</SectionCard><SectionCard title="Selected Record"><div className="recordTitle"><div><h3>{config.items[0].title}</h3><p>{config.items[0].detail}</p></div><Pill>{config.items[0].status}</Pill></div><div className="details"><Field label="Owner" value="Jerson" /><Field label="Next Action" value="Review and document outcome" /><Field label="Audit History" value="Enabled" /><Field label="Resolution Required" value="Yes" /></div><div className="actions"><Button variant="outline" onClick={() => setGenericOpen("Add update")}>Add Update</Button><Button onClick={() => setGenericOpen("Complete with resolution")}>Complete with Resolution</Button></div></SectionCard><SectionCard title="Activity"><div className="noticeCopy"><p><b>Every meaningful action is operational.</b></p><p>Forms update the current demo session and preserve the workflow structure required for production storage.</p><p>Completion requires ownership, outcome, evidence, and a timestamped resolution.</p></div></SectionCard></div></>;
  }

  function WorkOrdersPro() {
    const workItems = [
      { id: "WO-241", task: "Repair yard gate sensor", place: "VSF Yard", category: "Facilities & Maintenance", asset: "Gate 1 / SENSOR-04", priority: "Critical", assignee: "Austin", due: "Today · 4 PM", sla: "2h remaining", status: "In progress", cost: "$650 estimate" },
      { id: "WO-242", task: "Replace missing towing sign", place: "Ironhorse Flats", category: "Property Service", asset: "North entrance", priority: "High", assignee: "Vendor · SignCo", due: "Sep 4", sla: "Due tomorrow", status: "Awaiting vendor", cost: "$185 approved" },
      { id: "IT-118", task: "Dispatch printer cannot connect", place: "Dispatch Office", category: "IT Tickets & Requests", asset: "PRN-DSP-02", priority: "High", assignee: "IT support", due: "Today · 3 PM", sla: "1h remaining", status: "Assigned", cost: "No cost" },
      { id: "WO-244", task: "Office HVAC not cooling", place: "Admin Building", category: "Facilities & Maintenance", asset: "RTU-02", priority: "High", assignee: "CoolAir LLC", due: "Sep 3", sla: "Vendor en route", status: "In progress", cost: "$1,200 approval due" },
      { id: "IT-121", task: "Account manager Gmail sync failed", place: "Command Post", category: "IT Tickets & Requests", asset: "Google Workspace integration", priority: "Medium", assignee: "IT support", due: "Sep 5", sla: "Within SLA", status: "New", cost: "No cost" },
    ];
    return <><Heading title="Work Orders" subtitle="Request, prioritize, assign, schedule, cost, document, complete, and audit property service, facilities, maintenance, and IT work." action={<Button onClick={() => setGenericOpen("New work order intake")}><Plus /> New Work Order</Button>} /><Tabs value={workOrderTab} onValueChange={setWorkOrderTab}><TabsList variant="line" className="managerTabs"><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="orders">Work Orders</TabsTrigger><TabsTrigger value="preventive">Preventive Maintenance</TabsTrigger><TabsTrigger value="assets">Assets &amp; vendors</TabsTrigger><TabsTrigger value="calendar">Calendar</TabsTrigger><TabsTrigger value="completed">Completed</TabsTrigger></TabsList><TabsContent value="dashboard"><div className="metrics four"><Metric value="18" label="Open Work Orders" /><Metric value="5" label="Due Today" tone="red" /><Metric value="3" label="Awaiting Vendor" tone="orange" /><Metric value="4" label="IT Tickets" tone="teal" /></div><div className="workDashboard"><SectionCard title="Priority and SLA Queue"><div className="workOrderCards">{workItems.map((item) => { const status = workOrderStatuses[item.id] ?? item.status; return <article key={item.id}><span className={`priorityBar ${toneFor(item.priority)}`} /><div><header><span><small>{item.id} · {item.category}</small><b>{item.task}</b></span><Pill>{status}</Pill></header><p>{item.place} · {item.asset}</p><footer><span>Owner: {item.assignee}</span><span>Due: {item.due}</span><span>{item.sla}</span><b>{item.cost}</b></footer></div><Button size="sm" variant="outline" onClick={() => setGenericOpen(`${item.id} · ${item.task}`)}>Open</Button></article>; })}</div></SectionCard><SectionCard title="Service Queues"><div className="categories">{[["Property Service", 8], ["Facilities & Maintenance", 6], ["IT Tickets & Requests", 4], ["Safety / compliance hold", 2]].map(([label, count]) => <button key={String(label)} onClick={() => setWorkOrderTab("orders")}><span>{label}</span><b>{count}</b></button>)}</div></SectionCard></div></TabsContent><TabsContent value="orders"><SectionCard title="All Work Orders"><div className="dataTableWrap"><table className="dataTable"><thead><tr><th>ID / Request</th><th>Location / Asset</th><th>Priority</th><th>Assignee</th><th>SLA / Due</th><th>Cost</th><th>Status</th><th /></tr></thead><tbody>{workItems.map((item) => <tr key={item.id}><td><b>{item.id} · {item.task}</b><small>{item.category}</small></td><td>{item.place}<small>{item.asset}</small></td><td><Pill>{item.priority}</Pill></td><td>{item.assignee}</td><td>{item.sla}<small>{item.due}</small></td><td>{item.cost}</td><td><Pill>{workOrderStatuses[item.id] ?? item.status}</Pill></td><td><Button size="sm" variant="outline" onClick={() => setWorkOrderStatuses((current) => ({ ...current, [item.id]: "Ready for verification" }))}>Advance</Button></td></tr>)}</tbody></table></div></SectionCard></TabsContent><TabsContent value="preventive"><div className="workBoard">{[["Weekly", "Inspect yard gate, lighting, fire extinguishers", "Next Sep 7"], ["Monthly", "HVAC filters, cameras/NVR, tow-truck safety equipment", "Next Sep 15"], ["Quarterly", "Signage sample audit, facility safety walk, vendor review", "Next Sep 30"], ["Annual", "Asset inventory, warranties, preventive plan approval", "Next Jan 5"]].map(([cadence, tasks, due]) => <article key={cadence}><CalendarDays /><div><b>{cadence} preventive plan</b><p>{tasks}</p><small>{due}</small></div><Button size="sm" variant="outline" onClick={() => setGenericOpen(`${cadence} preventive plan`)}>Open Plan</Button></article>)}</div></TabsContent><TabsContent value="assets"><div className="assetGrid">{[["Gate 1 / SENSOR-04", "Facility asset", "VSF Yard", "Repair open"], ["RTU-02", "HVAC", "Admin Building", "Vendor en route"], ["PRN-DSP-02", "IT equipment", "Dispatch Office", "Service due"], ["Google Workspace", "Software integration", "Company", "1 incident"]].map(([asset, type, location, status]) => <article key={asset}><Wrench /><div><b>{asset}</b><small>{type} · {location}</small></div><Pill>{status}</Pill><Button size="sm" variant="outline" onClick={() => setGenericOpen(`${asset} history`)}>History</Button></article>)}</div></TabsContent><TabsContent value="calendar"><SectionCard title="Scheduled Work"><div className="workCalendar">{scheduleDays.map((day, index) => <article key={day.day}><header><b>{day.day}</b><small>{day.date}</small></header>{index < workItems.length ? <button onClick={() => setGenericOpen(workItems[index].id)}><b>{workItems[index].task}</b><small>{workItems[index].assignee} · {workItems[index].due}</small></button> : <span>No scheduled work</span>}</article>)}</div></SectionCard></TabsContent><TabsContent value="completed"><SectionCard title="Verified Completion History"><div className="hrControlList"><span><CheckCircle2 /><b>Resolution Note and Requester Verification</b><small>Required Before Closure</small></span><span><FileCheck2 /><b>Before/After Evidence and Invoice</b><small>Preserved with Asset and Property History</small></span><span><DollarSign /><b>Final Cost and Budget Attribution</b><small>Sent to Finance When Applicable</small></span></div></SectionCard></TabsContent></Tabs></>;
  }

}
