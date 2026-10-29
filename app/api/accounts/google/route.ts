import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { access, canEdit, canReadFile } from '@/lib/accounts/policy';
import { connection, authorize, mailbox, googleFetch, thread, header, messageText, mime, unbase64, type Part, type Message } from '@/lib/accounts/google';
import { today, type Row } from '@/lib/accounts/model';
import { financeDb, financeFiles } from '@/db/finance';
import { AppError, ForbiddenError, ConflictError, readPayload, safeFailure } from '@/lib/shared/errors';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: NextRequest) { try {
    const { viewer: v, all } = await context(request);
    if (!access(v, 'email'))
        throw new ForbiddenError();
    const params=request.nextUrl.searchParams,mode=params.get('mode');
    if(mode==='inbox'){
      const token=await mailbox(v),result=await(await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/threads?'+new URLSearchParams({q:(params.get('q')||'in:inbox').slice(0,1000),maxResults:'20',...(params.get('page')?{pageToken:params.get('page')!.slice(0,500)}:{})}),{headers:{Authorization:'Bearer '+token}})).json();return json(result);
    }
    if(mode==='thread'){
      const t=await thread(await mailbox(v),String(params.get('threadId')||''));
      return json({messages:t.messages.slice(-60).map(m=>{const attachments:{id:string;name:string}[]=[];const visit=(p:Part)=>{if(p.filename&&p.body?.attachmentId)attachments.push({id:p.body.attachmentId,name:p.filename});(p.parts||[]).forEach(visit)};visit(m.payload);return {id:m.id,subject:header(m,'Subject'),from:header(m,'From'),to:header(m,'To'),date:new Date(Number(m.internalDate)).toISOString(),body:messageText(m.payload).slice(0,50000),attachments}})});
    }
    if(mode==='attachment'){
      const mid=params.get('messageId')||'',aid=params.get('attachmentId')||'';if(!/^[A-Za-z0-9_-]{1,100}$/.test(mid)||!/^[A-Za-z0-9_-]{1,1000}$/.test(aid))throw new AppError('Invalid attachment.');
      const token=await mailbox(v),m=await(await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(mid),{headers:{Authorization:'Bearer '+token}})).json() as Message;let part:Part|undefined;const visit=(p:Part)=>{if(p.body?.attachmentId===aid)part=p;(p.parts||[]).forEach(visit)};visit(m.payload);if(!part||Number(part.body?.size)>15*1024*1024)throw new AppError('Attachment unavailable or exceeds 15 MB.');
      const d=await(await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(mid)+'/attachments/'+encodeURIComponent(aid),{headers:{Authorization:'Bearer '+token}})).json() as {data:string};return new Response(unbase64(d.data),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+String(part.filename||'Attachment').replace(/[^A-Za-z0-9._ -]/g,'_')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    const a = all.find(r => r.id === request.nextUrl.searchParams.get('accountId') && r.kind === 'account');
    if (!a)
        return json(await connection(v));
    const token = await mailbox(v), result = await (await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/threads?' + new URLSearchParams({ q: '"' + a.name.replace(/["\\]/g, '') + '"', maxResults: '20' }), { headers: { Authorization: 'Bearer ' + token } })).json() as {
        threads?: {
            id: string;
            snippet: string;
        }[];
    };
    return json({ threads: result.threads || [] });
}
catch (e) {
    const r = safeFailure(e, 'accounts.google_read');
    return json(r.body, r.status);
} }
export async function POST(request: NextRequest) {
    try {
        const body = await readPayload(request), { viewer: v, all, staff } = await context(request);
        if (!access(v, 'email', true))
            throw new ForbiddenError();
        if (body.action === 'connect')
            return json({ url: await authorize(v) });
        if (body.action === 'disconnect') {
            await financeDb().prepare('DELETE FROM account_google WHERE person_id=?').bind(v.person).run();
            return json({ connected: false });
        }
        const a = all.find(r => r.id === body.accountId && r.kind === 'account');
        if (body.accountId && (!a || !canEdit(v, a, all, staff)))
            throw new ForbiddenError();
        if(body.action==='replyPrivate'){
          const t=await thread(await mailbox(v),String(body.threadId||'')),m=t.messages.at(-1);if(!m)throw new AppError('Empty conversation.');
          const from=header(m,'From'),to=from.toLowerCase().includes(v.email.toLowerCase())?header(m,'To'):from,subject='Re: '+header(m,'Subject').replace(/^Re:\s*/i,'');
          return json({records:await writeMany([{next:{id:crypto.randomUUID(),kind:'email',version:0,name:subject,subject,to:(to.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[]).join(', '),body:'',status:'Draft',authorId:v.person,threadId:m.threadId,inReplyTo:header(m,'Message-ID')}}],v,'Prepared private reply')});
        }
        if(['reply','link'].includes(String(body.action))&&!a)throw new AppError('Choose an account.');
        if (body.action === 'reply' && a) {
            const old = all.find(r => r.id === body.id && r.kind === 'email' && r.accountId === a.id && r.threadId);
            if (!old)
                throw new AppError('Choose a linked conversation.');
            const emails = (s: unknown) => (String(s || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).join(', '), subject = 'Re: ' + String(old.subject || old.name).replace(/^Re:\s*/i, '');
            return json({ records: await writeMany([{ next: { id: crypto.randomUUID(), kind: 'email', version: 0, name: subject, subject, body: '', to: emails(String(old.from).toLowerCase().includes(v.email.toLowerCase()) ? old.to : old.from), accountId: a.id, threadId: old.authorId===v.person?old.threadId:'', inReplyTo: old.internetMessageId || '', status: 'Draft', authorId: v.person } }], v, 'Prepared reply') });
        }
        if (body.action === 'link' && a) {
            if(body.contactId&&!all.some(r=>r.kind==='affiliation'&&r.contactId===body.contactId&&r.accountId===a.id))throw new AppError('Choose a contact linked to this account.');
            const token = await mailbox(v), t = await thread(token, String(body.threadId || ''));
            if (t.messages.length > 60)
                throw new AppError('This conversation is too large to link. Open it in Gmail.');
            const changes: {
                old?: Row;
                next: Row;
            }[] = [], uploaded: string[] = [];
            let totalAttachmentBytes = 0;
            try {
                for (const m of t.messages) {
                    const id = 'mail:' + v.person + ':' + m.id, old = all.find(r => r.id === id || r.kind==='email'&&r.accountId===a.id&&r.internetMessageId&&r.internetMessageId===header(m,'Message-ID'));
                    if (old) {
                        if (old.accountId !== a.id)
                            throw new AppError('This conversation is already linked to another account.');
                        if(body.contactId&&old.contactId!==body.contactId) changes.push({old,next:{...old,contactId:String(body.contactId)}});
                        continue;
                    }
                    const parts: Part[] = [];
                    function visit(p: Part) { if (p.filename)
                        parts.push(p); for (const c of p.parts || [])
                        visit(c); }
                    visit(m.payload);
                    if (parts.length > 15 || changes.length + parts.length + 1 > 75)
                        throw new AppError('Too many attachments in this conversation. Open it in Gmail.');
                    const attachmentIds: string[] = [];
                    for (const [index, p] of parts.entries()) {
                        if (Number(p.body?.size) > 15 * 1024 * 1024)
                            throw new AppError('An attachment exceeds 15 MB.');
                        const data = p.body?.data || ((await (await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(m.id) + '/attachments/' + encodeURIComponent(p.body?.attachmentId || ''), { headers: { Authorization: 'Bearer ' + token } })).json()) as {
                            data: string;
                        }).data, bytes = unbase64(data);
                        totalAttachmentBytes += bytes.length;
                        if (totalAttachmentBytes > 20 * 1024 * 1024)
                            throw new AppError('Link a conversation with less than 20 MB of attachments.');
                        if (bytes.length > 15 * 1024 * 1024)
                            throw new AppError('An attachment exceeds 15 MB.');
                        const aid = id + ':attachment:' + index, key = 'accounts/mail/' + crypto.randomUUID();
                        await financeFiles().put(key, bytes, { httpMetadata: { contentType: p.mimeType || 'application/octet-stream' } });
                        uploaded.push(key);
                        attachmentIds.push(aid);
                        changes.push({ next: { id: aid, kind: 'file', version: 0, name: p.filename || 'Attachment', accountId: a.id, category: 'Email attachment', status: 'Current', size: bytes.length, mimeType: p.mimeType || 'application/octet-stream', storageKey: key } });
                    }
                    changes.push({ next: { id, kind: 'email', version: 0, name: header(m, 'Subject') || 'Conversation', subject: header(m, 'Subject'), from: header(m, 'From'), to: header(m, 'To'), body: (messageText(m.payload) || m.snippet || '').slice(0, 20000), accountId: a.id, contactId:String(body.contactId||''), threadId: m.threadId, messageId: m.id, internetMessageId: header(m, 'Message-ID'), attachmentIds, status: 'Linked', authorId: v.person, date: new Date(Number(m.internalDate || Date.now())).toISOString().slice(0, 10) } });
                }
                return json({ records: changes.length ? await writeMany(changes, v, 'Linked Google conversation') : [] });
            }
            catch (e) {
                if (uploaded.length)
                    await financeFiles().delete(uploaded).catch(() => console.error(JSON.stringify({ event: 'accounts.email_cleanup_failed' })));
                throw e;
            }
        }
        const r = all.find(r => r.id === body.id && r.kind === 'email' && (r.accountId||'') === (a?.id||'') && r.authorId === v.person);
        if (!r || !canEdit(v, r, all, staff))
            throw new ForbiddenError();
        const activity = (date: string): Row => ({ id: 'email-activity:' + r.id, kind: 'activity', version: 0, name: r.name, accountId: a?.id, contactId:r.contactId, date, channel: 'Email', outcome: 'Sent', assignee: v.person });
        if (body.action === 'checkSent') {
            const token = await mailbox(v), q = 'in:sent rfc822msgid:' + r.id.replace(/[^A-Za-z0-9]/g, '') + '@command-post.local', result = await (await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?' + new URLSearchParams({ q, maxResults: '5' }), { headers: { Authorization: 'Bearer ' + token } })).json() as {
                messages?: {
                    id: string;
                    threadId: string;
                }[];
            };
            if (!result.messages?.length)
                throw new AppError('Google has not confirmed this in Sent. Check Gmail before sending another copy.');
            const m = result.messages[0], metadata = await (await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(m.id) + '?format=metadata', { headers: { Authorization: 'Bearer ' + token } })).json() as {
                internalDate?: string;
            }, date = metadata.internalDate ? new Date(Number(metadata.internalDate)).toISOString().slice(0, 10) : today(), act = activity(date);
            return json({ records: await writeMany([{ old: r, next: { ...r, status: 'Sent', from: v.email, internetMessageId: '<' + r.id.replace(/[^A-Za-z0-9]/g, '') + '@command-post.local>', date, messageId: m.id, threadId: m.threadId } }, ...(a&&!all.some(x => x.id === act.id) ? [{ next: act }] : [])], v, 'Confirmed Google send') });
        }
        if (body.action !== 'send' || r.status !== 'Draft')
            throw new AppError('Only saved drafts can be sent.');
        if (body.version !== r.version)
            throw new ConflictError();
        const files = (r.attachmentIds as string[] || []).map(id => all.find(f => f.id === id && a && f.accountId === a.id && canReadFile(v, f)));
        if (files.some(f => !f))
            throw new AppError('An attachment is no longer available.');
        const token = await mailbox(v), raw = await mime(v, r, files as Row[]), [reserved] = await writeMany([{ old: r, next: { ...r, status: 'Sending' } }], v, 'Requested email send');
        try {
            const sent = await (await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw, ...(r.threadId ? { threadId: r.threadId } : {}) }) })).json() as {
                id: string;
                threadId: string;
            };
            const act = activity(today());
            return json({ records: await writeMany([{ old: reserved, next: { ...reserved, status: 'Sent', from: v.email, internetMessageId: '<' + r.id.replace(/[^A-Za-z0-9]/g, '') + '@command-post.local>', date: today(), messageId: sent.id, threadId: sent.threadId } }, ...(a&&!all.some(x => x.id === act.id) ? [{ next: act }] : [])], v, 'Google confirmed email sent') });
        }
        catch (e) {
            await writeMany([{ old: reserved, next: { ...reserved, status: 'Send unconfirmed' } }], v, 'Email requires confirmation').catch(() => console.error(JSON.stringify({ event: 'accounts.email_confirmation_pending' })));
            throw e;
        }
    }
    catch (e) {
        const r = safeFailure(e, 'accounts.google_action');
        return json(r.body, r.status);
    }
}
