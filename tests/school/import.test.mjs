import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {jsPDF} from 'jspdf';
import {importDocument} from '../../lib/school/document-import.ts';
test('course document import preserves real PDF reading text',async()=>{const pdf=new jsPDF();pdf.text('Verify the vehicle identification number before release.',15,30);const result=await importDocument(new Uint8Array(pdf.output('arraybuffer')),'Training.pdf');assert.match(result.text,/vehicle identification/);assert.equal(result.pages,1)});
test('PowerPoint imports slide content in numeric slide order',async()=>{const bytes=zipSync({'ppt/slides/slide11.xml':strToU8('<a:p><a:t>Last step</a:t></a:p>'),'ppt/slides/slide2.xml':strToU8('<a:p><a:t>First &amp; next</a:t></a:p>'),'ppt/media/secret.txt':strToU8('not lesson text')});const result=await importDocument(bytes,'Guide.pptx');assert.ok(result.text.indexOf('First & next')<result.text.indexOf('Last step'));assert.ok(!result.text.includes('not lesson text'));assert.equal(result.pages,2)});
test('imports reject empty, unsupported, and oversized inputs',async()=>{await assert.rejects(importDocument(new Uint8Array(),'Empty.txt'));await assert.rejects(importDocument(strToU8('bad'),'Program.exe'));await assert.rejects(importDocument(new Uint8Array(8*1024*1024+1),'Big.txt'))});
