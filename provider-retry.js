const nativeFetch = globalThis.fetch?.bind(globalThis);

if (nativeFetch && !globalThis.__JAHORIN_PROVIDER_RETRY_INSTALLED__) {
  globalThis.__JAHORIN_PROVIDER_RETRY_INSTALLED__ = true;

  const maxAttempts = Math.max(1, Math.min(5, Number(process.env.ARI_PROVIDER_MAX_ATTEMPTS || 3)));
  const baseDelayMs = Math.max(100, Math.min(5000, Number(process.env.ARI_PROVIDER_RETRY_BASE_MS || 500)));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function isGoogleProviderRequest(input) {
    try {
      const value = typeof input === 'string' || input instanceof URL ? input : input?.url;
      if (!value) return false;
      const hostname = new URL(String(value)).hostname.toLowerCase();
      return hostname === 'googleapis.com' || hostname.endsWith('.googleapis.com');
    } catch {
      return false;
    }
  }

  function retryDelay(response, attempt) {
    const retryAfter = Number(response?.headers?.get?.('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return Math.min(10_000, retryAfter * 1000);
    }
    const exponential = baseDelayMs * (2 ** Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * Math.max(50, Math.floor(baseDelayMs / 2)));
    return Math.min(10_000, exponential + jitter);
  }

  globalThis.fetch = async function jahorinProviderFetch(input, init) {
    if (!isGoogleProviderRequest(input) || maxAttempts === 1) {
      return nativeFetch(input, init);
    }

    let response;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      response = await nativeFetch(input, init);
      if (response.status !== 429 || attempt >= maxAttempts) return response;

      // A 429 means the provider rejected the request before producing a usable result.
      // Drain the response before the bounded retry so the underlying connection can be reused.
      try { await response.arrayBuffer(); } catch { /* best effort */ }
      await sleep(retryDelay(response, attempt));
    }
    return response;
  };
}
