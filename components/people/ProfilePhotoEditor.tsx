'use client';
import {delegatedUrl} from '@/lib/shared/client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Trash2, Upload } from 'lucide-react';
import PersonAvatar from './PersonAvatar';
import { drawProfilePhoto, photoCrop, photoOutputSize } from '@/lib/people/photo-framing';

type PhotoMetadata = { version: number; hasPhoto: boolean; updatedAt: string | null; canEdit: boolean };
export type ProfilePhotoEditorProps = { personId: string; name: string; contact?:{surface:'sales'|'accounts';relationId?:string}; onSaved?: () => void | Promise<void>; onClose?: () => void };
const controlStyle = { display: 'grid', gap: 4 } as const;
const labelStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 } as const;
const hintStyle = { margin: 0, fontSize: 13, color: 'var(--f-muted, #526071)' } as const;

function positionLabel(value: number, start: string, end: string) {
  return value === 50 ? 'Center' : Math.abs(value - 50) * 2 + '% ' + (value < 50 ? start : end);
}

export default function ProfilePhotoEditor({ personId, name, contact, onSaved, onClose }: ProfilePhotoEditorProps) {
  const entityKey=contact?'contactId':'personId';
  const uploadUrl=contact?'/api/relationships/photo?'+new URLSearchParams({contactId:personId,surface:contact.surface,...(contact.relationId?{relationId:contact.relationId}:{})}):'/api/people/photo';
  const metadataUrl=contact?uploadUrl+'&metadata=1':uploadUrl+'?metadata=1&personId='+encodeURIComponent(personId);
  const inputId = useId(), input = useRef<HTMLInputElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [metadata, setMetadata] = useState<PhotoMetadata | null>(null), [file, setFile] = useState<File | null>(null);
  const [decoded, setDecoded] = useState<{source:File; bitmap:ImageBitmap} | null>(null);
  const [zoom, setZoom] = useState(1), [offsetX, setOffsetX] = useState(50), [offsetY, setOffsetY] = useState(50);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const image = decoded && decoded.source === file ? decoded.bitmap : null;
  useEffect(() => {
    let cancelled = false;
    void fetch(metadataUrl, { cache: 'no-store' }).then(async response => { const result = await response.json() as PhotoMetadata & {error?:string}; if (!response.ok) throw new Error(result.error || 'Photo settings could not be loaded.'); if (!cancelled) setMetadata(result); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [metadataUrl]);

  useEffect(() => {
    if (!file) return;
    let disposed = false, opened: ImageBitmap | undefined;
    async function decode(source:File) {
      try {
        const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
        if (disposed) { bitmap.close(); return; }
        opened = bitmap;
        if (bitmap.width < 16 || bitmap.height < 16 || bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 24_000_000) throw new Error('Choose a photo at least 16 pixels per side, up to 24 megapixels and 8,192 pixels per side.');
        setDecoded({ source, bitmap });
      } catch (e) {
        if (!disposed) { setError(e instanceof Error && !(e instanceof DOMException) ? e.message : 'This image could not be opened. Choose another photo.'); setFile(null); setDecoded(null); }
      }
    }
    void decode(file);
    return () => { disposed = true; opened?.close(); };
  }, [file]);

  // The visible preview is also the square image we encode on Save. The circular
  // border is only a display mask, just as it is on the saved profile avatar.
  useLayoutEffect(() => {
    if (!image || !canvas.current) return;
    const ctx = canvas.current.getContext('2d');
    if (!ctx) { setError('Your browser could not process this photo.'); setFile(null); setDecoded(null); return; }
    drawProfilePhoto(ctx, image, zoom, offsetX, offsetY);
  }, [image, zoom, offsetX, offsetY]);

  function reset() { setZoom(1); setOffsetX(50); setOffsetY(50); }
  function choose(value: File | undefined) {
    if (!value) return;
    setError(''); setMessage('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(value.type) || value.size > 5 * 1024 * 1024) { setError('Choose a JPG, PNG, or WebP photo up to 5 MB.'); return; }
    setDecoded(null); setFile(value); reset();
  }
  async function save(action: 'upload' | 'remove') {
    if (!metadata || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData(); form.set(entityKey, personId); form.set('version', String(metadata.version)); form.set('action', action);
      if (action === 'upload') {
        const preview = canvas.current;
        if (!image || !preview) throw new Error('Wait for the photo preview before saving.');
        const blob = await new Promise<Blob>((resolve, reject) => preview.toBlob(value => value ? resolve(value) : reject(new Error('Your browser could not process this photo.')), 'image/jpeg', .9));
        form.set('file', new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' }));
      }
      const response = await fetch(uploadUrl, { method: 'POST', body: form }), result = await response.json() as Pick<PhotoMetadata,'version'|'hasPhoto'|'updatedAt'> & {error?:string};
      if (!response.ok) throw new Error(result.error || 'The photo could not be saved.');
      setMetadata({ ...metadata, ...result }); setFile(null); setDecoded(null); if (input.current) input.current.value = '';
      window.dispatchEvent(new CustomEvent(contact?'contact-portrait-updated':'profile-photo-updated', { detail: { [entityKey]:personId, version: result.version,hasPhoto:result.hasPhoto } }));
      setMessage(action === 'remove' ? 'Profile photo removed.' : 'Profile photo saved.'); await onSaved?.();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const crop = image ? photoCrop(image.width, image.height, zoom, offsetX, offsetY) : null;
  const canPanX = !!image && !!crop && image.width > crop.side;
  const canPanY = !!image && !!crop && image.height > crop.side;
  const horizontalLabel = positionLabel(canPanX ? offsetX : 50, 'left', 'right');
  const verticalLabel = positionLabel(canPanY ? offsetY : 50, 'up', 'down');
  return <div className="profile-photo-editor" style={{ display: 'grid', gap: 14, padding: '8px 0', width: '100%', maxWidth: 480, margin: '0 auto', ...(onClose ? {maxHeight:'calc(100dvh - 8rem)', overflowY:'auto'} : {}) }}>
    <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
      {file ? image ? <canvas ref={canvas} width={photoOutputSize} height={photoOutputSize} role="img" aria-label="New Headshot Preview" style={{display:'block', width:'min(176px, 32vh)', height:'auto', aspectRatio:'1', borderRadius:'50%', border:'2px solid var(--f-border, #dbe4ee)'}} /> : <p role="status">Preparing Photo Preview…</p> : contact ? metadata?.hasPhoto?<img alt={name+"'s current photo"} src={delegatedUrl(uploadUrl+'&v='+metadata.version)} style={{width:160,height:160,objectFit:'cover',borderRadius:'50%'}}/>:<span style={{width:100,height:100,display:'grid',placeItems:'center',borderRadius:'50%',fontSize:34,color:'#294a47',background:'#e6efec'}} aria-hidden="true">{name.split(/\s+/).map(w=>w[0]).slice(0,2).join('')}</span> : <PersonAvatar personId={personId} name={name} size={160} version={metadata?.version} />}
      <strong>{name}</strong>
    </div>
    {metadata?.canEdit && <>
      <input ref={input} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} disabled={busy} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}><button type="button" className="f-button" onClick={() => input.current?.click()} disabled={busy}><Upload size={17} />{file ? 'Choose Another Photo' : 'Upload Photo'}</button>{metadata.hasPhoto && !file && <button type="button" className="f-button" onClick={() => void save('remove')} disabled={busy}><Trash2 size={16} />Remove Photo</button>}</div>
      {!file && <p style={{ ...hintStyle, textAlign: 'center' }}>JPG, PNG, or WebP · Up to 5 MB</p>}
      {image && <>
        <div style={controlStyle}><div style={labelStyle}><label htmlFor={inputId+'-zoom'}>Zoom</label><span style={hintStyle}>{Math.round(zoom * 100)}%</span></div><input id={inputId+'-zoom'} type="range" min="1" max="2.5" step="0.05" value={zoom} aria-valuetext={Math.round(zoom*100)+'%'} onChange={event => setZoom(Number(event.target.value))} disabled={busy} /></div>
        <div style={controlStyle}><div style={labelStyle}><label htmlFor={inputId+'-x'}>Horizontal Position</label><span style={hintStyle}>{horizontalLabel}</span></div><input id={inputId+'-x'} type="range" min="0" max="100" step="1" value={canPanX ? offsetX : 50} aria-valuetext={horizontalLabel} aria-describedby={!canPanX ? inputId+'-hint' : undefined} onChange={event => setOffsetX(Number(event.target.value))} disabled={busy || !canPanX} /></div>
        <div style={controlStyle}><div style={labelStyle}><label htmlFor={inputId+'-y'}>Vertical Position</label><span style={hintStyle}>{verticalLabel}</span></div><input id={inputId+'-y'} type="range" min="0" max="100" step="1" value={canPanY ? offsetY : 50} aria-valuetext={verticalLabel} aria-describedby={!canPanY ? inputId+'-hint' : undefined} onChange={event => setOffsetY(Number(event.target.value))} disabled={busy || !canPanY} /></div>
        {(!canPanX || !canPanY) && <p id={inputId+'-hint'} style={hintStyle}>Zoom in to move the crop {canPanX ? 'up or down' : canPanY ? 'left or right' : 'in either direction'}.</p>}
        <div style={{ display:'flex', gap:10, justifyContent:'space-between', flexWrap:'wrap' }}><button type="button" className="f-button" onClick={reset} disabled={busy || (zoom===1 && offsetX===50 && offsetY===50)}><RotateCcw size={15}/>Reset Crop</button><button type="button" className="f-button primary" onClick={() => void save('upload')} disabled={busy}><Camera size={17} />{busy ? 'Saving Photo…' : 'Save Photo'}</button></div>
      </>}
    </>}
    {!metadata && !error && <p role="status">Loading Photo Settings…</p>}
    {metadata && !metadata.canEdit && <p>You do not have permission to change this person’s photo.</p>}
    {error && <p role="alert" className="f-error">{error}</p>}{message && <p role="status">{message}</p>}
    {onClose && <button type="button" className="f-button" onClick={onClose} disabled={busy}>Done</button>}
  </div>;
}
