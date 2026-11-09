"""Rebuild private 2026 SOP import from an operator-supplied ZIP. Requires PyMuPDF.
Run: python scripts/sop/import_archive.py /path/to/SOP_Documents.zip
No archive extraction, external requests, publication or live writes.
"""
import base64, csv, hashlib, io, json, re, sys, zipfile
from pathlib import Path
import fitz
dest = Path(__file__).resolve().parents[2]/'lib/sop/private'
dest.mkdir(parents=True,exist_ok=True)
def dump(name,value):
    (dest/name).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
topics={}; rows=[]; pdf_objects=[]; object_ids={}; pdf_index={}
def txt(s): return ' '.join(s.replace('\xa0',' ').split())
def read_sections(doc):
    sections=[];heading=None; body=[]; cells=[]
    def flush_cells():
        if cells:
            body.append(' | '.join(' '.join(x) for x in cells));cells.clear()
    def flush():
        flush_cells()
        if heading: sections.append({'heading':heading,'text':'\n'.join(body)})
        body.clear()
    for page in doc:
        # A row label and its body can be separate blocks at the same baseline.
        # Locate section bands by their original template typography (both template revisions).
        blocks=page.get_text('dict',flags=0)['blocks']; blocks=[b for b in blocks if b['type']==0]
        bands=[(b['bbox'][1],b) for b in blocks if 64<b['bbox'][0]<70 and 11<b['lines'][0]['spans'][0]['size']<11.3]
        bands.sort(key=lambda v:v[0]);start=64 if page.number else (bands[0][0] if bands else 748)
        pieces=[(start-1,None)]+bands
        for i,(y,b) in enumerate(pieces):
            if b:
                flush();heading=txt(' '.join(''.join(s['text'] for s in l['spans']) for l in b['lines']))
            if not heading: continue
            maxy=pieces[i+1][0] if i+1<len(pieces) else 748
            active_blocks=[k for k in blocks if y<k['bbox'][1]<maxy and k is not b]
            # The original ALL-031 revision table has separate overlay text runs
            # drawn 2pt above the corresponding row labels. Anchor same-row cells
            # to the actual first-column baseline to preserve all four columns.
            anchors=[k['bbox'][1] for k in active_blocks if 56<=k['bbox'][0]<100]
            def table_order(k):
                y0=k['bbox'][1]
                if heading=='Revision History' and anchors:
                    nearest=min(anchors,key=lambda v:abs(v-y0))
                    if abs(nearest-y0)<4: y0=nearest
                return (round(y0/3),k['bbox'][0])
            for block in sorted(active_blocks,key=table_order):
                lines=[(l['bbox'][0],txt(''.join(s['text'] for s in l['spans']))) for l in block['lines']]
                if heading in ('Responsibilities','Procedure','Corrective Action References','Revision History') and block['bbox'][0]>=56 and block['bbox'][0]<558:
                    cut=[110,470] if heading=='Corrective Action References' else [125,208,430] if heading=='Revision History' else [170]
                    if lines[0][0]<cut[0]: flush_cells()
                    if not cells: cells.extend([[] for _ in range(len(cut)+1)])
                    for left,line in lines:
                        ix=sum(left>=c for c in cut);cells[ix].append(line)
                else:
                    flush_cells()
                    body.append(' '.join(line for _,line in lines))
        flush_cells()
    flush()
    return sections
with zipfile.ZipFile(sys.argv[1]) as z:
    manifest=next(n for n in z.namelist() if n.endswith('.csv'))
    records=list(csv.DictReader(io.StringIO(z.read(manifest).decode('utf-8-sig'))));codes={r['Policy ID'] for r in records}
    for r in records:
        code=r['Policy ID'];prefix=r['Category'];name=r['Relative PDF File'];binary=z.read(name)
        # Reusable, byte-identical PDF objects (logo, fonts etc.) are stored only once.
        parts=re.split(rb'(?m)(?=^\d+ \d+ obj\b|^xref\b)',binary)
        indices=[]
        for part in parts:
            digest=hashlib.sha256(part).digest()
            if digest not in object_ids:object_ids[digest]=len(pdf_objects);pdf_objects.append(base64.b64encode(part).decode())
            indices.append(object_ids[digest])
        assert binary==b''.join(base64.b64decode(pdf_objects[i]) for i in indices)
        assert code not in pdf_index
        pdf_index[code]=indices
        with fitz.open(stream=binary,filetype='pdf') as d:
            assert len(d)==int(r['Standalone Pages'])
            full='\n'.join(p.get_text() for p in d);sections=read_sections(d)
            sig=re.search(r'([^\n]+)\s+\('+re.escape(prefix)+r'\)\s*\|',full)
            if sig: topics[prefix]=sig[1].rsplit('|',1)[-1].strip()
            assert sections[0]['heading']=='Purpose'
            refs=sorted((set(re.findall(r'\b(?:HR-CA|[A-Z]{2,4})-\d{3}\b',full+' '+r['HR-CA References'])) & codes) - {code})
            guidance=r['Status'].startswith('Needs Guidance')
            content={'title':r['Title'],'shortName':r['Short Name'],'policyOwner':r['Policy Owner'] or r['Decision Owner'],'preparedDate':'2026-10-31','effectiveDate':r['Effective or Target Date'],'revision':'0.1' if guidance else '1.0','approvalStatus':'Not Issued — Guidance Needed' if guidance else 'Ready for COO Issue','sections':sections,'relatedIds':refs,'keywords':r['Short Name']+' '+(topics.get(prefix) or prefix)}
            rows.append({'id':code,'topicId':prefix,'sourceStatus':r['Status'],'sourceFile':name,'pages':len(d),'content':content})
    # Keep workbook register fields as private source provenance, not issued policy language.
    dump('source-register.json',records)
assert len(rows)==len(pdf_index)==len(codes)==223
dump('objects.json',pdf_objects);dump('original-files.json',pdf_index);dump('catalog.json',rows);dump('topics.json',[{'id':k,'name':v} for k,v in sorted(topics.items())])
print(f'{len(rows)} policies, {len(topics)} topics, {len(pdf_objects)} unique PDF fragments; all source bytes verified.')
