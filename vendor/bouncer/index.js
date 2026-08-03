// src/client.ts
var DEFAULT_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504];
function sleep(ms, signal) {
  if (ms <= 0)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    let onAbort = () => {
      clearTimeout(timer), reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }, timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort), resolve();
    }, ms);
    if (signal) {
      if (signal.aborted)
        return onAbort();
      signal.addEventListener("abort", onAbort, { once: !0 });
    }
  });
}
function computeDelay(attempt, baseDelayMs, maxDelayMs, jitter) {
  let exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  switch (jitter) {
    case "none":
      return exp;
    case "equal": {
      let half = exp / 2;
      return half + Math.random() * half;
    }
    case "full":
    default:
      return Math.random() * exp;
  }
}
function parseRetryAfter(value) {
  if (!value)
    return;
  let seconds = Number(value);
  if (!Number.isNaN(seconds))
    return seconds * 1000;
  let dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs))
    return Math.max(0, dateMs - Date.now());
  return;
}
function combineSignals(...signals) {
  let controller = new AbortController, cleanups = [];
  for (let signal of signals) {
    if (!signal)
      continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    let onAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: !0 }), cleanups.push(() => signal.removeEventListener("abort", onAbort));
  }
  return { signal: controller.signal, cancel: () => cleanups.forEach((fn) => fn()) };
}

class BouncerNetworkError extends Error {
  url;
  attempts;
  cause;
  constructor(message, url, attempts, cause) {
    super(message);
    this.url = url;
    this.attempts = attempts;
    this.cause = cause;
    this.name = "BouncerNetworkError";
  }
}

class Semaphore {
  max;
  active = 0;
  waiters = [];
  constructor(max) {
    this.max = max;
    if (!(max > 0))
      throw Error("[bouncer] `concurrency` must be a positive integer.");
  }
  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise((resolve) => this.waiters.push(resolve)), this.active++;
  }
  release() {
    this.active--;
    let next = this.waiters.shift();
    if (next)
      next();
  }
  get running() {
    return this.active;
  }
  get queued() {
    return this.waiters.length;
  }
}

class BouncerClient {
  maxRetries;
  baseDelayMs;
  maxDelayMs;
  retryOnStatusCodes;
  retryOnNetworkError;
  respectRetryAfter;
  jitter;
  timeoutMs;
  onRetry;
  semaphore;
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 3, this.baseDelayMs = options.baseDelayMs ?? 300, this.maxDelayMs = options.maxDelayMs ?? 1e4, this.retryOnStatusCodes = new Set(options.retryOnStatusCodes ?? DEFAULT_RETRY_STATUS_CODES), this.retryOnNetworkError = options.retryOnNetworkError ?? !0, this.respectRetryAfter = options.respectRetryAfter ?? !0, this.jitter = options.jitter ?? "full", this.timeoutMs = options.timeoutMs, this.onRetry = options.onRetry, this.semaphore = new Semaphore(options.concurrency ?? 6);
  }
  get stats() {
    return { active: this.semaphore.running, queued: this.semaphore.queued };
  }
  async fetch(input, init) {
    let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url, userSignal = init?.signal ?? void 0, canReplayBody = !(init?.body instanceof ReadableStream), attempt = 0;
    while (!0) {
      await this.semaphore.acquire();
      let timeoutHandle, combined;
      try {
        let signal = userSignal;
        if (this.timeoutMs !== void 0) {
          let timeoutController = new AbortController;
          timeoutHandle = setTimeout(() => timeoutController.abort(new DOMException("Timeout", "TimeoutError")), this.timeoutMs), combined = combineSignals(userSignal, timeoutController.signal), signal = combined.signal;
        }
        let response = await fetch(input, { ...init, signal });
        if (!(canReplayBody && this.retryOnStatusCodes.has(response.status) && attempt < this.maxRetries))
          return response;
        let delayMs = (this.respectRetryAfter ? parseRetryAfter(response.headers.get("Retry-After")) : void 0) ?? computeDelay(attempt, this.baseDelayMs, this.maxDelayMs, this.jitter);
        this.onRetry?.({
          url,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delayMs,
          reason: "status",
          status: response.status
        }), attempt++, await sleep(delayMs, userSignal);
        continue;
      } catch (error) {
        if (userSignal?.aborted)
          throw error;
        let isTimeout = error instanceof DOMException && error.name === "TimeoutError";
        if (!((isTimeout || this.retryOnNetworkError) && canReplayBody) || attempt >= this.maxRetries)
          throw new BouncerNetworkError(`[bouncer] request to ${url} failed after ${attempt + 1} attempt(s): ${error instanceof Error ? error.message : String(error)}`, url, attempt + 1, error);
        let delayMs = computeDelay(attempt, this.baseDelayMs, this.maxDelayMs, this.jitter);
        this.onRetry?.({
          url,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delayMs,
          reason: isTimeout ? "timeout" : "network",
          error
        }), attempt++, await sleep(delayMs, userSignal);
        continue;
      } finally {
        if (timeoutHandle)
          clearTimeout(timeoutHandle);
        combined?.cancel(), this.semaphore.release();
      }
    }
  }
}
function createClient(options) {
  return new BouncerClient(options);
}
var defaultClient;
function bouncerFetch(input, init) {
  if (!defaultClient)
    defaultClient = new BouncerClient;
  return defaultClient.fetch(input, init);
}
// src/storage.ts
class MemoryStorage {
  store = /* @__PURE__ */ new Map;
  sweepTimer;
  constructor(sweepIntervalMs = 60000) {
    if (sweepIntervalMs > 0)
      this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs), this.sweepTimer.unref?.call(this.sweepTimer);
  }
  incrementSync(key, ttlMs) {
    let now = Date.now(), existing = this.store.get(key);
    if (existing && existing.expiresAt > now)
      return existing.count++, existing.count;
    return this.store.set(key, { count: 1, expiresAt: now + ttlMs }), 1;
  }
  getSync(key) {
    let entry = this.store.get(key);
    if (!entry || entry.expiresAt <= Date.now())
      return 0;
    return entry.count;
  }
  async increment(key, ttlMs) {
    return this.incrementSync(key, ttlMs);
  }
  async get(key) {
    return this.getSync(key);
  }
  async reset(key) {
    this.store.delete(key);
  }
  destroy() {
    if (this.sweepTimer)
      clearInterval(this.sweepTimer);
    this.store.clear();
  }
  sweep() {
    let now = Date.now();
    for (let [key, entry] of this.store)
      if (entry.expiresAt <= now)
        this.store.delete(key);
  }
}

