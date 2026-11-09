// node --test tests/accounts/report-field-layout.browser.mjs (requires installed Playwright Chromium)
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFile,mkdtemp,rm,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {build} from 'esbuild';import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const req=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
test('report text and dropdown remain next to their icons, within the same outlined controls at narrow and wide widths',async t=>{
 let chrome;try{chrome=req('playwright').chromium;await access(chrome.executablePath());}catch{t.skip('Playwright Chromium is not installed');return;}
 const browser=await chrome.launch({headless:true}),dir=await mkdtemp(join(tmpdir(),'command-report-field-'));t.after(async()=>{await browser.close();await rm(dir,{recursive:true,force:true});});
 const bundle=join(dir,'catalog.cjs');await build({stdin:{contents:"export {PortfolioCatalog} from './components/accounts/PortfolioReports';export {definitions} from './lib/accounts/portfolio-reports-catalog';",loader:'tsx',resolveDir:root},outfile:bundle,bundle:true,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'share-react',setup(b){b.onResolve({filter:/^(?:react|react-dom)(?:\/.*)?$/},x=>({path:req.resolve(x.path),external:true}));}}]});
 const {PortfolioCatalog,definitions}=req(bundle),noop=()=>{};
 const html=renderToStaticMarkup(h(PortfolioCatalog,{meta:{catalog:definitions},term:'',category:'',setTerm:noop,setCategory:noop,onOpen:noop}));
 const files=['components/accounts/accounts.css','components/accounts/portfolio-reports.css','components/preferences/themes.css'];
 const rules=await Promise.all(files.map(f=>readFile(join(root,f),'utf8')));
 const page=await browser.newPage();for(const width of [850,350,290]){
  await page.setViewportSize({width,height:680});
  for(const styles of [rules,[...rules].reverse()]){
   await page.setContent('<style>*{box-sizing:border-box}'+styles.join('\n')+'</style><div class="am-workspace"><div class="portfolio-reports">'+html+'</div></div>');
   for(const s of ['.pr-search','.pr-category']){
    const v=await page.locator(s).evaluate(l=>{const i=l.querySelector('svg').getBoundingClientRect(),c=l.querySelector('input,select').getBoundingClientRect(),b=l.getBoundingClientRect();return {direction:getComputedStyle(l).flexDirection,horizontal:i.right<=c.left+1,inside:c.left>=b.left&&c.right<=b.right+1&&c.top>=b.top-1&&c.bottom<=b.bottom+1,usable:c.width>40};});
    assert.deepEqual(v,{direction:'row',horizontal:true,inside:true,usable:true},s+' at '+width);
   }
  }
 }
});
