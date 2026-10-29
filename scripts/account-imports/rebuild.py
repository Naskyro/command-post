import base64, concurrent.futures, datetime, hashlib, io, json, pathlib, re, subprocess
from PIL import Image, ImageOps

root = pathlib.Path(__file__).resolve().parents[2]
scratch = root.parent
raw = json.loads((root/'scripts/account-imports/account-workbooks.json').read_text())
docs = json.loads((root/'scripts/account-imports/courtesy-sources.json').read_text())
inventory = json.loads((root/'scripts/account-imports/signage-inventory.json').read_text())
out = root/'lib/accounts'; out.mkdir(parents=True, exist_ok=True)
assets = out/'source-files'; assets.mkdir(exist_ok=True)
cached={r['id']:r for r in json.loads((out/'seed-data.json').read_text())} if (out/'seed-data.json').exists() else {}
records = {}; aliases = {'3600capitalview':'3600capitolview','alturaapartments':'altura','coleapartments':'thecole','eastridgeluxuryapts':'eastridgeluxuryapartments','mckinneyfallsapartments':'mckinneyfalls','theheightsat8721':'heightsat8721','3600capital':'3600capitolview','capitalview3600':'3600capitolview','citizenhousebergstromthehangar':'citizenhousebergstrom','dominionconstruction':'dominion','enclaveoncreedmoor':'enclavecreedmoor','thebreaker':'thebreakers','thevillas26th':'villason26th','eastridge':'eastridgeluxuryapartments','firestoneroundrock':'firestonecompleteautocareroundrock','meshmain':'mesh','sagehillhomes':'sagehill','eastridgeluxury':'eastridgeluxuryapartments'}
aliases.update({'cliffordpowers':'cliffordpower','cliffordpowersystems':'cliffordpower','cypressmckinneyfalls':'cypresscreekmckinneyfalls','cypressatmckinneyfalls':'cypresscreekmckinneyfalls','dwyerrealtycompanies':'dwyerrealtycompany','garnerhotelsouthwestdelvalle':'garnerhotelaustinsouthwestdelvalle','garnerhotelaustinsouthwestdevalle':'garnerhotelaustinsouthwestdelvalle','bluffspringstownhome':'bluffspringstownhomes','capitalmanormph':'capitolmanormobilehomeparkllc','capitolmanormph':'capitolmanormobilehomeparkllc','wellspringroundrock':'wellspringroundrockhoa','woodspringsuites':'woodspringsuiteshotel','springbookenclave':'springbrookenclave','therails':'therail','firstthebladebarbershop':'firstbladebarbershop','wallerscreek':'wallercreek','preserveathunterscrossing':'thepreserveathunterscrossing','ethiostrucking':'ethiotruckinginc','lakelinecentercondo':'lakelinecenter','thehangaratbergstrom':'citizenhousebergstrom','thebreakersatthelake':'thebreakers','republiccommerical':'republiccommercial'})
def compact(s):return re.sub('[^a-z0-9]','',re.sub(r'\b(apartments?|apts?)\b','',str(s).lower()))
aliases={compact(k):compact(v) for k,v in aliases.items()}
# Compact raw alias words before comparing names whose apartment suffix was removed.
aliases.update({'cole':'thecole','altura':'altura','thevillas26th':'villason26th'})
def norm(s):
    k=compact(s);seen=set()
    while k in aliases and k not in seen:seen.add(k);k=aliases[k]
    return k
def ident(kind, name):return kind+':'+hashlib.sha256(str(name).encode()).hexdigest()[:20]
def add(kind,name,**values):
    row={'id':ident(kind,name),'kind':kind,'version':0,'name':name,**values};records[row['id']]=row;return row
def account(name):
    key='account:'+norm(name)
    if key not in records:records[key]={'id':key,'kind':'account','version':0,'name':str(name).strip(),'status':'Unconfirmed','assignee':'','service':'Unconfirmed'}
    record=records[key]
    record['sourceNames']=sorted(set(record.get('sourceNames',[])+[str(name).strip()]))
    return record
def date(v):
    if not v:return ''
    for fmt in ['%Y-%m-%d','%m/%d/%Y','%m/%d/%y']:
        try:return datetime.datetime.strptime(str(v)[:10],fmt).date().isoformat()
        except ValueError:continue
    return ''
def rows(sheet):
    header=sheet['rows'][0]['values']
    for row in sheet['rows'][1:]:yield {str(k).strip():row['values'][i] if i<len(row['values']) else None for i,k in enumerate(header)},row
