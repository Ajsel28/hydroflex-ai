import type {
  DataSources,
  ExperimentsResponse,
  Health,
  InvestmentRequest,
  ModelMetadata,
  ProfilesResponse,
  RunPayload,
  ScenariosResponse,
  SimulateRequest,
  StochasticRequest,
  StoredExperiment,
} from './types';

const env = import.meta.env as Record<string, string | undefined>;
/** Base for model metadata, data provenance and reference experiments (same-origin static snapshot in production). */
export const API_BASE: string = (env.VITE_API_BASE ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
/**
 * Base for the live solver: health, optimisation POSTs, the run registry and session runs. In production this is
 * the Render backend (https://hydroflex-api.onrender.com), called directly with CORS so long solves are not cut by
 * a proxy timeout and rate limits apply per visitor. Defaults to API_BASE (local development).
 */
export const LIVE_API_BASE: string = (env.VITE_LIVE_API_BASE ?? env.VITE_API_BASE ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
/** Reference artefacts produced by the experiment pipeline are immutable and served from the static snapshot. */
export const isReferenceId = (id: string): boolean => /^(ref|exp)-/.test(id);

export interface FieldError {
  loc: string[];
  msg: string;
}

/** Error raised for any non-2xx response or network failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldError[];
  readonly aborted: boolean;

  constructor(message: string, status: number, fieldErrors: FieldError[] = [], aborted = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.aborted = aborted;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isNetwork(): boolean {
    return this.status === 0 && !this.aborted;
  }
}

/** Parse a FastAPI error body: `detail` may be a string or a list of `{loc,msg}`. */
export function parseErrorDetail(body: unknown, status: number): { message: string; fieldErrors: FieldError[] } {
  const fallback = statusText(status);
  if (!body || typeof body !== 'object') return { message: fallback, fieldErrors: [] };
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === 'string') return { message: detail, fieldErrors: [] };
  if (Array.isArray(detail)) {
    const fieldErrors: FieldError[] = detail
      .filter((d): d is { loc?: unknown; msg?: unknown } => !!d && typeof d === 'object')
      .map((d) => ({
        loc: Array.isArray(d.loc) ? d.loc.map((x) => String(x)).filter((x) => x !== 'body') : [],
        msg: typeof d.msg === 'string' ? d.msg : 'Invalid value',
      }));
    const message = fieldErrors.length
      ? fieldErrors.map((f) => (f.loc.length ? `${f.loc.join('.')}: ${f.msg}` : f.msg)).join('; ')
      : fallback;
    return { message, fieldErrors };
  }
  return { message: fallback, fieldErrors: [] };
}

function statusText(status: number): string {
  switch (status) {
    case 404:
      return 'Not found';
    case 422:
      return 'Validation error';
    case 429:
      return 'Rate limit reached — wait a few minutes before running again';
    case 503:
      return 'Solver busy — another optimisation is running; try again shortly';
    default:
      return `Request failed (HTTP ${status})`;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Override the base URL (defaults to API_BASE). */
  base?: string;
}

export async function request<T>(path: string, init: RequestInit = {}, opts: RequestOptions = {}): Promise<T> {
  const f = opts.fetchImpl ?? fetch;
  const base = opts.base ?? API_BASE;
  let res: Response;
  try {
    res = await f(`${base}${path}`, {
      ...init,
      signal: opts.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    if (aborted || opts.signal?.aborted) throw new ApiError('Request cancelled', 0, [], true);
    throw new ApiError(`API unreachable at ${base || window.location.origin}`, 0);
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const { message, fieldErrors } = parseErrorDetail(body, res.status);
    throw new ApiError(message, res.status, fieldErrors);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('Malformed JSON response', res.status);
  }
}

const post = <T>(path: string, body: unknown, opts?: RequestOptions) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) }, opts);

/* --------- small in-memory cache for immutable GETs (stored experiments) --------- */
const cache = new Map<string, Promise<unknown>>();

function cachedGet<T>(path: string, base: string = API_BASE): Promise<T> {
  const key = `${base}${path}`;
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const p = request<T>(path, {}, { base }).catch((e: unknown) => {
    cache.delete(key); // never cache failures (e.g. a reference artefact not generated yet)
    throw e;
  });
  cache.set(key, p);
  return p;
}

const live = (opts?: RequestOptions): RequestOptions => ({ ...opts, base: LIVE_API_BASE });

/** Run registry from the live API; if it is asleep or unreachable, fall back to the static reference list. */
async function experimentsWithFallback(opts?: RequestOptions): Promise<ExperimentsResponse> {
  try {
    return await request<ExperimentsResponse>('/api/experiments', {}, live(opts));
  } catch (e) {
    if (LIVE_API_BASE === API_BASE || (e instanceof ApiError && e.aborted)) throw e;
    return request<ExperimentsResponse>('/api/experiments', {}, { ...opts, base: API_BASE });
  }
}

export function clearCache(): void {
  cache.clear();
}

export const api = {
  health: (opts?: RequestOptions) => request<Health>('/api/health', {}, live(opts)),
  metadata: () => cachedGet<ModelMetadata>('/api/model/metadata'),
  sources: () => cachedGet<DataSources>('/api/data/sources'),
  profiles: (startDay = 0, days = 365, resolutionH = 24) =>
    cachedGet<ProfilesResponse>(`/api/data/profiles?start_day=${startDay}&days=${days}&resolution_h=${resolutionH}`),
  scenarios: () => cachedGet<ScenariosResponse>('/api/scenarios'),
  experiments: (opts?: RequestOptions) => experimentsWithFallback(opts),
  experiment: <T extends StoredExperiment = StoredExperiment>(id: string) =>
    cachedGet<T>(`/api/experiments/${encodeURIComponent(id)}`, isReferenceId(id) ? API_BASE : LIVE_API_BASE),
  simulate: (body: SimulateRequest, opts?: RequestOptions) => post<RunPayload>('/api/simulate', body, live(opts)),
  optimizeInvestments: (body: InvestmentRequest, opts?: RequestOptions) =>
    post<RunPayload>('/api/optimize/investments', body, live(opts)),
  optimizeStochastic: (body: StochasticRequest, opts?: RequestOptions) =>
    post<RunPayload>('/api/optimize/stochastic', body, live(opts)),
};

export type DownloadFormat = 'json' | 'csv' | 'metrics_csv';
export const downloadUrl = (id: string, format: DownloadFormat) =>
  `${isReferenceId(id) ? API_BASE : LIVE_API_BASE}/api/experiments/${encodeURIComponent(id)}/download?format=${format}`;
export const paperUrl = `${API_BASE}/api/paper`;

/** Pre-seed the cache with a payload obtained from a POST so navigation does not refetch it. */
export function primeExperiment(payload: { run_id: string }): void {
  cache.set(`${isReferenceId(payload.run_id) ? API_BASE : LIVE_API_BASE}/api/experiments/${encodeURIComponent(payload.run_id)}`,
    Promise.resolve(payload));
}
