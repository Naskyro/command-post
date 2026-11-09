import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceItem} from '../../lib/ccr/tdlr-evidence.ts';
import {publicRegisterRecord} from '../../lib/ccr/register-model.ts';
const src={reference:'TOW20990000001',messageId:'abcdef1234567890',sourceSha256:'a'.repeat(64),sourceBytes:'1033',kind:'Reviewed Copy',medium:'Gmail Attachment',originalName:'Evidence.pdf',driveId:'',name:'Review.pdf',sha256:'b'.repeat(64),size:'855',documentType:'Written Response to TDLR'};
test('a review copy may never impersonate an original or borrow an identical digest',()=>{assert.equal(evidenceItem(src).kind,'Reviewed Copy');for(const variation of [{kind:'Original'},{sha256:src.sourceSha256},{kind:'Original',sha256:src.sourceSha256},{name:'../evidence.pdf'},{size:'0'},{medium:'Linked Google Drive File',driveId:''}])assert.throws(()=>evidenceItem({...src,...variation}));assert.equal(evidenceItem({...src,kind:'Original',sha256:src.sourceSha256,size:src.sourceBytes}).kind,'Original');});
test('the general register omits source-linked evidence even when the case is visible',()=>{const sourceFile={id:'s',sourceReceipt:{messageId:src.messageId}},ordinaryFile={id:'m'};const r={id:'r',files:[sourceFile,ordinaryFile],regulatoryMail:[{body:'private'}]};assert.deepEqual(publicRegisterRecord(r).files,[ordinaryFile]);assert.deepEqual(r.files,[sourceFile,ordinaryFile]);});
