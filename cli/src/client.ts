export class ApiClient {
  constructor(
    private baseUrl: string,
    private token?: string,
  ) {}

  private headers(hasBody: boolean = false): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    if (hasBody) h['Content-Type'] = 'application/json';
    return h;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(!!body),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const err = await res.json() as { error?: string };
        if (err.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }

    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Unexpected response from server: ${text.slice(0, 200)}`);
    }
  }

  get(path: string) { return this.request('GET', path); }
  post(path: string, body?: unknown) { return this.request('POST', path, body); }
  put(path: string, body: unknown) { return this.request('PUT', path, body); }
  delete(path: string) { return this.request('DELETE', path); }
}