for book in raw['workbooks']:
    if book['file']=='Dispatch Property List.xlsx':
        for sheet in book['sheets']:
            if sheet['title']!='Property List':continue
            for r,_ in rows(sheet):
                if not r.get('Property'):continue
                a=account(r['Property']);a.update(jurisdiction=r.get('Law Enforcement Jurisdiction') or '',service=r.get('Status') or 'Unconfirmed',instructions=r.get('Parking Rules') or '',spaceCallAuthority=r.get('Who can call for SPACE CALLS?') or '')
    if book['file']=='Property Agreements .xlsx':
        for sheet in book['sheets'][:1]:
            for r,_ in rows(sheet):
                n=r.get('TowBook Accounts *Not in TowBook')
                if n:a=account(n);a['agreementLocation']='Scanned copy recorded' if r.get('Agreement Scanned?')=='Y' else 'Copy needs verification'
    if book['file']=='Property Command List (1).xlsx':
        for sheet in book['sheets']:
            if 'Archived' in sheet['title']:continue
            for r,_ in rows(sheet):
                n=r.get('Properties') or r.get('Property')
                if not n:continue
                a=account(n);status=str(r.get('Status') or '')
                a.update(status='Terminated' if 'terminat' in status.lower() else 'Cancellation notice' if 'cancel' in status.lower() else 'Paused' if 'pause' in status.lower() else 'Onboarding' if sheet['title']=='Onboarding' else 'Active',propertyType=r.get('Type') or '',gateCode=str(r.get('Gate Code') or ''),launchDate=date(r.get('Confirmed Patrol Start Date')),units=r.get('Number of Apt Units') or '',sourceAssignee=r.get('Account Manager') or '')
                if str(r.get('Account Manager')).lower().startswith('alex'):a['assignee']='alex'
                if r.get('Notes'):add('activity',n+' source notes',accountId=a['id'],channel='Note',details=str(r['Notes']),date='',source=book['file'])
    if book['file']=="Alex's Accounts.xlsx":
        for sheet in book['sheets']:
            for r,_ in rows(sheet):
                if not r.get('Company'):continue
                a=account(r['Company']);a['assignee']='alex';a['officeContact']=str(r.get('Phone/Email') or '')
                if r.get('Notes'):add('activity',a['name']+' relationship notes',accountId=a['id'],channel='Onsite visit' if r.get('Visited?')=='Yes' else 'Note',date=date(r.get('Date of Visit')),details=str(r['Notes']),assignee='alex',source=book['file'])
                name=str(r.get('jhikwq') or '').strip()
                if name and not re.search('pending|unknown|n/a|vacant',name,re.I):
                    contact=add('contact',name,id=ident('contact',name+'|'+(a['officeContact'].lower() or a['id'])),email=a['officeContact'] if '@' in a['officeContact'] else '',phone=a['officeContact'] if '@' not in a['officeContact'] else '',title='Property Manager')
                    add('affiliation',a['id']+':'+contact['id'],accountId=a['id'],contactId=contact['id'],role='Property Manager',startDate='',endDate='');a['primaryContactId']=contact['id']
for company, names in [('Elmington Property Management',['Yager Flats','3600 Capitol View','Wildhorse Flats','The Heights at 8721']),('Sandalwood Living',['Enclave on Ross','Enclave Creedmoor','Douglas Landing'])]:
    c=add('company',company,type='Management company')
    for name in names:
        a=account(name);a['companyId']=c['id'];a['name']=name
release_count=0
for doc in docs:
    if 'Template' in doc['title']:continue
    a=account(doc['title']);text=doc.get('content','');cells=[s.strip() for s in text.split('\t')]
    for i,cell in enumerate(cells):
        d=date(cell)
        if not d:continue
        vehicle,kind,reason,approver,notes=(cells[i+1:i+6]+['']*5)[:5];amount=re.search(r'(?:to|\$)\s*\$?([\d,]+\.\d{2})',kind,re.I)
        code=(reason+' '+notes).lower();category='Towing company error' if re.search(r'dsp err|driver err',code) else 'Property staff vehicle' if re.search(r'prp emp|property employ',code) else 'Leasing office clerical error' if re.search(r'lo err|leasing office error',code) else 'Account preservation' if re.search(r'act psv|preservation',code) else 'Unclassified'
        r=add('courtesy',doc['id']+':'+str(i),accountId=a['id'],date=d,vehicle=vehicle,releaseType='Full courtesy' if kind.lower()=='full' else 'Reduced charge' if 'discount' in kind.lower() or 'reduc' in kind.lower() else 'Unclassified',category=category,status='Imported',reason=reason,details=notes,vin='',vinUnavailableReason='Not recorded in source',managerUnknownReason='Manager tenure was not recorded in the source tracker',sourceReleaseType=kind,sourceApprovedBy=approver,sourceUrl=doc['url'])
        r['name']=vehicle
        if amount:r['amountCharged']=float(amount[1].replace(',',''))
        release_count+=1
