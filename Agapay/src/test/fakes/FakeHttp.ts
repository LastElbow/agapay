import type { HttpPort, HttpRequestConfig, HttpResponse } from '@/src/shared/ports/http';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

type Key = `${Method} ${string}`;

type Handler = (args: { url: string; body?: any; config?: HttpRequestConfig }) => any | Promise<any>;

export class FakeHttp implements HttpPort {
  public calls: { method: Method; url: string; body?: any; config?: HttpRequestConfig }[] = [];
  private handlers = new Map<Key, Handler>();

  on(method: Method, url: string, handler: Handler) {
    this.handlers.set(`${method} ${url}`, handler);
  }

  private async handle<T>(method: Method, url: string, body?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ method, url, body, config });
    const handler = this.handlers.get(`${method} ${url}`);
    if (!handler) {
      throw new Error(`No FakeHttp handler for ${method} ${url}`);
    }
    const data = await handler({ url, body, config });
    return { data: data as T, status: 200, headers: {} };
  }

  get<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.handle('GET', url, undefined, config);
  }
  post<T = unknown>(url: string, body?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.handle('POST', url, body, config);
  }
  put<T = unknown>(url: string, body?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.handle('PUT', url, body, config);
  }
  delete<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.handle('DELETE', url, undefined, config);
  }
}
