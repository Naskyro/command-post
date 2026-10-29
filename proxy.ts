import { NextRequest, NextResponse } from 'next/server';

// Dev-mode auth: injects the ChatGPT identity headers from a cookie
// so local development works without the ChatGPT hosting gateway.
// In production this cookie will never be set and this is a no-op.
export function proxy(request: NextRequest) {
  const devEmail = request.cookies.get('dev_user_email')?.value;
  const devName  = request.cookies.get('dev_user_name')?.value;
  const devId    = request.cookies.get('dev_user_id')?.value;

  if (!devEmail || request.headers.get('oai-authenticated-user-email')) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('oai-authenticated-user-email', devEmail);
  if (devName) requestHeaders.set('oai-authenticated-user-full-name', devName);
  if (devId)   requestHeaders.set('oai-authenticated-user-id', devId);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
