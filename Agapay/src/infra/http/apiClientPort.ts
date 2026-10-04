import type { HttpPort, HttpRequestConfig, HttpResponse } from '@/src/shared/ports/http';
import apiClient from '@/api/client';

function wrap<T>(p: Promise<any>): Promise<HttpResponse<T>> {
  return p.then((res) => ({ data: res.data as T, status: res.status, headers: res.headers }));
}

export const apiClientPort: HttpPort = {
  get: (url, config?: HttpRequestConfig) => wrap(apiClient.get(url, config)),
  post: (url, body?: any, config?: HttpRequestConfig) => wrap(apiClient.post(url, body, config)),
  put: (url, body?: any, config?: HttpRequestConfig) => wrap(apiClient.put(url, body, config)),
  delete: (url, config?: HttpRequestConfig) => wrap(apiClient.delete(url, config)),
};
