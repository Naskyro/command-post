'use client';
import {useEffect, useState} from 'react';
import {Mail, Phone, Pencil, Plus, ShieldAlert, Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {hasDetail,phoneLink} from '@/lib/accounts/display';
import {hasDigital} from '@/lib/accounts/field-rules';
import {requestJson} from '@/lib/shared/client';
import {current, money, today, type Row} from '@/lib/accounts/model';
import {relationshipLength, managerRoles} from '@/lib/accounts/insights';
import {profilePhoto} from '@/lib/accounts/contact-details';
import {recordedEnforcementHours,enforcementSchedule, operatingFields, type annualRevenue} from '@/lib/accounts/profile-summary';

type Annual = ReturnType<typeof annualRevenue>;

function AnnualRevenue({accountId, revision, allowed}:{accountId:string;revision:string;allowed:boolean}) {
  const [year,setYear]=useState(Number(today().slice(0,4))), [data,setData]=useState<Annual>(), [error,setError]=useState('');
  useEffect(()=>{let active=true;setData(undefined);setError('');if(allowed)requestJson<Annual>('/api/accounts/history?'+new URLSearchParams({mode:'annual',accountId,year:String(year)})).then(d=>active&&setData(d)).catch(e=>active&&setError(e.message));return()=>{active=false};},[accountId,year,revision,allowed]);
  const years=data?.years||[Number(today().slice(0,4)),year].filter((v,i,a)=>a.indexOf(v)===i);
  if(!allowed||data&&!data.paymentCount&&!data.years?.length)return null;
  return <div className="am-summary-fact"><div className="am-revenue-label"><dt>Annual Revenue</dt>{allowed&&<select aria-label="Annual revenue year" value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y}>{y}</option>)}</select>}</div>
    <dd>{!allowed?'Access required':error?'Unavailable':!data?'Loading…':data.paymentCount?money(data.total):'No payments in '+year}</dd>
    {data?.coverageTo&&<small>{year===Number(today().slice(0,4))?'Year to date':'Recorded revenue'} · Payments {data.coverageFrom}–{data.coverageTo}</small>}{error&&<small role="alert">Revenue could not be loaded.</small>}
  </div>;
}

export function PropertyOverview({account,all,revision,canRevenue,showRevenue=true,onEdit}:{account:Row;all:Row[];revision:string;canRevenue:boolean;showRevenue?:boolean;onEdit?:(row:Row,fields:string[],title:string)=>void}) {
  const hours=recordedEnforcementHours(account);
  const company=all.find(r=>r.kind==='company'&&r.id===account.companyId);
  const schedule=enforcementSchedule(all,account.id),start=account.relationshipStart||account.launchDate;
  const limited=account.towAuthorization==='Property manager only'||account.carportEnforcement==='Authorized call-in only';
  const facts:[string,unknown,unknown?][]=[
    ['Management Company',company?.name],
    ['Account Tenure',hasDetail(start)?relationshipLength(start):undefined,hasDetail(start)?'Since '+start:undefined],
    ['Property Type',account.propertyType,account.residentialBuildingType],
    ['Visitor Parking Enforcement',account.visitorParkingEnforcement],
    ['Permit Requirements',account.permitSystem,hasDigital(account)&&hasDetail(account.visitorApproval)?'Visitor validation: '+account.visitorApproval:undefined],
    ['Vehicles per Leaseholder',account.vehiclesPerLeaseholder],
    ['Visitor Section',account.visitorSection,account.visitorSection==='Yes'?account.visitorSectionLocation:undefined],
    ['Visitor Visits per Month',account.visitorVisitsPerMonth],
    ['EV Parking Enforcement',account.evParkingEnforcement],
    ['Carport Parking',account.carportParking,account.carportParking==='Yes'?account.carportEnforcement:undefined],
    ['Private Garages',account.garageParking,account.garageParking==='Yes'?account.garageEnforcement:undefined],
    ['Parking Garage',account.parkingGarage,account.parkingGarage==='Yes'?account.parkingGarageEnforcement:undefined],
    ['Garage Visitor Parking',account.parkingGarage==='Yes'?account.parkingGarageVisitorParking:undefined,['Designated areas / floors','Other'].includes(String(account.parkingGarageVisitorParking))?account.parkingGarageVisitorLocation:undefined],
    ['Leasing Office Parking',account.leasingOfficeParking,account.leasingOfficeParkingRules],
  ];
  const limits=[['Property limit / night',account.propertyNightLimit],['Property limit / week',account.propertyWeekLimit],['Internal limit / night',account.internalNightLimit],['Internal limit / week',account.internalWeekLimit]].filter(([,v])=>hasDetail(v));
  const authority=[account.towAuthorization,account.spaceCallAuthority].filter((v,i,a)=>hasDetail(v)&&a.indexOf(v)===i);
  const instructions=String(account.instructions||'').split(/\r?\n/).filter(line=>!/^\s*Enforcement\s*:/i.test(line)||!hours).join('\n').trim();
  const enforcement=hasDetail(hours)||schedule.length||authority.length||hasDetail(instructions)||hasDetail(account.towAuthorizationNotes)||limits.length;
  return <div className="am-property-overview">
    <dl className="am-property-facts">{facts.filter(([,v])=>hasDetail(v)).map(([label,value,detail])=><div className="am-summary-fact" key={label}><dt>{label}</dt><dd>{String(value)}</dd>{label==='Management Company'&&account.managementSource&&<a className="am-management-source" href={String(account.managementSource)} target="_blank" rel="noreferrer">Source · checked {account.managementCheckedOn}</a>}{hasDetail(detail)&&<small>{String(detail)}</small>}{label==='Leasing Office Parking'&&account.leasingOfficeParking==='Enforced'&&[account.leasingOfficeParkingHours,account.leasingOfficeParkingAuthority].filter(hasDetail).map((v,i)=><small key={i}>{v}</small>)}</div>)}
      {showRevenue&&canRevenue&&<AnnualRevenue key={account.id} accountId={account.id} revision={revision} allowed={canRevenue}/>}
    </dl>
    {(enforcement||onEdit)&&<div className="am-enforcement-summary"><div className="am-overview-section-heading">{!!enforcement&&<h3>Enforcement & authorization</h3>}{onEdit&&<Button variant="ghost" size="sm" onClick={()=>onEdit(account,['relationshipStart',...operatingFields],'Property tenure & enforcement')}><Pencil size={14}/>{enforcement?'Edit enforcement':'Add enforcement details'}</Button>}</div>
      <div className="am-enforcement-columns">{(hasDetail(hours)||schedule.length>0)&&<div><small>Enforcement times</small>{hasDetail(hours)&&<p>{hours}</p>}{schedule.length>0&&<ul>{schedule.map((s,i)=><li key={i}><b>{s.daysLabel} · {s.hours}</b><small>{s.scope}</small></li>)}</ul>}</div>}{authority.length>0&&<div><small>Who can authorize a tow</small>{authority.map((value,i)=><p key={i}><b>{String(value)}</b></p>)}</div>}</div>
      {hasDetail(instructions)&&<div className="am-existing-instructions"><small>Operating Instructions</small><p>{instructions}</p></div>}
      {limits.length>0&&<div className="am-tow-limit-summary">{limits.map(([label,value])=><span key={String(label)}>{label}: <b>{value}</b></span>)}{[account.limitsFrom,account.limitsUntil].filter(hasDetail).length>0&&<span>{account.limitsFrom&&'From '+account.limitsFrom}{account.limitsUntil&&' through '+account.limitsUntil}</span>}</div>}
      {hasDetail(account.towAuthorizationNotes)&&<div className={'am-authorization-note'+(limited?' am-authorization-limited':'')}>{limited&&<ShieldAlert size={18}/>}<p>{account.towAuthorizationNotes}</p></div>}
    </div>}
  </div>;
}

