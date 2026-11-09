'use client';
import {delegatedUrl} from '@/lib/shared/client';
import { useEffect, useState } from 'react';

export type PersonAvatarProps = { personId: string; name: string; size?: number; version?: string | number; className?: string };
export default function PersonAvatar({ personId, name, size = 42, version = '', className = '' }: PersonAvatarProps) {
  const [revision, setRevision] = useState(0), [failed, setFailed] = useState('');
  useEffect(() => {
    const update = (event: Event) => { if ((event as CustomEvent<{ personId: string }>).detail?.personId === personId) setRevision(value => value + 1); };
    window.addEventListener('profile-photo-updated', update);
    return () => window.removeEventListener('profile-photo-updated', update);
  }, [personId]);
  const src = '/api/people/photo?personId=' + encodeURIComponent(personId) + '&v=' + encodeURIComponent(String(version)) + '-' + revision;
  const initials = name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?';
  return <span className={'person-avatar ' + className} role="img" aria-label={name + ' Profile Photo'} style={{ width: size, height: size, minWidth: size, maxWidth: size, minHeight: size, maxHeight: size, aspectRatio: '1 / 1', boxSizing: 'border-box', borderRadius: '50%', display: 'inline-flex', position: 'relative', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--f-blue-soft, #e5eefb)', color: 'var(--f-blue, #175ca5)', fontWeight: 700, fontSize: Math.max(13, size * .34), flex: `0 0 ${size}px` }}>
    <span aria-hidden="true">{initials}</span>
    {personId && failed !== src && <img src={delegatedUrl(src)} alt="" loading="lazy" onError={() => setFailed(src)} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, objectFit: 'cover' }} />}
  </span>;
}
