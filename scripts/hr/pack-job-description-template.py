"""Prepare the worker's offline font/artwork bundle and web PDF logo from the tracked menu artwork."""
from pathlib import Path
import base64, json, subprocess
from PIL import Image
import tempfile
root=Path(__file__).resolve().parents[2]
public=root/'public'/'hr'/'job-description'
with tempfile.TemporaryDirectory() as tmp:
    path=Path(tmp)/'logo.png'
    subprocess.run(['inkscape',str(root/'public/pte-road.svg'),'--export-width=1000','--export-filename='+str(path)],check=True)
    # The supplied main-menu artwork includes white letters. Keep its original colours
    # on a black backing rather than losing the company name against white paper.
    im=Image.open(path).convert('RGBA')
    crop=im.getchannel('A').getbbox()
    if crop: im=im.crop(crop)
    card=Image.new('RGB',(984,480),'#121212')
    im.thumbnail((928,428),Image.Resampling.LANCZOS)
    card.paste(im,((card.width-im.width)//2,(card.height-im.height)//2),im)
    card.save(public/'pte-road-print.png',optimize=True)
files={'regular':'LiberationSans-Regular.ttf','bold':'LiberationSans-Bold.ttf','parkingLogo':'pte-road-print.png','towingLogo':'galindos-logo.png'}
out={key:base64.b64encode((public/name).read_bytes()).decode('ascii') for key,name in files.items()}
private=root/'lib/hr/job-description-template-assets.json';private.write_text(json.dumps(out,separators=(',',':'))+'\n')
