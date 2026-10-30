import { describe, expect, it, vi } from 'vitest';
import { ApiError, parseErrorDetail, request } from './client';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseErrorDetail', () => {
  it('reads string detail', () => {
    expect(parseErrorDetail({ detail: 'unknown run id' }, 404)).toEqual({ message: 'unknown run id', fieldErrors: [] });
  });
  it('reads FastAPI validation lists and strips the body prefix', () => {
    const r = parseErrorDetail(
      { detail: [{ loc: ['body', 'scenario_overrides', 'drought_severity'], msg: 'Input should be less than or equal to 0.9', type: 'x' }] },
      422,
    );
    expect(r.fieldErrors).toEqual([{ loc: ['scenario_overrides', 'drought_severity'], msg: 'Input should be less than or equal to 0.9' }]);
    expect(r.message).toBe('scenario_overrides.drought_severity: Input should be less than or equal to 0.9');
  });
  it('falls back to status text', () => {
    expect(parseErrorDetail(null, 503).message).toMatch(/Solver busy/);
    expect(parseErrorDetail({}, 429).message).toMatch(/Rate limit/);
  });
});

describe('request', () => {
  it('returns parsed JSON on success', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok' }));
    await expect(request('/api/health', {}, { fetchImpl: f })).resolves.toEqual({ status: 'ok' });
    expect(f).toHaveBeenCalledWith(expect.stringMatching(/\/api\/health$/), expect.any(Object));
  });
  it('throws ApiError with field errors on 422', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(422, { detail: [{ loc: ['body', 'horizon', 'hours'], msg: 'too small' }] }));
    const err = await request('/api/simulate', { method: 'POST', body: '{}' }, { fetchImpl: f }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(422);
    expect((err as ApiError).fieldErrors[0].loc).toEqual(['horizon', 'hours']);
  });
  it('flags 404 as not found', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(404, { detail: 'unknown run id' }));
    const err = (await request('/api/experiments/ref-x', {}, { fetchImpl: f }).catch((e: unknown) => e)) as ApiError;
    expect(err.isNotFound).toBe(true);
    expect(err.message).toBe('unknown run id');
  });
  it('maps network failures to status 0', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await request('/api/health', {}, { fetchImpl: f }).catch((e: unknown) => e)) as ApiError;
    expect(err.isNetwork).toBe(true);
    expect(err.message).toMatch(/unreachable/);
  });
  it('reports aborted requests as cancelled, not network errors', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const f = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const err = (await request('/api/simulate', {}, { fetchImpl: f, signal: ctrl.signal }).catch((e: unknown) => e)) as ApiError;
    expect(err.aborted).toBe(true);
    expect(err.isNetwork).toBe(false);
  });
  it('handles non-JSON error bodies', async () => {
    const f = vi.fn().mockResolvedValue(new Response('<html>', { status: 500 }));
    const err = (await request('/x', {}, { fetchImpl: f }).catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(500);
    expect(err.message).toBe('Request failed (HTTP 500)');
  });
});