for name,detail in [('Confirm property goals and concerns','Record expectations, limitations, communication preferences and who can authorize changes.'),('Confirm agreement and operating plan','Attach the current agreement and confirm the service scope, enforcement schedule and start date.'),('Check signage and property access','Photograph the signs, document entrances and test the gate fob, RFID, key or access code.'),('Prepare resident communications','Save current welcome letters and resident PDFs in the account files.'),('Agree on launch milestones','Set dates and assignees for the launch plan with the property manager.'),('Brief Dispatch and drivers','Confirm the latest operating instructions and unresolved concerns.'),('Check in after launch','Follow up on the property experience and any corrections needed.')]:add('playbook',name,type='Onboarding',details=detail,status='Current',required=name!='Check in after launch',phase='After activation' if name=='Check in after launch' else 'Before activation')
paths={r['driveId']:r['path'] for r in json.loads((scratch/'tmp/signage-paths.json').read_text())}
def photo(f):
    old=cached.get('drive:'+f['id'])
    if old:
        old['accountId']=records.get('account:'+norm(f['folder']),{}).get('id','');inspection=cached[old['inspectionId']].copy();inspection['accountId']=old['accountId'];return old,inspection
    p=pathlib.Path(paths[f['id']]);converted=scratch/'tmp'/(f['id']+'.jpg')
    try:im=Image.open(p)
    except (OSError,ValueError):
        if not converted.exists():subprocess.run(['/opt/codex/runtimes/codex-primary-runtime/dependencies/bin/override/heif-convert',str(p),str(converted)],check=True,capture_output=True)
        im=Image.open(converted)
    ex=im.getexif();stamp=ex.get(36867) or ex.get(306)
    if 34665 in ex:stamp=ex.get_ifd(34665).get(36867) or stamp
    captured=''
    if stamp:
        try:captured=datetime.datetime.strptime(str(stamp)[:19],'%Y:%m:%d %H:%M:%S').date().isoformat()
        except ValueError:captured=''
    image=ImageOps.exif_transpose(im).convert('RGB')
    if not captured:
        ocr=scratch/'tmp'/(f['id']+'-recovery.png');sample=image.copy();sample.thumbnail((1400,1400));sample.save(ocr)
        try:
            result=subprocess.run(['tesseract',str(ocr),'stdout','--psm','11'],capture_output=True,text=True,timeout=18)
            m=re.search(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})[, .]+(202[0-9])',result.stdout,re.I)
            if m:captured=datetime.datetime.strptime(' '.join(m.groups()),'%b %d %Y').date().isoformat()
        except (ValueError,subprocess.TimeoutExpired):captured=''
        ocr.unlink(missing_ok=True)
    image.thumbnail((320,320));b=io.BytesIO();image.save(b,format='JPEG',quality=40,optimize=True);data=b.getvalue();id='drive:'+f['id'];(assets/(id.replace(':','_')+'.json')).write_text(json.dumps({'data':base64.b64encode(data).decode(),'mime':'image/jpeg'}))
    a=records.get('account:'+norm(f['folder']));d=captured or str(f.get('created_time') or '')[:10];iid='inspection:'+f['folderId']+':'+d
    return {'id':id,'kind':'file','version':0,'name':f['title'],'accountId':a['id'] if a else '', 'inspectionId':iid,'category':'Signage','status':'Current','sourceFileId':f['id'],'sourceFolder':f['folder'],'sourceUrl':f['url'],'mimeType':'image/jpeg','size':len(data),'date':d,'dateConfirmed':bool(captured)}, {'id':iid,'kind':'inspection','version':0,'name':f['folder']+' signage','accountId':a['id'] if a else '', 'date':d,'dateConfirmed':bool(captured),'complete':bool(captured),'condition':'Unknown','sourceFolder':f['folder']}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    for f,i in pool.map(photo,inventory):records[f['id']]=f;records[i['id']]=i
for id,name,category,property in [('courtesy-policy','Vehicle Release Policy.pdf','Internal policy',''),('courtesy-guide','Release Tracker Guide.pdf','Internal policy',''),('brazos-welcome','Brazos Lofts Welcome Letter.pdf','Welcome letter','Brazos Lofts'),('wildhorse-welcome','Wildhorse Flats Flyer Letter.pdf','Resident letter','Wildhorse Flats'),('sage-timeline','Sage Hill Permit System Sign-Up Plan.pdf','Timeline','Sage Hill'),('wildhorse-agreement','Wildhorse Flats Contract.pdf','Agreement','Wildhorse Flats')]:
    p=next((scratch/'tmp/courtesy').rglob(name)) if id.startswith('courtesy-') else scratch/'upload'/name
    data=p.read_bytes();(assets/(id+'.json')).write_text(json.dumps({'data':base64.b64encode(data).decode(),'mime':'application/pdf'}));records[id]={'id':id,'kind':'file','version':0,'name':name,'category':category,'accountId':account(property)['id'] if property else '', 'status':'Current','mimeType':'application/pdf','size':len(data),'sourceFileId':id}
(out/'seed-data.json').write_text(json.dumps(list(records.values()),indent=2,ensure_ascii=False))
(root/'scripts/account-imports/account-workbooks.json').write_text(json.dumps({'workbooks':[w for w in raw['workbooks'] if not re.search('permit|reserved',w['file'],re.I)]}))
print(json.dumps({'records':len(records),'releases':release_count,'photos':len(inventory),'unmatched':sorted({f['sourceFolder'] for f in records.values() if f['kind']=='file' and f.get('category')=='Signage' and not f.get('accountId')})}))
