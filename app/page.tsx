"use client";
import {actionDate} from '@/lib/accounts/work';
import {today as accountToday} from '@/lib/accounts/model';
import SafetyCenter from '@/components/safety/SafetyCenter';
import Notifications from '@/components/Notifications';
import AccountHub from "@/components/dispatch/AccountHub";
import SalesWorkspace from "@/components/sales/SalesWorkspace";
import AccountWorkspace from "@/components/accounts/AccountWorkspace";
import {queue as accountQueue,type Row as AccountRow} from "@/lib/accounts/model";
import {requestJson} from "@/lib/shared/client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import FinanceWorkspace from "@/components/finance/FinanceWorkspace";
import HomeWorkspace from "@/components/home/HomeWorkspace";
import UserSettingsMenu from "@/components/preferences/UserSettingsMenu";
import PeopleDirectory,{HireSetup} from "@/components/people/PeopleDirectory";
import UserAccessWorkspace from "@/components/finance/UserAccessWorkspace";
import AccessScope from "@/components/finance/AccessScope";
import {canAccess} from "@/lib/finance/access";
import type {Viewer} from "@/lib/finance/model";
import TimeclockWorkspace from "@/components/finance/TimeclockWorkspace";
import TimeclockStatus from "@/components/finance/TimeclockStatus";
import WorkOrdersWorkspace from "@/components/work-orders/WorkOrdersWorkspace";
import VehicleDispositionWorkspace from "@/components/vehicle-disposition/VehicleDispositionWorkspace";
import CcrPanel from "@/components/ccr/CcrPanel";
import ComplianceCalendar from "@/components/ccr/ComplianceCalendar";
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
type HrPerson = { id: number; name: string; title: string; department: string; manager: string; workerType: "Employee" | "Contractor"; classification: string; status: "Active" | "Onboarding" | "Restricted" | "Leave" | "Former"; startDate: string; schedule: string; email: string; credential: string; credentialExpiry: string; probationEnd: string; nextReview: string; ptoBalance: number; training: number; risk: string; healthPlan?: string; retirementPlan?: string; scheduledDays?: number; attendedDays?: number; separationDate?: string; separationReason?: string; rehireStatus?: string; lastRoleChange?: string };
type TimeOffRequest = { id: number; employee: string; type: string; dates: string; hours: number; coverage: string; status: "Pending" | "Approved" | "Denied" };
type HrCase = { id: number; employee: string; type: string; opened: string; owner: string; status: "Open" | "In review" | "Resolved"; nextAction: string; confidential?: boolean };

type PersonnelFlag = { law: string; matched: string[]; reason: string; concern: string; source: string; severity: "Review" | "Urgent review" };

