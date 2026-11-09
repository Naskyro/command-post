import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const compiled=await build({entryPoints:[new URL('../../components/school/ReadingContent.tsx',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false,jsx:'automatic',loader:{'.css':'empty'}});
const {default:ReadingContent}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render=props=>renderToStaticMarkup(createElement(ReadingContent,props));
const sections=JSON.parse(readFileSync(new URL('../../lib/sop/private/catalog.json',import.meta.url),'utf8')).find(p=>p.id==='ALL-030').content.sections;

test('ALL-030 displays source headings, four numbered procedure steps, roles, and reference table',()=>{
 const html=render({text:'',sections});
 for(const title of ['Purpose','Scope','Policy Standard','Procedure'])assert.ok(html.includes('<h3 class="sh-reading-section-title">'+title+'</h3>'));
 assert.equal((html.match(/class="sh-reading-step-number"/g)||[]).length,4);
 assert.match(html,/<strong class="sh-reading-step-title">Report the Issue<\/strong>/);
 assert.match(html,/<dt>Assigned Personnel<\/dt>/);
 assert.match(html,/<th scope="col">When It Applies<\/th>/);
 assert.match(html,/<th scope="col">Category<\/th>/);
 assert.match(html,/Reconcile and Verify Recovery/);
});

test('plain source prose is not guessed to be a heading or reworded',()=>{
 const html=render({text:'Purpose\nA source sentence.\n\nDo this next.'});
 assert.doesNotMatch(html,/<h[1-6]/);
 assert.match(html,/<p>Purpose\nA source sentence.<\/p>/);
});

test('explicit Markdown renders bold, italic, nested bullets, continuation and numbered questions',()=>{
 const html=render({text:'## Field Notes\n\n- **Strong habit**\n  Visit properties weekly.\n  - Ask *specific* questions.\n- Follow through.\n\n1. First question?\n2. Second question?\n\n> Original quoted language.'});
 assert.match(html,/<h3 class="sh-reading-heading">Field Notes<\/h3>/);
 assert.match(html,/<strong>Strong habit<\/strong>\nVisit properties weekly./);
 assert.match(html,/<em>specific<\/em>/);
 assert.equal((html.match(/class="sh-reading-list bulleted"/g)||[]).length,2);
 assert.match(html,/<ol start="1" class="sh-reading-list numbered">/);
 assert.match(html,/<blockquote><p>Original quoted language.<\/p><\/blockquote>/);
});

test('authored HTML and unsafe URLs never create executable content',()=>{
 const html=render({text:'<script>alert(1)</script>\n\n[Unsafe](javascript:alert)\n\n![Private Image](https://evil.example/tracker.png)\n\n**Read this**'});
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script|href="javascript:|<img/);
 assert.match(html,/<strong>Read this<\/strong>/);
});

test('trusted course images and explicit notes retain semantic presentation',()=>{
 const html=render({text:'![Guide Figure](/api/school/source?courseId=guide&asset=figure.webp)\n\n> [!NOTE]\n> Read the **original policy**.'});
 assert.match(html,/<img src="\/api\/school\/source\?courseId=guide&amp;asset=figure.webp" alt="Guide Figure"/);
 assert.match(html,/<aside class="sh-reading-callout tone-info" role="note">/);
 assert.match(html,/<strong>original policy<\/strong>/);
});

test('reflection coaching and complete references are closed, accessible disclosures with safe text',()=>{
 const html=render({text:':::practice Make a Decision\nA customer asks for an exception. What would you check?\n:::coach\nCheck the **approval record** before promising a result.\n:::\n\n:::reference Complete Policy\n## Required Step\nKeep the original record.\n\n<script>unsafe()</script>\n:::'});
 assert.match(html,/<section class="sh-reading-practice"><h4>Make a Decision<\/h4>/);
 assert.match(html,/<details><summary>Compare Your Approach<\/summary>/);
 assert.match(html,/<details class="sh-reading-reference"><summary>Complete Policy<\/summary>/);
 assert.match(html,/<strong>approval record<\/strong>/);
 assert.match(html,/Keep the original record\./);
 assert.doesNotMatch(html,/<details[^>]*\sopen|<script|:::coach|:::reference|:::practice/);
 assert.match(html,/&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
});