export function PropertyContacts({account,all,managersOnly=false,onOpen,onEdit,onAdd}:{account:Row;all:Row[];managersOnly?:boolean;onOpen?:(id:string)=>void;onEdit?:(id:string)=>void;onAdd?:()=>void}) {
  const affiliations=all.filter(r=>r.kind==='affiliation'&&r.accountId===account.id&&current(r)
    && (!managersOnly||r.contactId===account.primaryContactId||[...managerRoles,'Assistant Property Manager'].includes(String(r.role))))
    .sort((a,b)=>Number(b.contactId===account.primaryContactId)-Number(a.contactId===account.primaryContactId));
  if(!affiliations.length&&!onAdd)return null;
  return <section className={'am-property-contacts'+(managersOnly?' am-summary-contacts':'')}>
    {managersOnly&&<div className="am-overview-section-heading"><h3>Property management</h3>{onAdd&&<Button size="sm" variant="ghost" onClick={onAdd}><Plus size={15}/>Add manager</Button>}</div>}
    <div className="am-manager-grid">{affiliations.map(a=>{const person=all.find(r=>r.kind==='contact'&&r.id===a.contactId);if(!person)return null;
      const email=String(a.workEmail||person.email||''),phone=String(a.workPhone||person.personalPhone||''),photo=profilePhoto(all,person);
      return <article className="am-manager-card" key={a.id}><button className="am-manager-avatar" aria-label={'Open '+person.name+' profile'} disabled={!onOpen} onClick={()=>onOpen?.(person.id)}>{photo?<img src={photo} alt=""/>:<Users size={23}/>}</button><div className="am-manager-details"><button className="am-text-button" disabled={!onOpen} onClick={()=>onOpen?.(person.id)}>{person.name}</button><small>{a.role}{person.id===account.primaryContactId?' · Primary':''}</small>
        {email&&<a href={'mailto:'+email}><Mail size={14}/>{email}</a>}{phoneLink(phone)&&<a href={phoneLink(phone)}><Phone size={14}/>{phone}<small>{a.workPhone?'Work':'Personal'}</small></a>}
      </div>{onEdit&&<Button variant="ghost" size="sm" className="am-manager-edit" aria-label={'Edit '+person.name+' at '+account.name} onClick={()=>onEdit(person.id)}><Pencil size={14}/>Edit</Button>}</article>;
    })}</div>
  </section>;
}
