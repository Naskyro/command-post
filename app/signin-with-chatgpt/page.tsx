'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const USERS = [
  { id: 'jerson',   name: 'Jerson Arauz',        email: 'jerson@gtowingtransport.com',   role: 'Owner' },
  { id: 'austin',   name: 'Austin Koska',         email: 'austin@gtowingtransport.com',   role: 'Operations Director' },
  { id: 'alex',     name: 'Alex Englert',         email: 'alex@gtowingtransport.com',     role: 'Account Manager' },
  { id: 'nessa',    name: 'Nessa Rios',           email: 'nessa@gtowingtransport.com',    role: 'Dispatcher' },
  { id: 'braden',   name: 'Braden Martinelli',    email: 'braden@gtowingtransport.com',   role: 'Vehicle Sales' },
  { id: 'juan',     name: 'Juan Garza',           email: 'juan@gtowingtransport.com',     role: 'Operations' },
  { id: 'dalila',   name: 'Dalila Ferrer',        email: 'dalila@gtowingtransport.com',   role: 'Dispatch' },
  { id: 'gabrielle',name: 'Gabrielle Jones',      email: 'gabrielle@gtowingtransport.com',role: 'Dispatch' },
];

function SignInForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('return_to') || '/';

  const signIn = (user: typeof USERS[0]) => {
    document.cookie = `dev_user_email=${user.email}; path=/; max-age=86400`;
    document.cookie = `dev_user_name=${user.name}; path=/; max-age=86400`;
    document.cookie = `dev_user_id=${user.id}; path=/; max-age=86400`;
    window.location.href = returnTo;
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#111',
        border: '1px solid #333',
        borderRadius: '12px',
        padding: '40px',
        width: '100%',
        maxWidth: '420px',
      }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, margin: '0 0 8px' }}>
            Command Post
          </h1>
          <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>
            Dev sign-in — pick a user to continue
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {USERS.map(user => (
            <button
              key={user.id}
              onClick={() => signIn(user)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: '#2563eb', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, fontSize: '14px',
                flexShrink: 0,
              }}>
                {user.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{user.name}</div>
                <div style={{ color: '#888', fontSize: '12px' }}>{user.role}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