const modules = [
  { label: "Home", icon: Home }, { label: "Accounts", icon: Building2 },
  { label: "Account Management", icon: BriefcaseBusiness }, { label: "Sales CRM", icon: Target }, { label: "Finance", icon: WalletCards }, { label: "Timeclock", icon: Clock3 }, { label: "Work Orders", icon: Wrench },
  { label: "Compliance, Claims & Recovery", icon: Scale }, { label: "Vehicle Disposition & Sales", icon: Car },
  { label: "People & HR", icon: Users }, { label: "SOP Library", icon: BookOpen },
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



const personnelFlagRules: { law: string; terms: string[]; reason: string; concern: string; source: string; severity: PersonnelFlag["severity"] }[] = [
  { law: "FMLA / ADA / PWFA review", terms: ["surgery", "hospital", "serious health", "doctor", "medical", "pregnan", "birth", "treatment", "intermittent leave", "care for", "accommodation", "restriction"], reason: "The note may describe protected leave, pregnancy-related needs, disability, or a request for workplace change.", concern: "Pause the final personnel action; collect coverage, service, hours, worksite, essential-function, and leave/accommodation facts in the restricted workflow.", source: "https://www.dol.gov/agencies/whd/fmla", severity: "Urgent review" },
  { law: "USERRA employment review", terms: ["military", "national guard", "reserve", "drill", "deployment", "orders", "active duty", "service member"], reason: "Military service language may affect discrimination, leave, benefit, reemployment, or retaliation duties.", concern: "Route the employment decision for USERRA review. SCRA is shown separately only when an external civil, financial, or licensing matter may also be involved.", source: "https://www.dol.gov/agencies/vets/programs/userra", severity: "Urgent review" },
  { law: "Harassment / discrimination / retaliation review", terms: ["harass", "sexual", "discriminat", "retaliat", "reported", "complain", "race", "religion", "sex", "age", "disability", "witness"], reason: "The entry may describe protected status, a complaint, participation in an investigation, or possible retaliation.", concern: "Open restricted intake, preserve evidence, assign a response owner outside the reporting chain when needed, and review any adverse action before it is issued.", source: "https://www.twc.texas.gov/programs/civil-rights/employment-discrimination", severity: "Urgent review" },
  { law: "FLSA / Texas Payday Law review", terms: ["unpaid", "overtime", "off the clock", "deduction", "final paycheck", "shorted", "wage", "timecard"], reason: "Pay, working-time, deduction, or final-pay language may require wage-and-hour review.", concern: "Preserve schedules and time records and route the item to Finance/HR before the note becomes a final payroll or discipline decision.", source: "https://www.twc.texas.gov/services/employment-law", severity: "Review" },
  { law: "Workplace injury / safety review", terms: ["injured", "accident", "hurt at work", "workers comp", "osha", "unsafe"], reason: "The entry may describe a workplace injury or safety condition.", concern: "Start the safety and injury workflow, preserve witness and incident facts, and do not bury the event inside an ordinary coaching note.", source: "https://efte.twc.texas.gov/workplace_investigations_basics.html", severity: "Urgent review" },
];

function scanPersonnelText(value: string): PersonnelFlag[] {
  const text = value.toLowerCase();
  if (!text.trim()) return [];
  return personnelFlagRules.flatMap((rule) => {
    const matched = rule.terms.filter((term) => text.includes(term));
    return matched.length ? [{ law: rule.law, matched, reason: rule.reason, concern: rule.concern, source: rule.source, severity: rule.severity }] : [];
  });
}



const initialHrPeople: HrPerson[] = [
  { id: 1, name: "Austin Koska", title: "Director of Operations", department: "Operations", manager: "Jerson Arauz", workerType: "Employee", classification: "Salary exempt", status: "Active", startDate: "2024-02-12", schedule: "Leadership schedule", email: "austin@company.example", credential: "Management role – no operator license", credentialExpiry: "N/A", probationEnd: "Completed", nextReview: "2026-10-02", ptoBalance: 56, training: 88, risk: "Six-month review due in 29 days" },
  { id: 2, name: "Alex Englert", title: "Director of Sales & Development", department: "Account Management & Sales", manager: "Jerson Arauz", workerType: "Employee", classification: "Salary exempt", status: "Active", startDate: "2024-08-05", schedule: "Field / office", email: "alex@company.example", credential: "Driver license verified", credentialExpiry: "2028-04-18", probationEnd: "Completed", nextReview: "2026-09-18", ptoBalance: 40, training: 94, risk: "No active restriction" },
  { id: 3, name: "Nessa Rios", title: "Office Administrator", department: "Dispatch", manager: "Austin Koska", workerType: "Employee", classification: "Hourly non-exempt", status: "Active", startDate: "2025-01-13", schedule: "Day dispatch", email: "nessa@company.example", credential: "VSF employee license", credentialExpiry: "2026-09-21", probationEnd: "Completed", nextReview: "2026-09-12", ptoBalance: 28, training: 92, risk: "License expires in 18 days" },
  { id: 4, name: "Dalila", title: "Overnight Dispatcher", department: "Dispatch", manager: "Austin Koska", workerType: "Employee", classification: "Hourly non-exempt", status: "Active", startDate: "2025-06-02", schedule: "Overnight dispatch", email: "dalila@company.example", credential: "VSF employee license", credentialExpiry: "2027-01-14", probationEnd: "Completed", nextReview: "2026-11-06", ptoBalance: 24, training: 86, risk: "Two training acknowledgments due" },
  { id: 5, name: "Gabrielle Jones", title: "Dispatcher", department: "Dispatch", manager: "Austin Koska", workerType: "Employee", classification: "Hourly non-exempt", status: "Onboarding", startDate: "2026-08-31", schedule: "Training schedule", email: "gabrielle@company.example", credential: "VSF employee application pending", credentialExpiry: "Pending", probationEnd: "2026-11-29", nextReview: "2026-09-30", ptoBalance: 0, training: 38, risk: "Activation gate incomplete" },
  { id: 6, name: "Jarif Garcia", title: "Dispatcher", department: "Dispatch", manager: "Austin Koska", workerType: "Employee", classification: "Hourly non-exempt", status: "Active", startDate: "2025-09-08", schedule: "Evening dispatch", email: "jarif@company.example", credential: "VSF employee license", credentialExpiry: "2027-03-10", probationEnd: "Completed", nextReview: "2026-10-14", ptoBalance: 16, training: 90, risk: "No active restriction" },
  { id: 7, name: "Wesley", title: "Tow Operator", department: "Towing", manager: "Austin Koska", workerType: "Contractor", classification: "Independent contractor – review due", status: "Restricted", startDate: "2025-04-21", schedule: "On call", email: "wesley@company.example", credential: "Tow operator authorization review", credentialExpiry: "Blocked", probationEnd: "N/A", nextReview: "2026-09-08", ptoBalance: 0, training: 71, risk: "Do not assign until credential and classification review are complete" },
  { id: 8, name: "Daniel", title: "Former Account Manager", department: "Account Management & Sales", manager: "Jerson Arauz", workerType: "Contractor", classification: "Former contractor record", status: "Former", startDate: "2024-03-04", schedule: "Separated", email: "Archived", credential: "Not applicable", credentialExpiry: "N/A", probationEnd: "N/A", nextReview: "N/A", ptoBalance: 0, training: 100, risk: "Former worker record", separationDate: "2025-11-14", separationReason: "Contract ended", rehireStatus: "Review before rehire" },
  { id: 9, name: "Cade", title: "Former Tow Operator", department: "Towing", manager: "Austin Koska", workerType: "Contractor", classification: "Former contractor record", status: "Former", startDate: "2024-10-07", schedule: "Separated", email: "Archived", credential: "Archived operator record", credentialExpiry: "Expired", probationEnd: "N/A", nextReview: "N/A", ptoBalance: 0, training: 82, risk: "Former worker record", separationDate: "2026-02-20", separationReason: "Contract ended", rehireStatus: "Eligible with credential review" },
  { id: 10, name: "Kelvin", title: "Former Tow Operator", department: "Towing", manager: "Austin Koska", workerType: "Contractor", classification: "Former contractor record", status: "Former", startDate: "2025-01-06", schedule: "Separated", email: "Archived", credential: "Archived operator record", credentialExpiry: "Expired", probationEnd: "N/A", nextReview: "N/A", ptoBalance: 0, training: 78, risk: "Former worker record", separationDate: "2026-04-11", separationReason: "Voluntary separation", rehireStatus: "Review before rehire" },
  { id: 11, name: "Aurrora", title: "Former Dispatcher", department: "Dispatch", manager: "Austin Koska", workerType: "Employee", classification: "Former hourly employee", status: "Former", startDate: "2025-02-17", schedule: "Separated", email: "Archived", credential: "Archived VSF record", credentialExpiry: "Expired", probationEnd: "Completed", nextReview: "N/A", ptoBalance: 0, training: 91, risk: "Former employee record", separationDate: "2026-05-09", separationReason: "Voluntary separation", rehireStatus: "Eligible" },
];

const initialTimeOff: TimeOffRequest[] = [
  { id: 1, employee: "Nessa Rios", type: "PTO", dates: "Sep 18–19, 2026", hours: 16, coverage: "Jarif confirmed day coverage", status: "Pending" },
  { id: 2, employee: "Dalila", type: "Unpaid time", dates: "Sep 11, 2026", hours: 8, coverage: "Overnight coverage not assigned", status: "Pending" },
  { id: 3, employee: "Alex Englert", type: "PTO", dates: "Aug 28, 2026", hours: 8, coverage: "Account follow-ups reassigned", status: "Approved" },
];

const initialHrCases: HrCase[] = [
  { id: 1, employee: "Wesley", type: "Credential / work restriction", opened: "2026-08-29", owner: "Austin Koska", status: "Open", nextAction: "Verify authorization and record assignment decision" },
  { id: 2, employee: "Dispatch team", type: "Attendance pattern review", opened: "2026-09-01", owner: "Austin Koska", status: "In review", nextAction: "Document schedule records and manager findings" },
  { id: 3, employee: "Restricted record", type: "Employee accommodation", opened: "2026-08-18", owner: "Jerson Arauz", status: "Open", nextAction: "Executive access only", confidential: true },
];
function stringValue(value: CellValue | FormDataEntryValue | undefined, empty = "—") {
  if (value === null || value === undefined || value === "") return empty;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replace("T00:00:00", "");
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
function Metric({ value, label, tone = "blue" }: { value: string; label: string; tone?: string }) { return <div className="metric"><span className={tone}><Activity size={18} /></span><div><strong>{value}</strong><small>{label}</small></div></div>; }

function Field({ label, value }: { label: string; value: CellValue | undefined }) { return <div className="field"><small>{label}</small><b>{stringValue(value)}</b></div>; }
function Heading({ title, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="heading"><div><h1>{title}</h1></div>{action}</div>; }

export default function CommandPost() {
  const [activeModule, setActiveModule] = useState("Home");
  const [workspaceTarget, setWorkspaceTarget] = useState<{tab?:string;section?:string;person?:string;date?:string;department?:string}>({});
  const [sessionViewer,setSessionViewer]=useState<Viewer|undefined>(undefined),[sessionError,setSessionError]=useState('');
  useEffect(()=>{const load=()=>{void fetch('/api/session').then(async res=>{const b=await res.json() as {viewer:Viewer;error:string;email:string};if(!res.ok)throw new Error(b.error+(b.email?' Signed in as '+b.email:''));setSessionViewer(b.viewer);setSessionError('');}).catch(e=>setSessionError(e.message));};load();const refresh=()=>{if(document.visibilityState==='visible')load();};document.addEventListener('visibilitychange',refresh);return()=>document.removeEventListener('visibilitychange',refresh);},[]);

  useEffect(() => { const timer=window.setTimeout(()=>{const chosen=new URLSearchParams(window.location.search).get("module");if(chosen&&modules.some(m=>m.label===chosen))setActiveModule(chosen);},0);return()=>clearTimeout(timer); }, []);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProperty, setSelectedProperty] = useState("Wildhorse Flats");
  const [accountsView, setAccountsView] = useState<"directory" | "property" | "tools">("directory");
  const [accountsTab, setAccountsTab] = useState("overview");
  const [managerTab, setManagerTab] = useState("today");
  const [genericOpen, setGenericOpen] = useState("");
  const [toast, setToast] = useState("");
  const [hrTab, setHrTab] = useState("people");
  const [hrPeople] = useState<HrPerson[]>(initialHrPeople);
  const [personOpen, setPersonOpen] = useState(false);
  const [timeOffRequests] = useState<TimeOffRequest[]>(initialTimeOff);
  const [hrCases, setHrCases] = useState<HrCase[]>(initialHrCases);
  const [verifiedCredentials, setVerifiedCredentials] = useState<Record<number, boolean>>({});
  const [personnelEntryType, setPersonnelEntryType] = useState("Performance evaluation");
  const [personnelDraft, setPersonnelDraft] = useState("");
  const [, setFinanceTab] = useState("home");
  const [salesTab, setSalesTab] = useState("pipeline");
  const [caseTab, setCaseTab] = useState("command");
  const [caseStatuses, setCaseStatuses] = useState<Record<string, string>>({});
  const [caseSubTab, setCaseSubTab] = useState("hearings");
  const [workOrderTab, setWorkOrderTab] = useState("dashboard");
  const [sopTab, setSopTab] = useState("library");
  const [sopSearch, setSopSearch] = useState("");
  const [sopStatuses, setSopStatuses] = useState<Record<string, string>>({});

  const [sharedAccounts,setSharedAccounts]=useState<AccountRow[]>([]);
  useEffect(()=>{if(!sessionViewer)return;const refresh=()=>{void requestJson<{records:AccountRow[]}>('/api/accounts?surface='+ (canAccess(sessionViewer,'Account Management')?'manager':'dispatch')).then(r=>setSharedAccounts(r.records)).catch(()=>setSharedAccounts([]));};refresh();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[sessionViewer]);
  const pendingAccountActions=accountQueue(sharedAccounts).filter(r=>r.assignee===sessionViewer?.person&&!!actionDate(r)&&actionDate(r)<=accountToday()).length;
  const visibleSearchResults=searchTerm.trim()?sharedAccounts.filter(r=>r.kind==='account'&&r.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0,8).map(r=>({label:r.name,module:canAccess(sessionViewer,'Account Management')?'Account Management':'Accounts',detail:String(r.service||'')})):[];
  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }
  function navigate(label: string, tab?: string, section?: string, selection?:{person?:string;date?:string;department?:string;account?:string}) {
    if (!canAccess(sessionViewer,label,tab)) return;
    if(selection?.account){setSelectedProperty(selection.account);setAccountsView('property');}else if(['Accounts','Account Management'].includes(label)&&tab){setAccountsView('directory');}
    setWorkspaceTarget({tab,section,person:selection?.person,date:selection?.date,department:selection?.department});
    if(tab){
      if(label==='Accounts')setAccountsTab(tab);
      if(label==='Account Management')setManagerTab(tab);
      if(label==='Sales CRM')setSalesTab(tab);
      if(label==='People & HR')setHrTab(tab);
      if(label==='Work Orders')setWorkOrderTab(tab);
      
      if(label==='SOP Library')setSopTab(tab);
      if(label==='Compliance, Claims & Recovery')setCaseTab(tab);
    }
    setActiveModule(label); setMobileNav(false); setSearchTerm("");
  }
  function openCompliance(tab = "compliance") { setCaseTab("compliance"); setCaseSubTab(tab === "licenses" || tab === "evidence" || tab === "calendar" || tab === "people" ? tab : "calendar"); navigate("Compliance, Claims & Recovery"); }
  function resolveHrCase(id: number) { setHrCases((current) => current.map((item) => item.id === id ? { ...item, status: "Resolved", nextAction: "Resolution note and evidence recorded" } : item)); showToast("HR case resolved with an audit entry."); }
  const content = activeModule === "Accounts" ? <AccountHub initialTab={accountsTab} initialAccount={accountsView==="property"?selectedProperty:""} /> : activeModule === "Account Management" ? <AccountWorkspace initialAccount={accountsView==="property"?selectedProperty:""} initialTab={managerTab} onOpen={navigate} /> : renderOtherModule(activeModule);

  return <div className="shell">
    <aside className={`side ${mobileNav ? "open" : ""}`}><div className="brand"><span><ShieldCheck size={20} /></span><div><b>Command Post</b><small>Company Operations</small></div></div><nav aria-label="Main navigation">{modules.filter(m=>canAccess(sessionViewer,m.label)).map(({ label, icon: Icon }) => <button key={label} className={activeModule === label ? "active" : ""} onClick={() => { if (label === "Accounts") setAccountsView("directory"); if (label === "Account Management") { setManagerTab("today"); setAccountsView("directory"); } navigate(label); }}><i><Icon size={19} /></i>{label === "Accounts" ? "Account Hub" : label}{label === "Account Management" && pendingAccountActions > 0 && <em>{pendingAccountActions}</em>}</button>)}</nav><button className="issue" onClick={() => setGenericOpen("Report software issue")}><MessageSquareText size={15} /> Report software issue</button></aside>
    {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <div className="stage"><header className="top"><button className="hamb" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu /></button><div className="search"><Search size={20} /><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search properties..." />{visibleSearchResults.length > 0 && <div className="results">{visibleSearchResults.map((result, index) => <button key={`${result.label}-${index}`} onClick={() => { if (["Accounts","Account Management"].includes(result.module)) { setSelectedProperty(result.label); setAccountsView("property"); }  navigate(result.module); }}><Pill>{result.module==='Accounts'?'Account Hub':result.module}</Pill><div><b>{result.label}</b><small>{result.detail}</small></div></button>)}</div>}</div><Notifications key={sessionViewer?.person||'guest'} onOpen={navigate}/>{sessionViewer&&<TimeclockStatus viewer={sessionViewer}/>}<UserSettingsMenu viewer={sessionViewer}/></header>{sessionViewer&&<SafetyCenter key={sessionViewer.person}/>}<main>{!sessionViewer?<div className="f-loading"><h2>{sessionError?'Account access':'Loading your account…'}</h2>{sessionError&&<><p>{sessionError}</p><a className="f-button primary" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in with company email</a><a className="f-button" href="/signout-with-chatgpt?return_to=/" target="_top">Switch account</a></>}</div>:!canAccess(sessionViewer,activeModule)?<div className="f-loading"><h2>Choose an available module</h2><p>Your assigned modules are in the menu.</p></div>:<AccessScope viewer={sessionViewer} module={activeModule}>{content}</AccessScope>}</main></div>
    
    

    
    {personOpen&&<HireSetup onClose={()=>setPersonOpen(false)}/>}
    
    <Dialog open={Boolean(genericOpen)} onOpenChange={(open) => !open && setGenericOpen("")}><DialogContent><DialogHeader><DialogTitle>{genericOpen}</DialogTitle><DialogDescription className="sr-only">New record</DialogDescription></DialogHeader><div className="dialogForm"><label className="wide"><span>Summary *</span><Input placeholder="Enter a clear title" /></label><label className="wide"><span>Details *</span><Textarea placeholder="Record the facts, owner, deadline, and desired outcome." /></label></div><DialogFooter><Button variant="outline" onClick={() => setGenericOpen("")}>Cancel</Button><Button onClick={() => { setGenericOpen(""); showToast("Record saved for this session."); }}>Save record</Button></DialogFooter></DialogContent></Dialog>
    {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
  </div>;

  function renderOtherModule(label: string) {
    if (label === "Home") return <HomeWorkspace onOpen={navigate} />;
    if (label === "Work Orders") return <WorkOrdersWorkspace initialTab={workOrderTab} onOpen={navigate} />;
    if (label === "People & HR") return <PeopleHr />;
    if (label === "Sales CRM") return <SalesWorkspace initialTab={salesTab} onOpen={navigate} />;
    if (label === "Admin") return <UserAccessWorkspace />;
    if (label === "Finance") return <FinanceWorkspace key={"finance"+workspaceTarget.tab+workspaceTarget.section} initialTab={workspaceTarget.tab} initialSection={workspaceTarget.section} />;
    if (label === "Timeclock") return <TimeclockWorkspace key={"timeclock"+JSON.stringify(workspaceTarget)} initialView={workspaceTarget.tab} initialPerson={workspaceTarget.person} initialWeek={workspaceTarget.date} initialDepartment={workspaceTarget.department} />;
    if (label === "Compliance, Claims & Recovery") return <ComplianceClaims />;
    if (label === "Vehicle Disposition & Sales") return <VehicleDispositionWorkspace />;
    if (label === "SOP Library") return <SopLibrary />;
    const moduleCopy: Record<string, { subtitle: string; metrics: [string, string, string?][]; items: { title: string; detail: string; status: string }[] }> = {
      "People & HR": { subtitle: "Employees, contractors, onboarding, performance, discipline, losses, and recognition.", metrics: [["19", "Active people"], ["3", "Onboarding", "orange"], ["4", "On probation", "purple"], ["4", "Six-month reviews"]], items: [{ title: "Austin Koska", detail: "Operations Director · reports to Jerson", status: "Active" }, { title: "Alex Englert", detail: "Director of Sales & Development", status: "Active" }, { title: "Nessa Rios", detail: "Permit Specialist / Dispatcher", status: "License due" }] },
      "SOP Library": { subtitle: "Company and position procedures with versioned acknowledgements.", metrics: [["98", "Published SOPs"], ["6", "Acknowledgements due", "orange"], ["4", "Draft revisions", "purple"], ["100%", "Version history", "green"]], items: [{ title: "Dispatcher Duties Checklist", detail: "Dispatch · current version", status: "Current" }, { title: "Company Debit / Credit Card Policy", detail: "Assigned roles", status: "Acknowledged" }, { title: "Damage & Loss Agreement", detail: "Drivers and contractors", status: "Assigned" }] },
      Admin: { subtitle: "Users, permissions, reporting lines, integrations, system settings, and audit controls.", metrics: [["19", "Active users"], ["12", "Role templates"], ["3", "Connected services", "teal"], ["0", "Audit gaps", "green"]], items: [{ title: "Users & access", detail: "Role and tab-level permissions", status: "19 active" }, { title: "Reporting lines", detail: "Supervisor-by-position relationships", status: "Current" }, { title: "Integration access", detail: "Towbook, Gmail, and financial connection permissions", status: "Controlled" }, { title: "Document templates", detail: "18 approved templates", status: "Current" }] },
    };
    const config = moduleCopy[label] ?? moduleCopy.Admin;
    return <><Heading title={label} subtitle={config.subtitle} action={<Button onClick={() => setGenericOpen(`New ${label} record`)}><Plus /> New record</Button>} /><div className="metrics four">{config.metrics.map(([value, metricLabel, tone]) => <Metric key={metricLabel} value={value} label={metricLabel} tone={tone} />)}</div><div className="grid3"><SectionCard title="Required actions">{config.items.map((item) => <button className="row" key={item.title} onClick={() => setGenericOpen(item.title)}><span className={`dot ${toneFor(item.status)}`} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><Pill>{item.status}</Pill></button>)}</SectionCard><SectionCard title="Selected record"><div className="recordTitle"><div><h3>{config.items[0].title}</h3><p>{config.items[0].detail}</p></div><Pill>{config.items[0].status}</Pill></div><div className="details"><Field label="Owner" value="Jerson" /><Field label="Next action" value="Review and document outcome" /><Field label="Audit history" value="Enabled" /><Field label="Resolution required" value="Yes" /></div><div className="actions"><Button variant="outline" onClick={() => setGenericOpen("Add update")}>Add update</Button><Button onClick={() => setGenericOpen("Complete with resolution")}>Complete with resolution</Button></div></SectionCard><SectionCard title="Activity"><div className="noticeCopy"><p><b>Every meaningful action is operational.</b></p><p>Forms update the current demo session and preserve the workflow structure required for production storage.</p><p>Completion requires ownership, outcome, evidence, and a timestamped resolution.</p></div></SectionCard></div></>;
  }


  function ComplianceClaims() {
    const caseQueue = [
      { id: "LIC-201", area: "Credential expiry", title: "Nessa Rios · VSF employee license", due: "Sep 21", owner: "Austin", status: caseStatuses["LIC-201"] ?? "Expires soon", tab: "licenses", detail: "License renewal requires verified evidence before VSF assignment can continue." },
      { id: "LIC-204", area: "Restricted assignment", title: "Wesley · Tow operator authorization", due: "Sep 8", owner: "Austin", status: caseStatuses["LIC-204"] ?? "Restricted", tab: "licenses", detail: "Do not assign until credential and classification review are complete." },
      { id: "TH-118", area: "Tow hearing", title: "Hearing notice · VSF-1047", due: "Sep 4", owner: "Jerson", status: caseStatuses["TH-118"] ?? "Needs review", tab: "hearings", detail: "Court notice, evidence packet, witness prep, and ruling follow-up remain in one record." },
      { id: "TDLR-031", area: "TDLR complaint", title: "Agency response · complaint #4471", due: "Sep 3", owner: "Jerson", status: caseStatuses["TDLR-031"] ?? "Response due", tab: "tdlr", detail: "Complaint, deadline, evidence packet, approved response, delivery, and disposition remain immutable." },
      { id: "DMG-207", area: "Damage claim", title: "Alleged door damage · Camry", due: "Sep 6", owner: "Alex", status: caseStatuses["DMG-207"] ?? "Investigating", tab: "damage", detail: "Claimant statement, photos, tow authority, and determination remain linked to the account record." },
      { id: "CB-092", area: "Chargeback recovery", title: "$3,450 recovery · Cole", due: "Sep 5", owner: "Jerson", status: caseStatuses["CB-092"] ?? "Demand delivered", tab: "recovery", detail: "Processor loss, approved demand, mailing evidence, property risk, cash receipt, and deposit match." },
    ];
    const completeCaseStep = (id: string, status: string, message: string) => { setCaseStatuses((current) => ({ ...current, [id]: status })); showToast(message); };
    const openQueueItem = (item: typeof caseQueue[number]) => {
      if (['hearings', 'tdlr', 'damage', 'recovery'].includes(item.tab)) {
        setCaseTab('cases'); setCaseSubTab(item.tab);
      } else if (['licenses', 'evidence', 'calendar', 'people'].includes(item.tab)) {
        setCaseTab('compliance'); setCaseSubTab(item.tab);
      } else { setCaseTab(item.tab); }
    };
    return <div className="caseWorkspace">
      <Heading title="Compliance, Claims & Recovery" subtitle="Regulatory readiness and every issue it can produce — licenses, inspections, hearings, claims, complaints, chargebacks, evidence, and recovery · in one controlled workspace." action={<div className="headingActions"><Button variant="outline" onClick={() => setCaseTab("compliance")}><FileCheck2 /> Inspection readiness</Button><Button onClick={() => setCaseTab("incidents")}><Plus /> New incident</Button></div>} />

      <Tabs value={caseTab} onValueChange={setCaseTab} className="caseTabsRoot">
        <TabsList className="caseTabs">
          <TabsTrigger value="command">Overview</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="cases">Cases</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
        </TabsList>

        <TabsContent value="command" className="caseTabBody"><div className="caseFocus"><div><div className="eyebrow">RISK AND CASE WORK QUEUE</div><h2>Prevent the next case and resolve the open ones</h2></div><Pill tone="red">6 require action</Pill></div><div className="financeMetricGrid"><article><span><AlertTriangle /></span><small>Compliance deadlines</small><b>7</b><em>3 within 30 days</em></article><article><span><Scale /></span><small>Open hearings / complaints</small><b>4</b><em>Next response due tomorrow</em></article><article><span><FileCheck2 /></span><small>Evidence gaps</small><b>2</b><em>Closure blocked</em></article><article><span><HandCoins /></span><small>Recovery outstanding</small><b>$3,450</b><em>Processor loss not final business loss</em></article></div><SectionCard title="Priority queue"><div className="caseQueue">{caseQueue.map((item) => <button key={item.id} onClick={() => openQueueItem(item)}><span className={`priorityBar ${toneFor(item.status)}`} /><div><b>{item.title}</b><small>{item.id} · {item.area} · Owner {item.owner}</small><p>{item.detail}</p></div><span><Pill>{item.status}</Pill><em>Due {item.due}</em></span><ChevronRight /></button>)}</div></SectionCard></TabsContent>

        <TabsContent value="compliance" className="caseTabBody">
          <div className="caseSubNav"><button className={caseSubTab==='calendar'?'active':''} onClick={()=>setCaseSubTab('calendar')}>Compliance calendar</button><button className={caseSubTab==='licenses'?'active':''} onClick={()=>setCaseSubTab('licenses')}>Licenses & testing</button><button className={caseSubTab==='evidence'?'active':''} onClick={()=>setCaseSubTab('evidence')}>Inspection & evidence</button><button className={caseSubTab==='people'?'active':''} onClick={()=>setCaseSubTab('people')}>Personnel review</button></div>
          {caseSubTab==='calendar' && <ComplianceCalendar />}
          {caseSubTab==='licenses' && <><div className="caseFocus"><div><div className="eyebrow">WORK ELIGIBILITY CONTROLS</div><h2>Licenses, MVRs, testing, and assignment restrictions</h2></div><Button onClick={() => setCaseSubTab('calendar')}><Target /> Compliance calendar</Button></div><div className="caseTwo"><SectionCard title="Credential exceptions"><div className="caseControlList">{caseQueue.filter((item) => item.tab === "licenses").map((item) => <article key={item.id}><div><IdCard /><span><b>{item.title}</b><small>{item.detail}</small><em>Due {item.due} · Owner {item.owner}</em></span></div><Pill>{item.status}</Pill><Button size="sm" onClick={() => completeCaseStep(item.id, "Verified", `${item.title} marked verified with an audit entry.`)}>Verify evidence</Button></article>)}</div></SectionCard><SectionCard title="Random selection control"><div className="randomTesting"><div><span><b>20</b><small>Eligible pool</small></span><span><b>5</b><small>Annual 25% target</small></span><span><b>2</b><small>Already tested</small></span><span><b>3</b><small>Remaining</small></span></div><p>The eligible pool locks before selection. Exclusions require a reason. The random method, selected names, notification, and result status are immutable audit events.</p></div></SectionCard></div><SectionCard title="Assignment effects"><div className="dataTableWrap"><table className="dataTable"><thead><tr><th>Person / asset</th><th>Requirement</th><th>Status</th><th>Automatic effect</th><th>Clearance owner</th></tr></thead><tbody><tr><td><b>Nessa Rios</b></td><td>VSF employee license</td><td><Pill>{caseStatuses["LIC-201"] ?? "Expires soon"}</Pill></td><td>Block VSF work after Sep 21 if not verified</td><td>Austin</td></tr><tr><td><b>Wesley</b></td><td>Tow operator authorization</td><td><Pill>{caseStatuses["LIC-204"] ?? "Restricted"}</Pill></td><td>Do not assign until cleared</td><td>Austin</td></tr></tbody></table></div></SectionCard></>}
          {caseSubTab==='evidence' && <><div className="caseFocus"><div><div className="eyebrow">INSPECTION READINESS</div><h2>Evidence packet and gap control</h2></div></div><div className="evidenceGrid">{[["Company and VSF licenses", "Current", "Sep 2"], ["Employee licenses and assignment roster", "2 gaps", "Sep 3"], ["Insurance policies and vehicle schedules", "Current", "Aug 29"], ["Tow logs, notices, and release records", "Current", "Sep 3"], ["Random-testing pool and selection history", "Due", "Aug 15"], ["Property agreements and authorization", "1 missing", "Sep 1"], ["Complaint and hearing response index", "Current", "Sep 3"], ["Training, CE, and SOP acknowledgments", "2 due", "Sep 2"]].map(([title, status, reviewed], index) => { const key = `EVID-${index}`; const current = caseStatuses[key] ?? status; return <article key={title}><div><FileCheck2 /><span><b>{title}</b><small>Last reviewed {reviewed}</small></span></div><Pill>{current}</Pill><Button size="sm" variant="outline" onClick={() => completeCaseStep(key, "Accepted", `${title} marked accepted.`)}>Review folder</Button></article>; })}</div><div className="resolutionGate"><LockKeyhole /><div><b>Resolution and inspection closure gate</b><span>A record cannot close while required evidence is missing, rejected, expired, unreviewed, or financially unreconciled. Override requires executive permission, reason, and audit history.</span></div><Pill>Enforced</Pill></div></>}
          {caseSubTab==='people' && <><div className="caseFocus"><div><div className="eyebrow">RESTRICTED PERSONNEL COMPLIANCE INTAKE</div><h2>Review flagged language before a people decision is finalized</h2></div><Button variant="outline" onClick={() => { setHrTab("performance"); navigate("People & HR"); }}><Users /> Return to HR record</Button></div><PersonnelComplianceReview /></>}
        </TabsContent>

        <TabsContent value="cases" className="caseTabBody">
          <div className="caseSubNav"><button className={caseSubTab==='hearings'?'active':''} onClick={()=>setCaseSubTab('hearings')}>Tow hearings</button><button className={caseSubTab==='tdlr'?'active':''} onClick={()=>setCaseSubTab('tdlr')}>TDLR complaints</button><button className={caseSubTab==='damage'?'active':''} onClick={()=>setCaseSubTab('damage')}>Damage claims</button><button className={caseSubTab==='recovery'?'active':''} onClick={()=>setCaseSubTab('recovery')}>Chargebacks & recovery</button></div>
          {caseSubTab==='hearings' && <CaseWorkflow title="Tow hearings" eyebrow="COURT AND HEARING CONTROL" description="Hearing notice, deadlines, tow and property evidence, witness preparation, appearance, ruling, cost, and follow-up remain in one case record." item={caseQueue.find((item) => item.id === "TH-118")!} steps={[["Hearing notice indexed", "Accepted"], ["Towbook record attached", "Accepted"], ["Property agreement and authorization", "Accepted"], ["Photos, notices, and location evidence", "Needs review"], ["Operator / witness preparation", "Scheduled"], ["Hearing outcome and financial effect", "Required"]]} onComplete={(status) => completeCaseStep("TH-118", status, "Tow-hearing record updated.")} />}
          {caseSubTab==='tdlr' && <CaseWorkflow title="TDLR complaints" eyebrow="REGULATORY RESPONSE" description="The complaint, response deadline, source documents, approved response, delivery confirmation, agency follow-up, and final disposition remain immutable." item={caseQueue.find((item) => item.id === "TDLR-031")!} steps={[["Complaint and deadline indexed", "Accepted"], ["Legal / executive owner assigned", "Accepted"], ["Tow and property evidence packet", "In review"], ["Approved response language", "Required"], ["Submission / delivery evidence", "Required"], ["Agency disposition and corrective action", "Open"]]} onComplete={(status) => completeCaseStep("TDLR-031", status, "TDLR complaint record updated.")} />}
          {caseSubTab==='damage' && <AccountWorkspace surface="claims" />}
          {caseSubTab==='recovery' && <CaseWorkflow title="Chargebacks and recovery" eyebrow="PROCESSOR LOSS TO CASH RECOVERY" description="A lost processor dispute is not treated as the final business outcome. Evidence, approved demand, delivery, property risk, payment, receipt, deposit, and closure remain linked." item={caseQueue.find((item) => item.id === "CB-092")!} steps={[["Processor dispute and loss indexed", "Accepted"], ["Tow authorization and evidence packet", "Accepted"], ["Executive-approved demand template", "Accepted"], ["DocuPost submission", "Accepted"], ["USPS movement / delivery evidence", "Delivered"], ["Property / leasing-office risk plan", "Active"], ["Cash payment appointment", "Awaiting payment"], ["Receipt and deposit reconciliation", "Blocked"], ["Financial recovery and resolution note", "Required"]]} onComplete={(status) => completeCaseStep("CB-092", status, "Chargeback recovery record updated.")} />}
        </TabsContent>

        <TabsContent value="incidents" className="caseTabBody"><CcrPanel /></TabsContent>
      </Tabs>
    </div>;
  }
  function CaseWorkflow({ title, eyebrow, item, steps, onComplete }: { title: string; eyebrow: string; description: string; item: { id: string; title: string; due: string; owner: string; status: string; detail: string }; steps: string[][]; onComplete: (status: string) => void }) {
    return <><div className="caseFocus"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div><Button onClick={() => setCaseTab("incidents")}><Plus /> New incident</Button></div><div className="caseRecordHeader"><div><Scale /><span><small>{item.id}</small><b>{item.title}</b><em>{item.detail}</em></span></div><Pill>{caseStatuses[item.id] ?? item.status}</Pill><span><b>Due {item.due}</b><small>Owner {item.owner}</small></span></div><div className="caseTwo"><SectionCard title="Workflow and evidence"><div className="caseSteps">{steps.map(([label, baseStatus], index) => { const key = `${item.id}-${index}`; const status = caseStatuses[key] ?? baseStatus; return <article key={label}><i>{index + 1}</i><div><b>{label}</b></div><Pill>{status}</Pill><Button size="sm" variant="outline" onClick={() => { setCaseStatuses((current) => ({ ...current, [key]: "Accepted" })); showToast(`${label} marked accepted.`); }}>Review</Button></article>; })}</div></SectionCard><SectionCard title="Resolution controls"><div className="resolutionPanel"><ShieldCheck /><h3>Closure requires a documented outcome</h3><p>Finding, decision, communication, evidence, financial impact, payment or recovery status, owner, and timestamped resolution note are mandatory.</p><Button onClick={() => onComplete("Resolved with evidence")}>Complete with resolution</Button></div></SectionCard></div></>;
  }

  // Retained as a legacy rendering fallback while saved sessions migrate to Slack.
  function PersonnelComplianceReview() {
    const flags = scanPersonnelText(personnelDraft);
    return <section className="legalFlagPanel"><header><div><div className="eyebrow">LIVE PERSONNEL REVIEW ASSIST</div><h3>Personnel note</h3></div><Pill tone={flags.length ? "red" : "green"}>{flags.length ? `${flags.length} review flag${flags.length === 1 ? "" : "s"}` : "No trigger detected"}</Pill></header><div className="personnelEntryGrid"><label><span>ENTRY TYPE</span><select value={personnelEntryType} onChange={(event) => setPersonnelEntryType(event.target.value)}>{["Performance evaluation", "Write-up / discipline", "Positive coaching", "Manager feedback", "Personnel note"].map((type) => <option key={type}>{type}</option>)}</select></label><label><span>EMPLOYEE OR CONTRACTOR</span><select defaultValue="Nessa Rios">{hrPeople.map((person) => <option key={person.id}>{person.name}</option>)}</select></label></div><label className="personnelDraft"><span>{personnelEntryType.toUpperCase()} DETAILS</span><Textarea value={personnelDraft} onChange={(event) => setPersonnelDraft(event.target.value)} placeholder="Describe observable facts, dates, expectations, employee response, positive feedback, or concern…" /></label>{flags.length > 0 ? <div className="flagCards">{flags.map((flag) => <article className={flag.severity === "Urgent review" ? "urgent" : ""} key={flag.law}><header><AlertTriangle /><b>{flag.law}</b><Pill>{flag.severity}</Pill></header><dl><div><dt>Matched language</dt><dd>{flag.matched.join(", ")}</dd></div><div><dt>Why it was flagged</dt><dd>{flag.reason}</dd></div><div><dt>Review concern</dt><dd>{flag.concern}</dd></div></dl><Button asChild size="sm" variant="outline"><a href={flag.source} target="_blank" rel="noreferrer">Official source <ExternalLink /></a></Button></article>)}</div> : <div className="flagClear"><CheckCircle2 /><div><b>No configured phrase triggered a separate review</b><span>A manager must still document facts and use judgment. The scanner does not approve the entry or replace HR/legal review.</span></div></div>}<footer><Button variant="outline" onClick={() => showToast("Personnel entry saved as a draft.")}>Save draft</Button><Button disabled={flags.length === 0} onClick={() => { setCaseTab("people"); navigate("Compliance, Claims & Recovery"); showToast("Restricted review opened with the flagged language and source links."); }}><ShieldCheck /> Send to restricted review</Button><Button disabled={flags.length > 0} onClick={() => showToast("Entry finalized with manager, timestamp, and audit history.")}>Finalize entry</Button></footer></section>;
  }

  function PeopleHr() {
    const pendingTimeOff = timeOffRequests.filter((request) => request.status === "Pending").length;


    const credentialRows = [
      { id: 3, person: "Nessa Rios", item: "VSF employee license", expires: "Sep 21, 2026", status: verifiedCredentials[3] ? "Verified" : "Expires soon", effect: "Block VSF work after expiration" },
      { id: 5, person: "Gabrielle Jones", item: "VSF application / temporary authority", expires: "Pending", status: verifiedCredentials[5] ? "Verified" : "Missing", effect: "Not assignment-ready" },
      { id: 7, person: "Wesley", item: "Tow operator authorization", expires: "Review due now", status: verifiedCredentials[7] ? "Verified" : "Blocked", effect: "Do not assign towing work" },
      { id: 4, person: "Dalila", item: "Annual role training", expires: "Sep 14, 2026", status: verifiedCredentials[4] ? "Verified" : "2 acknowledgments due", effect: "Escalate after deadline" },
    ];
    const tabLabels: [string, string][] = [["people", "People"], ["employment", "Employment"], ["pay", "Pay & time"], ["performance", "Performance"], ["compliance", "Compliance & records"], ["offboarding", "Offboarding"]];

    return <div className="hrWorkspace">
      <Heading title="People & HR" subtitle="The employee lifecycle, manager work, confidential records, and payroll-ready changes in one controlled workspace." action={<div className="headingActions"><Button variant="outline" onClick={() => showToast("Roster export started — the file will download shortly.")}><Download /> Export roster</Button>{canAccess(sessionViewer,'People & HR','hiring',true)&&<Button onClick={() => setPersonOpen(true)}><UserPlus /> New hire</Button>}</div>} />

      <Tabs value={hrTab} onValueChange={setHrTab} className="hrTabsRoot"><TabsList className="hrTabs">{tabLabels.map(([value, label]) => <TabsTrigger key={value} value={value}>{label}{value === "pay" && pendingTimeOff > 0 && <em>{pendingTimeOff}</em>}</TabsTrigger>)}</TabsList>
        {/* People: directory + org chart merged */}
        <TabsContent value="people" className="hrTabBody"><PeopleDirectory key={"people"+String(personOpen)} mode="people" /></TabsContent>

        {/* Employment: hiring, org, promotions/changes, offboarding */}
        <TabsContent value="employment" className="hrTabBody">
          <PeopleDirectory key={"hiring"+String(personOpen)} mode="hiring" />
        </TabsContent>

        {/* Pay & time: pay agreements + schedule/attendance */}
        <TabsContent value="pay" className="hrTabBody">
          <PeopleDirectory mode="pay" />
          <div style={{ marginTop: '1.5rem' }}><TimeclockWorkspace initialView="Schedule" /></div>
        </TabsContent>

        <TabsContent value="performance" className="hrTabBody">
          <div className="hrIntro"><div><div className="eyebrow">PERFORMANCE, BENEFITS AND CHANGES</div><h2>Reviews, goals, benefits, and role history</h2></div><Button onClick={() => { setHrTab("people"); showToast("Open an employee record in the People tab to start a review."); }}><Plus /> Start review</Button></div>
          <PersonnelComplianceReview />
          <div className="metrics four"><Metric value="4" label="Reviews due" tone="orange" /><Metric value="3" label="Health plan enrolled" /><Metric value="2" label="Promotions this year" tone="green" /><Metric value="6" label="Open goals" /></div>
          <div className="hrTwo"><SectionCard title="Review cycle"><div className="hrReviewRows">{[["Nessa Rios", "Six-month review", "Sep 12", "Austin", "Draft"], ["Alex Englert", "Six-month review", "Sep 18", "Jerson", "Not started"], ["Austin Koska", "Six-month review", "Oct 2", "Jerson", "Not started"], ["Gabrielle Jones", "30-day onboarding review", "Sep 30", "Austin", "Scheduled"]].map(([person, type, due, owner, status]) => <article key={person}><div><b>{person}</b><span>{type} Due {due}</span><small>Manager: {owner}</small></div><Pill>{status}</Pill><Button size="sm" variant="outline" onClick={() => showToast(String(person) + ": open their record in the People tab.")}>Open review</Button></article>)}</div></SectionCard><SectionCard title="Manager tools"><div className="hrToolGrid"><button onClick={() => showToast("1:1 meeting notes: open the employee record in the People tab to log meeting outcomes.")}><MessageSquareText /><b>1:1 meeting</b><small>Agenda, discussion, commitments, next check-in</small></button><button onClick={() => showToast("Open the employee record in the People tab.")}><Gauge /><b>Goals</b><small>Measure, owner, due date, progress, outcome</small></button><button onClick={() => showToast("Open the employee record in the People tab.")}><HeartHandshake /><b>Coaching</b><small>Observed behavior, expectation, support, follow-up</small></button><button onClick={() => showToast("Open the employee record in the People tab.")}><CheckCircle2 /><b>Recognition</b><small>Achievement, impact, date, visibility</small></button></div></SectionCard></div>
          <SectionCard title="Role and promotion history"><div className="dataTableWrap"><table className="dataTable"><thead><tr><th>Person</th><th>Change</th><th>Prior role</th><th>New role</th><th>Reason</th><th>Effective</th><th>Status</th></tr></thead><tbody><tr><td><b>Austin Koska</b></td><td>Promotion</td><td>Operations Manager</td><td>Operations Director</td><td>Expanded ownership</td><td>Aug 24, 2026</td><td><Pill>Effective</Pill></td></tr><tr><td><b>Alex Englert</b></td><td>Promotion</td><td>Account Manager</td><td>Director of Sales</td><td>Sales leadership added</td><td>Aug 17, 2026</td><td><Pill>Effective</Pill></td></tr><tr><td><b>Gabrielle Jones</b></td><td>New hire</td><td>Candidate</td><td>Dispatcher</td><td>Approved opening</td><td>Aug 31, 2026</td><td><Pill>Probation</Pill></td></tr></tbody></table></div></SectionCard>
          <SectionCard title="Benefits enrollment"><div className="dataTableWrap"><table className="dataTable hrBenefitsTable"><thead><tr><th>Person</th><th>Worker type</th><th>Health plan</th><th>Retirement</th><th>Action</th></tr></thead><tbody>{hrPeople.filter((p) => p.status !== "Former").map((person, index) => { const health = person.workerType === "Contractor" ? "Not eligible" : index < 3 ? "Enrolled" : index === 3 ? "Waived" : "Needs confirmation"; const retirement = person.workerType === "Contractor" ? "Not eligible" : index < 2 ? "Enrolled" : "Not enrolled"; return <tr key={person.id}><td><b>{person.name}</b><small>{person.title}</small></td><td>{person.workerType}</td><td><Pill>{health}</Pill></td><td><Pill>{retirement}</Pill></td><td><Button size="sm" variant="outline" onClick={() => { setHrTab("people"); showToast("Open the employee record in the People tab to update benefits."); }}>Open</Button></td></tr>; })}</tbody></table></div></SectionCard>
        </TabsContent>

        <TabsContent value="compliance" className="hrTabBody">
          <div className="hrIntro"><div><div className="eyebrow">COMPLIANCE, RIGHTS AND RECORDS</div><h2>Licenses, leave, relations, and personnel files</h2></div><Button variant="outline" onClick={() => openCompliance("licenses")}><ShieldCheck /> Open compliance module</Button></div>
          <div className="hrTwo"><SectionCard title="Credential exceptions"><div className="hrCredentialRows">{credentialRows.map((item) => <article key={item.id}><div><IdCard /><span><b>{item.person}</b><small>{item.item} {item.expires}</small><em>Work effect: {item.effect}</em></span></div><Pill>{item.status}</Pill><Button size="sm" variant="outline" onClick={() => { setVerifiedCredentials((current) => ({ ...current, [item.id]: true })); showToast(item.item + " marked verified for this session."); }}>Mark verified</Button></article>)}</div></SectionCard><SectionCard title="Employee relations cases"><div className="hrCaseRows">{hrCases.map((item) => <article key={item.id}><div className="hrCaseIcon">{item.confidential ? <LockKeyhole /> : <MessageSquareText />}</div><div><b>{item.employee}</b><span>{item.type} Opened {item.opened}</span><small>{item.confidential ? "Details hidden at this permission level" : item.nextAction}</small></div><Pill>{item.status}</Pill><div><Button size="sm" variant="outline" onClick={() => showToast("Open the employee record to manage this item.")}>Open</Button>{item.status !== "Resolved" && !item.confidential && <Button size="sm" onClick={() => resolveHrCase(item.id)}>Resolve</Button>}</div></article>)}</div></SectionCard></div>
          <div className="hrRightsGrid"><article><header><HeartHandshake /><div><b>FMLA and leave</b><small>Coverage, eligibility, notices, certification, and restoration</small></div></header><p>Records employer coverage, service months, hours worked, qualifying reason, certification, leave use, and return steps.</p><div className="headingActions"><Button asChild size="sm" variant="outline"><a href="https://www.dol.gov/agencies/whd/fmla" target="_blank" rel="noreferrer">DOL guidance <ExternalLink /></a></Button><Button size="sm" onClick={() => { showToast("Open the employee record in the People tab to initiate a leave request."); }}>Start leave intake</Button></div></article><article><header><Users /><div><b>Harassment, discrimination and retaliation</b><small>Confidential reporting with restricted intake</small></div></header><p>Employees can report through HR, an owner, or the confidential form. Response record preserves safety, evidence, owner, and anti-retaliation follow-up.</p><div className="headingActions"><Button asChild size="sm" variant="outline"><a href="https://www.twc.texas.gov/programs/civil-rights/employment-discrimination" target="_blank" rel="noreferrer">TWC guidance <ExternalLink /></a></Button><Button size="sm" onClick={() => showToast("Open the employee record to manage this item.")}>Report concern</Button></div></article></div>
          <SectionCard title="Personnel record folders"><div className="hrRecordGrid"><article><div><BriefcaseBusiness /><span><b>Employment record</b><small>Application, offer, job description, changes</small></span></div><Pill>HR + executives</Pill><button onClick={() => showToast("Employment record: access is restricted to HR and executives.")}>Open folder</button></article><article><div><IdCard /><span><b>Form I-9</b><small>Separate controlled folder with calculated retention</small></span></div><Pill>Restricted</Pill><button onClick={() => showToast("I-9 folder: separately controlled with retention dates.")}>Open folder</button></article><article><div><ShieldCheck /><span><b>Screening and credentials</b><small>Background, drug tests, licenses, MVR</small></span></div><Pill>Restricted</Pill><button onClick={() => showToast("Open the People tab to access this folder.")}>Open folder</button></article><article><div><DollarSign /><span><b>Payroll and tax</b><small>Pay changes, W-4, time records, exports</small></span></div><Pill>Payroll access</Pill><button onClick={() => showToast("Open the People tab to access this folder.")}>Open folder</button></article></div></SectionCard>
        </TabsContent>

        <TabsContent value="offboarding" className="hrTabBody">
          <div className="hrIntro"><div><div className="eyebrow">CONTROLLED SEPARATION</div><h2>Offboarding and access recovery</h2></div><Button onClick={() => { setHrTab("people"); showToast("Select an employee in the People tab to begin an offboarding workflow."); }}><UserRoundX /> Start offboarding</Button></div>
          <div className="metrics four"><Metric value="0" label="Active separations" tone="green" /><Metric value="2" label="Former-person reviews" /><Metric value="0" label="Access recovery gaps" tone="green" /><Metric value="1" label="Retention review upcoming" tone="orange" /></div>
          <div className="hrTwo"><SectionCard title="Separation workflow"><div className="hrOffboarding">{[["Separation decision", "Reason, voluntary / involuntary type, approver, effective date"], ["Final schedule and pay", "Last worked time, approved expenses, deductions, final-pay instruction"], ["Access removal", "Command Post, email, Towbook, payment systems, property codes, keys"], ["Equipment and company property", "Vehicle, fuel card, phone, computer, uniforms, documents"], ["Benefits and required notices", "Applicable continuation, unemployment, and separation communications"], ["Record retention and reference rule", "Archive files, legal hold, rehire eligibility, approved verification response"]].map(([title, detail], index) => <button key={title} onClick={() => showToast(`${String(title)}: open the People tab to record this separation step on the employee record.`)}><span>{index + 1}</span><div><b>{title}</b><small>{detail}</small></div><Pill>{index === 0 ? "Start here" : "Required"}</Pill><ChevronRight /></button>)}</div></SectionCard><SectionCard title="Closure gate"><div className="hrResolution"><ShieldCheck /><h3>Separation cannot close with outstanding access or property</h3><p>All system access, facility access, company equipment, final-pay data, required notices, and personnel-record retention dates must have an owner and outcome.</p><div className="hrControlList"><span><CheckCircle2 /><b>Manager confirmation</b><small>Required</small></span><span><CheckCircle2 /><b>Payroll confirmation</b><small>Required</small></span><span><CheckCircle2 /><b>Admin access audit</b><small>Required</small></span></div></div></SectionCard></div>
        </TabsContent>
      </Tabs>
    </div>;
  }

  function SopLibrary() {
    const records = [
      { id: "SOP-DSP-001", title: "Dispatcher Duties Checklist", area: "Dispatch", version: "v4.2", owner: "Austin", audience: "Dispatchers", reviewed: "Aug 28, 2026", next: "Feb 28, 2027", status: "Published", due: "2 acknowledgments due" },
      { id: "SOP-VSF-004", title: "Vehicle Notice and VTR-265 Workflow", area: "Vehicle Disposition", version: "v3.1", owner: "Jerson", audience: "VSF staff", reviewed: "Sep 1, 2026", next: "Dec 1, 2026", status: "Published", due: "Current" },
      { id: "POL-HR-009", title: "Harassment Reporting and Anti-Retaliation", area: "People & HR", version: "v2.0", owner: "Jeidy", audience: "All workers", reviewed: "Aug 15, 2026", next: "Feb 15, 2027", status: "Published", due: "1 acknowledgment due" },
      { id: "SOP-AM-012", title: "Property Agreement and Signage Evidence", area: "Account Management", version: "v1.7", owner: "Alex", audience: "Accounts + Dispatch", reviewed: "Aug 30, 2026", next: "Nov 30, 2026", status: "Draft review", due: "Owner approval" },
    ].filter((record) => `${record.id} ${record.title} ${record.area} ${record.audience}`.toLowerCase().includes(sopSearch.toLowerCase()));
    return <><Heading title="SOP Library" subtitle="Version-controlled procedures, policies, forms, training assignments, acknowledgments, approvals, review dates, and immutable history." action={<Button onClick={() => { setSopStatuses((c) => ({ ...c, "new-draft": "Draft" })); showToast("New SOP draft opened · route it for review in the Workflow tab."); }}><Plus /> New SOP</Button>} /><Tabs value={sopTab} onValueChange={setSopTab}><TabsList variant="line" className="managerTabs"><TabsTrigger value="library">Library</TabsTrigger><TabsTrigger value="workflow">Workflow &amp; approvals</TabsTrigger><TabsTrigger value="resources">Resources &amp; templates</TabsTrigger></TabsList><TabsContent value="library"><div className="sopToolbar"><div className="miniSearch"><Search /><Input value={sopSearch} onChange={(event) => setSopSearch(event.target.value)} placeholder="Search title, ID, team, or audience" /></div><select defaultValue="All areas"><option>All areas</option><option>Dispatch</option><option>People &amp; HR</option><option>Account Management</option><option>Vehicle Disposition</option></select><Button variant="outline" onClick={() => showToast("SOP index export started.")}><Download /> Export index</Button></div><div className="sopLibraryGrid">{records.map((record) => <article key={record.id}><header><BookOpen /><div><small>{record.id} · {record.area}</small><b>{record.title}</b></div><Pill>{sopStatuses[record.id] ?? record.status}</Pill></header><dl><div><dt>Version</dt><dd>{record.version}</dd></div><div><dt>Owner</dt><dd>{record.owner}</dd></div><div><dt>Audience</dt><dd>{record.audience}</dd></div><div><dt>Last / next review</dt><dd>{record.reviewed} · {record.next}</dd></div></dl><footer><Pill>{record.due}</Pill><Button size="sm" variant="outline" onClick={() => showToast(`${record.id} version history: ${record.version} · ${record.reviewed}`)}>History</Button><Button size="sm" onClick={() => { setSopStatuses((c) => ({ ...c, [record.id]: "In review" })); showToast(`${record.title} opened for review.`); }}>Open</Button></footer></article>)}</div><SectionCard title="My required acknowledgments"><div className="hrChecklist">{records.slice(0, 3).map((record) => { const acknowledged = sopStatuses[record.id] === "Acknowledged"; return <label className={acknowledged ? "complete" : ""} key={record.id}><Checkbox checked={acknowledged} onCheckedChange={() => setSopStatuses((current) => ({ ...current, [record.id]: "Acknowledged" }))} /><span><b>{record.title}</b><small>{record.version} · assigned by role · exact version retained</small></span><Pill>{acknowledged ? "Acknowledged" : "Due"}</Pill></label>; })}</div></SectionCard></TabsContent><TabsContent value="workflow"><SectionCard title="Drafts and approval queue"><div className="caseSteps">{[["SOP-AM-012", "Content review", "Alex"], ["POL-IT-006", "Security review", "Austin"], ["SOP-FIN-014", "Owner approval", "Jerson"]].map(([id, stage, owner], index) => <article key={id}><i>{index + 1}</i><div><b>{id} · {stage}</b><small>Draft, change summary, reviewer comments, approval, effective date, and assigned audience required.</small></div><Pill>{sopStatuses[`wf-${id}`] ?? owner}</Pill><Button size="sm" variant="outline" onClick={() => { setSopStatuses((c) => ({ ...c, [`wf-${id}`]: "Approved" })); showToast(`${id} approved and queued for publishing.`); }}>Approve</Button></article>)}</div></SectionCard><div className="workCalendar">{records.map((record) => <article key={record.id}><header><b>{record.next.split(",")[0]}</b><small>Next review</small></header><button onClick={() => setSopTab("library")}><b>{record.title}</b><small>Owner {record.owner}</small></button></article>)}</div></TabsContent><TabsContent value="resources"><div className="assetGrid">{[["Employee write-up", "People & HR"], ["Property visit report", "Account Management"], ["VTR-265 cover checklist", "Vehicle Disposition"], ["Work-order completion report", "Work Orders"]].map(([title, area]) => <article key={title}><FileText /><div><b>{title}</b><small>{area} · approved template</small></div><Button size="sm" variant="outline" onClick={() => showToast(`${title} template downloaded.`)}>Download</Button></article>)}</div></TabsContent></Tabs></>;
  }
}
