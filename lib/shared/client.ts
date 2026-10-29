export async function timedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
        return await fetch(input, { ...init, cache: 'no-store', signal: controller.signal });
    }
    catch (e) {
        if (e instanceof Error && e.name === 'AbortError')
            throw new Error('The request timed out. Refresh to check whether it saved before trying again.');
        throw new Error('Connection lost. Your form is still open; refresh the records before retrying.');
    }
    finally {
        clearTimeout(timer);
    }
}
export async function requestJson<T>(url: string, body?: Record<string, unknown>, method?: string): Promise<T> {
    let init: RequestInit = {};
    if (body !== undefined) {
        init = { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    } else if (method) {
        init = { method };
    }
    const res = await timedFetch(url, init);
    let value: unknown;
    try {
        value = await res.json();
    }
    catch {
        throw new Error('The server returned an unreadable response. Refresh and try again.');
    }
    if (!res.ok)
        throw new Error(typeof value === 'object' && value && 'error' in value ? String(value.error) : res.status === 429 ? 'Too many requests. Wait a moment and try again.' : 'The request could not be completed.');
    return value as T;
}
