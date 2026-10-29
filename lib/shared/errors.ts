export class AppError extends Error {
    status: number;
    code: string;
    constructor(message: string, status = 400, code = 'INVALID_INPUT') { super(message); this.status = status; this.code = code; this.name = 'AppError'; }
}
export class ConflictError extends AppError {
    constructor(message = 'This record changed. Refresh it before saving.') { super(message, 409, 'VERSION_CONFLICT'); }
}
export class ForbiddenError extends AppError {
    constructor(message = 'You do not have access to this action.') { super(message, 403, 'FORBIDDEN'); }
}
export function safeFailure(error: unknown, event: string) {
    const requestId = crypto.randomUUID();
    const storage = /SQLITE|D1_|database|binding|R2|fetch failed|internal server/i.test(error instanceof Error ? error.message : '');
    const status = error instanceof AppError ? error.status : error instanceof Error && 'status' in error && [401, 403].includes(Number(error.status)) ? Number(error.status) : storage ? 503 : 400;
    if (status >= 500)
        console.error(JSON.stringify({ event, requestId, status, errorType: error instanceof Error ? error.name : 'Unknown' }));
    return { status, body: { error: status >= 500 ? 'Records are temporarily unavailable. Your changes have not been confirmed. Try refreshing before saving again.' : error instanceof Error ? error.message : 'The request could not be completed.', requestId } };
}
export async function readPayload(request: Request): Promise<Record<string, unknown>> {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
        throw new ForbiddenError('Cross-site request rejected.');
    if (!request.headers.get('content-type')?.includes('application/json'))
        throw new AppError('Send a JSON record.');
    if (Number(request.headers.get('content-length') || 0) > 400000)
        throw new AppError('This record is too large.', 413);
    const text = await request.text();
    if (text.length > 400000)
        throw new AppError('This record is too large.', 413);
    let body: unknown;
    try {
        body = JSON.parse(text);
    }
    catch {
        throw new AppError('The submitted record is not valid JSON.');
    }
    if (!body || Array.isArray(body) || typeof body !== 'object')
        throw new AppError('Submit a record object.');
    return body as Record<string, unknown>;
}
