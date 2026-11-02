import type { Viewer } from "@/lib/finance/model";

// Static shell demo data. Only /api/session, /api/finance and
// /api/accounts?surface=orders are answered — everything else still fetches
// for real (and fails harmlessly) so this stays a shell, not a fake backend.
export const demoViewer: Viewer = {
  id: "demo",
  name: "Demo Manager",
  email: "demo@galindostowing.example",
  person: "jerson",
  role: "Owner",
  department: "Operations",
  owner: true,
  canManage: true,
  canRelease: true,
};

const today = new Date();
const iso = (d: Date) => d.toISOString();
const day = (offset: number) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
// Workweek starts Sunday (payrollPolicies default).
const dow = today.getUTCDay();
const weekStart = day(-dow);
const weekEnd = day(6 - dow);
const at = (d: string, h: number, m = 0) =>
  new Date(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-06:00`).toISOString();

const rec = (kind: string, id: string, fields: Record<string, unknown> = {}) => ({
  id, kind, version: 1, name: "", ...fields,
});

const people = [
  rec("person", "jerson", { name: "Jerson Galindo", status: "Active", department: "Operations", role: "Owner", payType: "Salary", rate: 2200, netTarget: 0, manager: "", notes: "Owner draw. Weekly planning baseline." }),
  rec("person", "dalila", { name: "Dalila Flores", status: "Active", department: "Dispatch", role: "Supervisor", payType: "Hourly", rate: 24, netTarget: 0, manager: "jerson" }),
  rec("person", "nessa", { name: "Nessa Rios", status: "Active", department: "Dispatch", role: "Dispatcher", payType: "Hourly", rate: 19.5, netTarget: 0, manager: "dalila" }),
  rec("person", "jarif", { name: "Jarif Garcia", status: "Active", department: "Dispatch", role: "Dispatcher", payType: "Hourly", rate: 19, netTarget: 0, manager: "dalila" }),
  rec("person", "mingo", { name: "Mingo Alvarez", status: "Active", department: "Drivers", role: "Tow Operator", payType: "Hourly", rate: 21, netTarget: 0, manager: "jerson" }),
  rec("person", "jendel", { name: "Jendel Arauz", status: "Active", department: "Drivers", role: "Tow Operator", payType: "Hourly", rate: 20, netTarget: 0, manager: "jerson" }),
];

const departments = [
  rec("department", "dept-ops", { name: "Operations", coverageDays: "1,2,3,4,5,6,0" }),
  rec("department", "dept-dispatch", { name: "Dispatch", coverageDays: "1,2,3,4,5,6,0" }),
  rec("department", "dept-drivers", { name: "Drivers", coverageDays: "1,2,3,4,5,6,0" }),
];

const shifts = [
  rec("shift", "sh-1", { person: "dalila", status: "Published", coverageRole: "Dispatcher", location: "Command desk", department: "Dispatch", start: at(weekStart, 7), end: at(weekStart, 15) }),
  rec("shift", "sh-2", { person: "nessa", status: "Published", coverageRole: "Dispatcher", location: "Command desk", department: "Dispatch", start: at(day(0), 7), end: at(day(0), 15) }),
  rec("shift", "sh-3", { person: "jarif", status: "Published", coverageRole: "Dispatcher", location: "Command desk", department: "Dispatch", start: at(day(1), 15), end: at(day(1), 23) }),
  rec("shift", "sh-4", { person: "mingo", status: "Published", coverageRole: "Driver", location: "Yard / routes", department: "Drivers", start: at(day(0), 8), end: at(day(0), 18) }),
  rec("shift", "sh-5", { person: "jendel", status: "Published", coverageRole: "Driver", location: "Yard / routes", department: "Drivers", start: at(day(1), 8), end: at(day(1), 18) }),
  rec("shift", "sh-6", { person: "mingo", status: "Published", coverageRole: "Driver", location: "Yard / routes", department: "Drivers", start: at(day(2), 18), end: at(day(3), 2) }),
  rec("shift", "sh-7", { person: "dalila", status: "Published", coverageRole: "Dispatcher", location: "Command desk", department: "Dispatch", start: at(day(2), 7), end: at(day(2), 15) }),
];

const shiftTemplates = [
  rec("shiftTemplate", "tpl-1", { person: "dalila", day: 1, startTime: "07:00", endTime: "15:00", department: "Dispatch", status: "Active" }),
  rec("shiftTemplate", "tpl-2", { person: "jarif", day: 2, startTime: "15:00", endTime: "23:00", department: "Dispatch", status: "Active" }),
  rec("shiftTemplate", "tpl-3", { person: "mingo", day: 3, startTime: "08:00", endTime: "18:00", department: "Drivers", status: "Active" }),
];

const time = [
  rec("time", "t-1", { person: "dalila", date: weekStart, hours: 8, status: "Approved", type: "Regular" }),
  rec("time", "t-2", { person: "nessa", date: weekStart, hours: 7.5, status: "Approved", type: "Regular" }),
  rec("time", "t-3", { person: "jarif", date: weekStart, hours: 8, status: "Draft", type: "Regular" }),
  rec("time", "t-4", { person: "mingo", date: weekStart, hours: 9.25, status: "Approved", type: "Regular" }),
  rec("time", "t-5", { person: "jendel", date: weekStart, hours: 8.5, status: "Approved", type: "Regular" }),
  rec("time", "t-6", { person: "dalila", date: day(-1), hours: 8, status: "Draft", type: "Regular" }),
  rec("time", "t-7", { person: "mingo", date: day(-1), hours: 10, status: "Draft", type: "Regular" }),
];

const clock = [
  rec("clock", "clk-1", { person: "mingo", status: "Running", startedAt: at(day(0), 8), breaks: [] }),
];

const requests = [
  rec("overtime", "ot-1", { person: "mingo", date: day(-1), hours: 2, status: "Requested", requestType: "Extra earning opportunity", reason: "Night impound release ran long.", explanation: "Two hours past shift end on the auction lot release." }),
  rec("shiftRequest", "sr-1", { person: "jendel", date: day(3), status: "Requested", type: "Open shift request", hours: 8, reason: "Covering the Wednesday night rotation." }),
  rec("timeCorrection", "tc-1", { person: "nessa", date: day(-2), status: "Requested", type: "Time correction", hours: 0.5, reason: "Forgot to clock back in after lunch." }),
  rec("leaveRequest", "lr-1", { person: "jarif", date: day(9), status: "Requested", type: "PTO", hours: 8, reason: "Family appointment", updatedBy: "jarif" }),
];

const categories = [
  rec("category", "cat-fuel", { name: "Fuel", budgetMode: "Monthly budget", budgetAmount: 3800 }),
  rec("category", "cat-repairs", { name: "Truck repairs", budgetMode: "Monthly budget", budgetAmount: 2400 }),
  rec("category", "cat-insurance", { name: "Insurance", budgetMode: "Monthly budget", budgetAmount: 5100 }),
  rec("category", "cat-impound", { name: "Impound lot", budgetMode: "", }),
];

const transactions = [
  rec("transaction", "tx-1", { name: "Chase fuel cards · weekly", category: "Fuel", amount: -918.44, date: day(-2), status: "Posted" }),
  rec("transaction", "tx-2", { name: "Maplewood Apartments · patrol invoice", category: "Account revenue", amount: 3400, date: day(-3), status: "Posted" }),
  rec("transaction", "tx-3", { name: "Flatbed hydraulic line repair", category: "Truck repairs", amount: -1275.6, date: day(-4), status: "Posted" }),
  rec("transaction", "tx-4", { name: "Impound release receipts · week", category: "Impound revenue", amount: 2145, date: day(-4), status: "Posted" }),
  rec("transaction", "tx-5", { name: "Fleet insurance · monthly", category: "Insurance", amount: -5100, date: day(-6), status: "Posted" }),
  rec("transaction", "tx-6", { name: "Oak Ridge Townhomes · tow agreement", category: "Account revenue", amount: 1850, date: day(-7), status: "Posted" }),
  rec("transaction", "tx-7", { name: "Dispatch phone lines", category: "Utilities", amount: -340.12, date: day(-8), status: "Posted" }),
  rec("transaction", "tx-8", { name: "Storage fees collected", category: "Impound revenue", amount: 960, date: day(-9), status: "Posted" }),
];

const payroll = [
  rec("payrun", "pr-1", {
    status: "Released", date: day(-8), period: day(-15), periodEnd: day(-9),
    lines: [
      { person: "dalila", gross: 960, payment: 812.4 },
      { person: "nessa", gross: 731.25, payment: 624.9 },
      { person: "jarif", gross: 760, payment: 651.2 },
      { person: "mingo", gross: 892.5, payment: 748.1 },
      { person: "jendel", gross: 850, payment: 716.3 },
    ],
  }),
  rec("earning", "e-1", { person: "mingo", date: weekStart, name: "Tow commission · 8 releases", amount: 164, status: "Approved" }),
  rec("earning", "e-2", { person: "jendel", date: weekStart, name: "Tow commission · 6 releases", amount: 123, status: "Approved" }),
  rec("deduction", "d-1", { person: "nessa", date: weekStart, name: "Uniform replacement", amount: 45, status: "Approved" }),
  rec("reimbursement", "r-1", { person: "dalila", date: weekStart, name: "Dispatch headset", amount: 89.99, status: "Approved" }),
  rec("taxInput", "txin-1", { person: "mingo", date: weekStart, federal: 118, state: 0, ytdGross: 38920, status: "Entered" }),
];

const spending = [
  rec("expense", "ex-1", { person: "jendel", date: day(-2), name: "Winch cable", amount: 220.5, status: "Submitted", category: "Truck repairs" }),
  rec("expense", "ex-2", { person: "dalila", date: day(-3), name: "Safety cones · 12pk", amount: 186.4, status: "Approved", category: "Safety" }),
  rec("expenseReport", "er-1", { person: "jendel", period: weekStart, status: "Submitted", due: `${weekEnd}T23:59` }),
];

const receivables = [
  rec("invoice", "inv-1", { name: "Maplewood Apartments · Oct patrol", status: "Sent", amount: 3400, due: day(4), account: "Maplewood Apartments" }),
  rec("invoice", "inv-2", { name: "Oak Ridge Townhomes · Oct agreement", status: "Overdue", amount: 1850, due: day(-3), account: "Oak Ridge Townhomes" }),
  rec("invoice", "inv-3", { name: "Impound storage · held vehicles", status: "Open", amount: 2610, due: day(11) }),
  rec("debt", "debt-1", { name: "Damage claim reserve · Camry", status: "Open", amount: 1400, due: day(20) }),
];

export const financeRecords = [
  rec("company", "company", { name: "Galindo's Towing and Parking", growth: 8, payrollTarget: 5200 }),
  rec("bank", "bank", { name: "Chase operating", amount: 48210.55, date: day(-1) }),
  ...departments,
  ...people,
  ...shifts,
  ...shiftTemplates,
  ...time,
  ...clock,
  ...requests,
  ...categories,
  ...transactions,
  ...payroll,
  ...spending,
  ...receivables,
];

export const financeData = {
  records: financeRecords,
  transactions: transactions as typeof financeRecords,
  viewer: demoViewer,
  sourceDate: day(0),
  transactionThrough: day(0),
};

const staff = [
  { id: "jerson", name: "Jerson Galindo", department: "Operations", title: "Owner" },
  { id: "dalila", name: "Dalila Flores", department: "Dispatch", title: "Dispatch Supervisor" },
  { id: "nessa", name: "Nessa Rios", department: "Dispatch", title: "Dispatcher" },
  { id: "jarif", name: "Jarif Garcia", department: "Dispatch", title: "Dispatcher" },
  { id: "mingo", name: "Mingo Alvarez", department: "Drivers", title: "Tow Operator" },
  { id: "jendel", name: "Jendel Arauz", department: "Drivers", title: "Tow Operator" },
];

const wo = (id: string, name: string, fields: Record<string, unknown>) => ({
  id, kind: "workOrder", version: 1, name, ...fields,
});

export const workOrderRecords = [
  wo("wo-1", "Unit 204 — no-permit vehicle repeat tow", {
    category: "Account Management", type: "Call In", priority: "Urgent", status: "In Progress",
    assignee: "mingo", location: "Maplewood Apartments", dueDate: day(0), scheduledDate: day(0),
    details: "Same silver Altima parked in reserved space three nights this week. Patrol photo attached; property manager authorized removal.", submittedBy: "nessa",
  }),
  wo("wo-2", "Flatbed #2 — hydraulic line weep", {
    category: "Fleet Maintenance & Repairs", type: "Fleet repair", priority: "High", status: "Awaiting Approval",
    assignee: "", location: "Main yard", dueDate: day(1), requiresApproval: true, estimatedCost: 680,
    details: "Slow weep at the lift cylinder fitting. Safe to run short jobs; do not send on highway recovery until repaired.", submittedBy: "jendel",
  }),
  wo("wo-3", "Gate sign at Oak Ridge faded — replace", {
    category: "Facilities & Maintenance", type: "Signage repair", priority: "Normal", status: "Assigned",
    assignee: "jendel", location: "Oak Ridge Townhomes", dueDate: day(3), scheduledDate: day(2),
    details: "South entrance tow-away sign illegible at night. Swap with spare reflective panel in the yard.", submittedBy: "dalila",
  }),
  wo("wo-4", "Impound lot camera 3 offline", {
    category: "IT Support", type: "Equipment", priority: "Urgent", status: "New",
    location: "Impound lot", dueDate: day(0), safetyImpact: "Potential hazard",
    details: "Camera 3 (vehicle intake lane) stopped reporting overnight. Intake photos must be manual until restored.", submittedBy: "nessa",
  }),
  wo("wo-5", "Quarterly signage audit — Maplewood", {
    category: "Safety", type: "Signage report", priority: "Normal", status: "Ready for Verification",
    assignee: "dalila", location: "Maplewood Apartments", dueDate: day(-1),
    details: "All 14 enforcement signs photographed and mapped. Two posts leaning need straightening; no language gaps found.", submittedBy: "dalila",
  }),
  wo("wo-6", "Printer toner + intake forms restock", {
    category: "Supplies & Purchasing", type: "Supplies", priority: "Low", status: "Completed",
    assignee: "nessa", location: "Office", dueDate: day(-2), actualCost: 112.4,
    details: "Restocked intake carbon copies and dispatch printer toner.", submittedBy: "nessa",
  }),
  wo("wo-7", "New patrol route — Harbor Point trial week", {
    category: "Project", type: "Onboarding", priority: "Normal", status: "Needs Review",
    assignee: "jarif", location: "Harbor Point Lofts", dueDate: day(6),
    details: "Trial-week route card drafted: two nightly passes, visitor lane emphasis. Needs owner sign-off before launch.", submittedBy: "jarif",
  }),
  wo("wo-8", "Driver door lock cylinder — pickup 5", {
    category: "Fleet Maintenance & Repairs", type: "Fleet repair", priority: "Normal", status: "In Progress",
    assignee: "mingo", location: "Main yard", dueDate: day(4), estimatedCost: 145,
    details: "Key sticks cold mornings; ordered cylinder kit.", submittedBy: "mingo",
  }),
];

export const workOrderExtras = [
  { id: "woa-1", kind: "woAsset", version: 1, name: "Flatbed #2", status: "Maintenance Due", category: "Fleet Maintenance & Repairs" },
  { id: "woa-2", kind: "woAsset", version: 1, name: "Pickup 5", status: "Active", category: "Fleet Maintenance & Repairs" },
  { id: "woa-3", kind: "woAsset", version: 1, name: "Impound camera system", status: "Active", category: "IT Support" },
  { id: "wor-1", kind: "woRecurring", version: 1, name: "Weekly yard safety walk", status: "Active", category: "Safety", frequency: "Weekly" },
  { id: "wor-2", kind: "woRecurring", version: 1, name: "Monthly signage photo audit", status: "Active", category: "Safety", frequency: "Monthly" },
  { id: "wop-1", kind: "woProject", version: 1, name: "Harbor Point onboarding", status: "Active", category: "Project" },
  { id: "fv-1", kind: "fleetVehicle", version: 1, name: "Flatbed #2", status: "Maintenance Due" },
  { id: "fv-2", kind: "fleetVehicle", version: 1, name: "Pickup 5", status: "Active" },
];

export const accountsOrders = {
  records: [...workOrderRecords, ...workOrderExtras],
  viewer: demoViewer,
  staff,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// One shallow wrapper so session + the three demo surfaces are answered
// locally; anything else falls through to the real fetch.
export function installDemoFetch() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const method = (init?.method || "GET").toUpperCase();

    if (path.startsWith("/api/session")) return json({ viewer: demoViewer });

    if (path.startsWith("/api/finance/files")) {
      if (method !== "GET") {
        return json({ record: { id: `file-${Date.now()}`, kind: "file", version: 0, name: "demo-attachment" } });
      }
      return realFetch(input, init);
    }

    if (path.startsWith("/api/finance")) {
      if (method === "GET") return json(financeData);
      try {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const record = body.record || { id: body.id || `demo-${Date.now()}`, kind: body.kind || "record", version: 0 };
        return json({ record: { ...record, version: Number(record.version || 0) + 1, updatedBy: "Demo" } });
      } catch {
        return json({ error: "Demo shell: write not parsed" }, 400);
      }
    }

    if (path.startsWith("/api/accounts")) {
      if (method === "GET") return json(accountsOrders);
      try {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.record) return json({ records: [body.record] });
        return json(accountsOrders);
      } catch {
        return json(accountsOrders);
      }
    }

    return realFetch(input, init);
  };
}
