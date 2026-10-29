"""Import only approved fields from supplied Towbook exports. No account creation.
Run: python scripts/account-imports/import_history.py /absolute/upload/folder
Read-only openpyxl; deterministic identities retain multiple payments per call.
"""
import csv, hashlib, json, re, sys
from pathlib import Path
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
import openpyxl
root=Path(__file__).resolve().parents[2]; source=Path(sys.argv[1]); dest=root/'lib/accounts'
seeds=json.loads((dest/'seed-data.json').read_text()); accounts=[r for r in seeds if r['kind']=='account']
normal=lambda v:re.sub('[^a-z0-9]','',str(v or '').lower()).replace('capitalview','capitolview')
lookup={normal(n):a['id'] for a in accounts for n in [a['name']]+a.get('sourceNames',[])}
lookup[normal('7-11 E Slaughter')]=lookup[normal('7-11 Slaughter')]
lookup[normal('814 W Mary St')]=lookup[normal('814 W Mary')]
excluded={'noaccountspecified','nonpaymentconsenttow','impoundfornonpaymentconsent'}
def match(n):return '' if normal(n) in excluded else lookup.get(normal(n),'')
def rows(name):
 w=openpyxl.load_workbook(source/name,read_only=True,data_only=True); rr=list(w['Export'].values); headers=[str(x).strip() for x in rr[2]]
 return [dict(zip(headers,r)) for r in rr[3:] if any(x is not None for x in r)]
def date(x):return x.isoformat()[:10] if hasattr(x,'isoformat') else ''
def txt(x):return str(x or '').strip()
def num(x):return str(int(x)) if isinstance(x,(int,float)) else txt(x)
def cents(x):return int((Decimal(str(x or 0))*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
patches={}; unmatched={}; rr=list(csv.reader((source/'export (25).csv').open(encoding='utf-8-sig')))
for r in map(lambda x:dict(zip(rr[2],x)),rr[3:]):
 n=r.get('Name',''); aid=match(n)
 if aid:patches[aid]={k:txt(r.get(src)) for k,src in [('address','Address'),('phone','Phone')] if txt(r.get(src))}
 elif normal(n) not in excluded:unmatched[n]='Address / phone export'
vehicles=[]; calls={}
for r in rows('CallAnalysis (27).xlsx'):
 aid=match(r['Account Name']); call=num(r['Call Number']); company=txt(r['Company Name']); key=(normal(company),call)
 if normal(r['Account Name']) in excluded:continue
 if not aid:unmatched[txt(r['Account Name'])]='Call analysis';continue
 v={'id':'tow:'+hashlib.sha256(('|'.join(key)).encode()).hexdigest()[:22],'kind':'vehicle','version':0,'name':'Towbook call '+call,'accountId':aid,'callNumber':call,'vin':txt(r['VIN']).upper(),'receivedDate':date(r['Received']),'towDate':date(r['Towing']),'towDateBasis':'Towbook Towing timestamp' if r['Towing'] else 'Actual tow date not recorded','invoiceNumber':num(r['Invoice Number']),'source':'CallAnalysis (27).xlsx'}
 if key in calls:raise ValueError('Duplicate call identity: '+str(key))
 calls[key]=v;vehicles.append(v)
payments=[]; unmatched_payments=[]; occurrences=Counter(); no_call=0
for r in rows('IncomeSummary (10).xlsx'):
 aid=match(r['Account Name']);call=num(r['Call Number']);company=normal(r['Company'])
 if normal(r['Account Name']) in excluded:continue
 if not aid:
  unmatched[txt(r['Account Name'])]='Income summary';unmatched_payments.append({'account':txt(r['Account Name']),'callNumber':call,'paymentDate':date(r['Payment Date']),'cents':cents(r['Payment Amount'])});continue
 v=calls.get((company,call)); v=v if v and v['accountId']==aid else None
 if not v:no_call+=1
 p={'accountId':aid,'vehicleId':v['id'] if v else '', 'callNumber':call,'paymentDate':date(r['Payment Date']),'cents':cents(r['Payment Amount']),'void':str(r['Is Void']).lower() in ['true','yes','1'],'reference':txt(r['Payment Reference']),'method':txt(r['Payment String'])}
 fingerprint=hashlib.sha256(json.dumps(p,sort_keys=True).encode()).hexdigest()[:24];occurrences[fingerprint]+=1;p['id']='payment:'+fingerprint+':'+str(occurrences[fingerprint]);payments.append(p)
# Current profile edits override imported defaults at runtime.
(dest/'history-data.json').write_text(json.dumps({'vehicles':vehicles,'payments':payments,'profileDefaults':patches},separators=(',',':')))
report={'sources':['export (25).csv','CallAnalysis (27).xlsx','IncomeSummary (10).xlsx'],'addressPhoneMatches':len(patches),'vehicles':len(vehicles),'payments':len(payments),'netCollectionCents':sum(p['cents'] for p in payments if not p['void']),'actualTowDates':sum(bool(v['towDate']) for v in vehicles),'paymentsWithoutMatchedCall':no_call,'unmatchedAccounts':unmatched,'unmatchedPayments':unmatched_payments,'excludedAccounts':list(excluded),'notes':['No contact names, tags, property types or gate codes imported from address CSV.','Payment date is collection date. Missing actual tow dates remain unattributed to manager tenure.','VIN and plate are separate identifiers. Plate/state absent in source, left blank.','No invoice balances or invoice totals included in revenue.']}
(dest/'history-import-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
