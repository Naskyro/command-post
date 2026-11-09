// node --test tests/sales/pipeline-interactions.browser.mjs
// Requires Playwright and its Chromium installation. No account or server credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {startPipelineFixture} from './pipeline-fixture.mjs';
const require=createRequire(import.meta.url);
test('Sales Pipeline stays usable across views, roles, filters, date changes and narrow screens',async t=>{
 let chromium;try{({chromium}=require('playwright'));}catch{return t.skip('Install Playwright and Chromium to run the browser check.');}
 let browser;try{browser=await chromium.launch({headless:true});}catch(e){if(String(e).includes('Executable doesn\'t exist'))return t.skip('Install the Playwright Chromium executable to run browser layout checks.');throw e;}
 const f=await startPipelineFixture();t.after(async()=>{await browser.close();await f.close();});
 const context=await browser.newContext({viewport:{width:1180,height:800}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(f.url);
 const button=name=>page.getByRole('button',{name,exact:true}),switchTo=async view=>{await button(view).click();assert.equal(await button(view).getAttribute('aria-pressed'),'true');};
 await page.locator('.pipe-board').waitFor();assert.equal(await page.locator('.pipe-board .sc-deal').count(),4);
 assert.match(await page.locator('.pipe-stats').innerText(),/\$6,300/);
 assert.equal(await page.getByRole('button',{name:'Closed Win'}).count(),0);
 const cold=page.locator('.pipe-group').filter({has:page.getByRole('button',{name:/^Not Engaged/})});
 await cold.locator('.pipe-grouphead').click();assert.equal(await cold.locator('.sc-deal').count(),0);
 await switchTo('List');assert.equal(await page.locator('.pipe-grouphead[aria-expanded="false"]').count(),1);
 await button('Collapse All').click();assert.equal(await page.locator('.pipe-list tbody tr').count(),0);
 await button('Expand All').click();assert.equal(await page.locator('.pipe-list tbody tr').count(),4);
 await page.getByLabel('Group Pipeline By').selectOption('Assignee');
 const beta=page.locator('.pipe-group').filter({has:page.getByRole('button',{name:/^Example Beta/})});
 await beta.getByRole('button',{name:'Juniper Court'}).click();
 await page.getByText('Training b2',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await button('Filters').click();await page.getByLabel('Sales Owner').selectOption('a');
 await page.getByLabel('Search Sales CRM').fill('Juniper');
 await switchTo('Board');assert.equal(await page.locator('.sc-deal').count(),1);
 await switchTo('Calendar');assert.equal(await page.locator('.pipe-days button').count(),1);assert.equal(await page.locator('.pipe-unscheduled button').count(),0);
 await page.locator('.pipe-days button').click();await page.getByText('Training a1',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await button('Collapse All').click();assert.equal(await page.locator('.pipe-days button').count(),0);await button('Expand All').click();
 await button('Next Month').click();await page.getByRole('button',{name:/^Go to /}).click();await page.locator('.pipe-days button').waitFor();
 await page.getByLabel('Search Sales CRM').fill('nothing matches');await button('Clear Filters').click();
 await page.locator('.pipe-unscheduled button',{hasText:'Juniper Court'}).click();await page.getByText('Training b2',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await switchTo('List');await beta.locator('.pipe-grouphead').click();await page.reload();
 await page.locator('.pipe-list').waitFor();assert.equal(await page.getByLabel('Group Pipeline By').inputValue(),'Assignee');assert.equal(await beta.locator('.pipe-grouphead').getAttribute('aria-expanded'),'false');
 await context.addCookies([{name:'fixture-user',value:'viewer-b',url:f.url}]);await page.reload();await page.locator('.pipe-board').waitFor();assert.equal(await page.getByLabel('Group Pipeline By').inputValue(),'Stage');
 await page.setViewportSize({width:360,height:720});
 for(const view of ['Board','List','Calendar']){await switchTo(view);const rect=await page.evaluate(()=>({width:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));assert.ok(rect.content<=rect.width+1,view+' causes horizontal page overflow: '+JSON.stringify(rect));}
 assert.deepEqual(f.mutations,[]);assert.deepEqual(errors,[]);
});