// src/limiter.ts
var DEFAULT_MESSAGE = JSON.stringify({ error: "Too Many Requests" }), defaultKeyGenerator = (req) => {
  let headers = req.headers, forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor)
    return forwardedFor.split(",")[0].trim();
  let cfIp = headers.get("cf-connecting-ip");
  if (cfIp)
    return cfIp;
  let realIp = headers.get("x-real-ip");
  if (realIp)
    return realIp;
  return "unknown";
};

class RateLimiter {
  windowMs;
  max;
  keyGenerator;
  storage;
  prefix;
  prefixColon;
  message;
  standardHeaders;
  legacyHeaders;
  onLimitReached;
  hasSyncStorage;
  constructor(options) {
    if (!options || !(options.windowMs > 0))
      throw Error("[bouncer] RateLimiter: `windowMs` must be a positive number.");
    if (!(options.max > 0))
      throw Error("[bouncer] RateLimiter: `max` must be a positive integer.");
    this.windowMs = options.windowMs, this.max = options.max, this.keyGenerator = options.keyGenerator ?? defaultKeyGenerator, this.storage = options.storage ?? new MemoryStorage, this.prefix = options.prefix ?? "bouncer", this.prefixColon = `${this.prefix}:`, this.message = options.message ?? DEFAULT_MESSAGE, this.standardHeaders = options.standardHeaders ?? !0, this.legacyHeaders = options.legacyHeaders ?? !1, this.onLimitReached = options.onLimitReached, this.hasSyncStorage = typeof this.storage.incrementSync === "function" && typeof this.storage.getSync === "function";
  }
  async check(req) {
    let maybeKey = this.keyGenerator(req), key = typeof maybeKey === "string" ? maybeKey : await maybeKey;
    return this.checkKey(key);
  }
  async checkKey(key) {
    if (this.hasSyncStorage)
      return this.computeSync(key, Date.now());
    let now = Date.now(), currentWindowStart = now - now % this.windowMs, previousWindowStart = currentWindowStart - this.windowMs, [currentCount, previousCount] = await Promise.all([
      this.storage.increment(`${this.prefixColon}${key}:${currentWindowStart}`, this.windowMs * 2),
      this.storage.get(`${this.prefixColon}${key}:${previousWindowStart}`)
    ]);
    return this.finish(currentCount, previousCount, currentWindowStart, now);
  }
  checkKeySync(key) {
    if (!this.hasSyncStorage)
      throw Error("[bouncer] checkKeySync() requires a StorageAdapter with incrementSync/getSync (the default MemoryStorage has them, custom async backends like Redis don't). Use checkKey() instead.");
    return this.computeSync(key, Date.now());
  }
  checkSync(req) {
    let maybeKey = this.keyGenerator(req);
    if (typeof maybeKey !== "string")
      throw Error("[bouncer] checkSync() requires a synchronous keyGenerator (the default header-based one qualifies). This limiter's keyGenerator returned a Promise, so use check() instead.");
    return this.checkKeySync(maybeKey);
  }
  computeSync(key, now) {
    let currentWindowStart = now - now % this.windowMs, previousWindowStart = currentWindowStart - this.windowMs, currentCount = this.storage.incrementSync(`${this.prefixColon}${key}:${currentWindowStart}`, this.windowMs * 2), previousCount = this.storage.getSync(`${this.prefixColon}${key}:${previousWindowStart}`);
    return this.finish(currentCount, previousCount, currentWindowStart, now);
  }
  finish(currentCount, previousCount, currentWindowStart, now) {
    let elapsed = now - currentWindowStart, weight = Math.max(0, (this.windowMs - elapsed) / this.windowMs), estimatedCount = previousCount * weight + currentCount, allowed = estimatedCount <= this.max, remaining = Math.max(0, Math.floor(this.max - estimatedCount)), resetAt = currentWindowStart + this.windowMs;
    return { allowed, limit: this.max, remaining, resetAt, estimatedCount, checkedAt: now };
  }
  applyHeaders(headers, result) {
    if (this.standardHeaders)
      headers.set("RateLimit-Limit", String(result.limit)), headers.set("RateLimit-Remaining", String(result.remaining)), headers.set("RateLimit-Reset", String(Math.max(0, Math.ceil((result.resetAt - result.checkedAt) / 1000))));
    if (this.legacyHeaders)
      headers.set("X-RateLimit-Limit", String(result.limit)), headers.set("X-RateLimit-Remaining", String(result.remaining)), headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  }
  tooManyRequests(result) {
    let headers = new Headers({ "Content-Type": "application/json" });
    return headers.set("Retry-After", String(Math.max(0, Math.ceil((result.resetAt - result.checkedAt) / 1000)))), this.applyHeaders(headers, result), new Response(this.message, { status: 429, headers });
  }
  withRateLimitHeaders(response, result) {
    try {
      return this.applyHeaders(response.headers, result), response;
    } catch {
      let headers = new Headers(response.headers);
      return this.applyHeaders(headers, result), new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
  }
  async protect(req, handler) {
    let maybeKey = this.keyGenerator(req), key = typeof maybeKey === "string" ? maybeKey : await maybeKey, result = await this.checkKey(key);
    if (!result.allowed)
      return this.onLimitReached?.(req, key, result), this.tooManyRequests(result);
    let response = await handler(req);
    return this.withRateLimitHeaders(response, result);
  }
  protectSync(req, handler) {
    let maybeKey = this.keyGenerator(req);
    if (typeof maybeKey !== "string")
      throw Error("[bouncer] protectSync() requires a synchronous keyGenerator (the default header-based one qualifies). This limiter's keyGenerator returned a Promise, so use protect() instead.");
    let result = this.checkKeySync(maybeKey);
    if (!result.allowed)
      return this.onLimitReached?.(req, maybeKey, result), this.tooManyRequests(result);
    return this.withRateLimitHeaders(handler(req), result);
  }
  hono() {
    return async (c, next) => {
      let req = c.req.raw, maybeKey = this.keyGenerator(req), key = typeof maybeKey === "string" ? maybeKey : await maybeKey, result = await this.checkKey(key);
      if (!result.allowed) {
        this.onLimitReached?.(req, key, result);
        let headers = /* @__PURE__ */ new Headers;
        headers.set("Retry-After", String(Math.max(0, Math.ceil((result.resetAt - result.checkedAt) / 1000)))), this.applyHeaders(headers, result);
        let headerObj = {};
        return headers.forEach((value, key2) => {
          headerObj[key2] = value;
        }), c.body(this.message, 429, headerObj);
      }
      await next();
    };
  }
}
function createRateLimiter(options) {
  return new RateLimiter(options);
}
export {
  createRateLimiter,
  createClient,
  bouncerFetch,
  RateLimiter,
  MemoryStorage,
  BouncerNetworkError,
  BouncerClient
};

//# debugId=D7ECB9ED9A3C2EB864756E2164756E21
