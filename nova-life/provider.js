const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AIza[0-9A-Za-z\-_]{20,}/,
  /ya29\.[0-9A-Za-z\-_]+/,
  /"private_key"\s*:/,
  /service_account/i,
];

export function assertNoSecrets(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    const error = new Error('Provider result contained credential material and was dropped');
    error.status = 500;
    error.code = 'PROVIDER_SECRET_LEAK';
    throw error;
  }
}

function unavailable(capability) {
  const error = new Error(`Google provider capability ${capability} is not available on this runtime`);
  error.status = 503;
  error.code = 'PROVIDER_UNAVAILABLE';
  return error;
}

function textFromResult(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result.text === 'string') return result.text;
  const parts = result.candidates?.[0]?.content?.parts || result.content?.parts || [];
  return parts.map((part) => part.text || '').join('');
}

export class AIProvider {
  async generateText() { throw unavailable('generateText'); }
  async streamText() { throw unavailable('streamText'); }
  async analyzeVision() { throw unavailable('analyzeVision'); }
  async generateImage() { throw unavailable('generateImage'); }
  async generateVideo() { throw unavailable('generateVideo'); }
  async embed() { throw unavailable('embed'); }
  async health() { return { ok: false, configured: false, provider: null, credentials_exposed: false }; }
}

export class GoogleVertexProvider extends AIProvider {
  constructor(router = null) {
    super();
    this.router = router;
  }

  async health() {
    return {
      ok: Boolean(this.router),
      configured: Boolean(this.router),
      provider: 'google-vertex-ai',
      server_side: true,
      credentials_exposed: false,
    };
  }

  async generateText({ prompt, context = {} } = {}) {
    if (!this.router?.generateContent) throw unavailable('generateText');
    const result = await this.router.generateContent({
      capability: 'GENERAL_REASONING',
      contents: String(prompt || ''),
      context,
    });
    return this.publicResult('generateText', result);
  }

  async streamText(input) {
    const generated = await this.generateText(input);
    return {
      ...generated,
      stream: 'buffered',
      chunks: [generated.text],
    };
  }

  async analyzeVision({ prompt, context = {} } = {}) {
    if (!this.router?.generateContent) throw unavailable('analyzeVision');
    const result = await this.router.generateContent({
      capability: 'OPTICS',
      contents: String(prompt || ''),
      context,
    });
    return this.publicResult('analyzeVision', result);
  }

  async generateImage({ prompt, context = {} } = {}) {
    if (!this.router?.generateImage) throw unavailable('generateImage');
    const result = await this.router.generateImage({ prompt, context });
    return this.publicResult('generateImage', result);
  }

  async generateVideo({ prompt, context = {} } = {}) {
    if (!this.router?.generateVideo) throw unavailable('generateVideo');
    const result = await this.router.generateVideo({ prompt, context });
    return this.publicResult('generateVideo', result);
  }

  async embed({ content, context = {} } = {}) {
    if (!this.router?.embed) throw unavailable('embed');
    const result = await this.router.embed({ content, context });
    const payload = {
      provider: 'google-vertex-ai',
      capability: 'embed',
      server_side: true,
      credentials_exposed: false,
      model: result?.model || null,
      dimensions: Array.isArray(result?.embeddings) ? result.embeddings.length : null,
    };
    assertNoSecrets(payload);
    return payload;
  }

  publicResult(capability, result) {
    const payload = {
      provider: 'google-vertex-ai',
      capability,
      server_side: true,
      credentials_exposed: false,
      model: result?.model || result?.actualModel || null,
      text: textFromResult(result),
    };
    assertNoSecrets(payload);
    return payload;
  }
}

export function createProvider(router) {
  return new GoogleVertexProvider(router || null);
}
