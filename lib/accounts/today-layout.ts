export const todayPanels={watch:'Portfolio Watch',work:'Next Actions & Renewals',metrics:'Portfolio Performance',signals:'Priorities & Dispatch Handoffs',charts:'Health & Revenue Charts',court:'Court Calendar',claims:'Vehicle Damage Claims',pending:'Property Onboarding',birthdays:'Property Manager Birthdays',orders:'Operations Requests'} as const;
export type PanelKey=keyof typeof todayPanels;
export type TodayLayout={order:PanelKey[];pinned:PanelKey[];hidden:PanelKey[]};
export const dashPanels:PanelKey[]=['metrics','charts','signals','watch','work'],watchPanels:PanelKey[]=['court','claims','pending','birthdays','orders'];
export const freshTodayLayout=():TodayLayout=>({order:[...dashPanels,...watchPanels],hidden:[],pinned:[]});
export function validTodayLayout(value:unknown):value is TodayLayout{
 const v=value as TodayLayout;if(!v||typeof v!=='object')return false;
 const valid=(a:unknown)=>Array.isArray(a)&&new Set(a).size===a.length&&a.every(k=>typeof k==='string'&&Object.hasOwn(todayPanels,k));
 return valid(v.order)&&v.order.length===Object.keys(todayPanels).length&&valid(v.pinned)&&valid(v.hidden)&&!v.pinned.some(k=>v.hidden.includes(k));
}
export const ordered=(l:TodayLayout,keys:PanelKey[])=>l.order.filter(k=>keys.includes(k)).sort((a,b)=>Number(l.pinned.includes(b))-Number(l.pinned.includes(a)));
export function editPanel(l:TodayLayout,k:PanelKey,op:'show'|'hide'|'pin'|'unpin'|'up'|'down',peers:PanelKey[]):TodayLayout{
 const next={order:[...l.order],hidden:[...l.hidden],pinned:[...l.pinned]};
 if(op==='show'||op==='pin')next.hidden=next.hidden.filter(x=>x!==k);
 if(op==='hide'||op==='unpin')next.pinned=next.pinned.filter(x=>x!==k);
 if(op==='hide'&&!next.hidden.includes(k))next.hidden.push(k);
 if(op==='pin'&&!next.pinned.includes(k))next.pinned.push(k);
 if(op==='up'||op==='down'){const list=ordered(l,peers).filter(x=>l.pinned.includes(x)===l.pinned.includes(k)),i=list.indexOf(k),other=list[i+(op==='up'?-1:1)];if(other){const a=next.order.indexOf(k),b=next.order.indexOf(other);[next.order[a],next.order[b]]=[next.order[b],next.order[a]];}}
 return next;
}

// Keep deliberate custom orders. A saved copy of the old default adopts the new first screen.
export function upgradeTodayLayout(input:unknown):TodayLayout {
 if(validTodayLayout(input))return input;
 if(!input||typeof input!=='object')return freshTodayLayout();
 const old=input as TodayLayout, previous:PanelKey[]=['watch','work','metrics','charts',...watchPanels];
 if(!Array.isArray(old.order)||old.order.length!==previous.length||previous.some(k=>!old.order.includes(k)))return freshTodayLayout();
 const standard=previous.every((k,i)=>old.order[i]===k);
 const layout={...old,order:standard?freshTodayLayout().order:[...old.order.slice(0,1),'signals' as const,...old.order.slice(1)]};
 return validTodayLayout(layout)?layout:freshTodayLayout();
}
