import test from 'node:test';
import assert from 'node:assert/strict';
import {blankLegalNotice,blankLegalMailing,checkedLegalNotice,legalMailingCost,legalResolutionProven} from '../../lib/ccr/legal-notice.ts';

const base=()=>({...blankLegalNotice(),otherParty:'Example recipient',stage:'Open',documentOn:'2024-08-12'});
const mailing=()=>({...blankLegalMailing(),recipient:'Example recipient',stage:'Production Reported',submittedOn:'2024-08-12',submittedTime:'19:13',productionOn:'2024-08-13',productionTime:'11:14',sourceRef:'Submission certificate',billedOn:'2024-08-12',billedCents:1145,billedRef:'Historical billed amount on receipt'});

test('mail submission and provider production stay distinct from delivery and preserve unstated time zone',()=>{
 const c=checkedLegalNotice({...base(),mailings:[mailing()]});
 assert.equal(c.mailings[0].stage,'Production Reported');assert.equal(c.mailings[0].timeZone,'');assert.equal(c.mailings[0].mailedOn,'');assert.equal(c.mailings[0].deliveryOn,'');assert.equal(c.sentOn,'');
 assert.equal(legalMailingCost(c),1145);
 assert.throws(()=>checkedLegalNotice({...c,mailings:[{...c.mailings[0],stage:'Delivered'}]}),/separate proof/);
 assert.throws(()=>checkedLegalNotice({...c,mailings:[{...c.mailings[0],stage:'Delivered',deliveryOn:'2024-08-16'}]}),/separate proof/);
 const delivered=checkedLegalNotice({...c,mailings:[{...c.mailings[0],stage:'Delivered',deliveryOn:'2024-08-16',deliveryRef:'USPS delivery scan'}]});assert.equal(delivered.mailings[0].deliveryOn,'2024-08-16');
});

test('no invented deadlines, response or resolution; dated source evidence is required for advanced stages',()=>{
 const n=checkedLegalNotice(base());assert.equal(n.responseDue,'');assert.equal(legalResolutionProven(n),false);
 assert.throws(()=>checkedLegalNotice({...n,responseDue:'2024-08-30'}),/source/);
 assert.throws(()=>checkedLegalNotice({...n,stage:'Response Received'}),/response date/);
 assert.throws(()=>checkedLegalNotice({...n,stage:'Resolved'}),/resolution date/);
 const resolved=checkedLegalNotice({...n,stage:'Resolved',resolvedOn:'2024-09-01',resolutionRef:'Written resolution confirmed in case note 4'});assert.equal(legalResolutionProven(resolved),true);
 assert.throws(()=>checkedLegalNotice({...n,direction:'Received',stage:'Draft'}),/cannot be a draft/);
});

test('actual billed costs require cents, date and evidence; duplicate IDs and backwards dates are rejected',()=>{
 const m=mailing();assert.throws(()=>checkedLegalNotice({...base(),mailings:[{...m,billedCents:11.45}]}),/cents/);
 assert.throws(()=>checkedLegalNotice({...base(),mailings:[{...m,billedRef:''}]}),/receipt/);
 assert.throws(()=>checkedLegalNotice({...base(),mailings:[{...m,productionOn:'2024-08-11'}]}),/earlier/);
 assert.throws(()=>checkedLegalNotice({...base(),mailings:[m,{...m}]}),/own reference/);
 assert.throws(()=>checkedLegalNotice({...base(),documentOn:'2024-02-30'}),/valid/);
 assert.throws(()=>checkedLegalNotice({...base(),mailings:[{...m,timeZone:'Not a zone'}]}),/time zone/);
});

test('account selections use authoritative directory names and preserve existing restricted links',()=>{
 const value={...base(),accountId:'account-a',accountName:'Forged name'};
 assert.throws(()=>checkedLegalNotice(value),/existing account/);
 const saved=checkedLegalNotice(value,undefined,[{id:'account-a',name:'Canonical account'}]);assert.equal(saved.accountName,'Canonical account');
 const retained=checkedLegalNotice({...saved,accountName:'Tampered'},saved,[]);assert.equal(retained.accountName,'Canonical account');
 assert.equal(checkedLegalNotice({...retained,accountId:''},retained,[]).accountName,'');
 assert.equal(checkedLegalNotice(undefined,retained),retained);
});
