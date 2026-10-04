export type HttpHeaders = Record<string, string>;

export type HttpRequestConfig = {
  params?: Record<string, any>;
  headers?: HttpHeaders;
};

export type HttpResponse<T> = {
  data: T;
  status?: number;
  headers?: any;
};

export interface HttpPort {
  get<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  post<T = unknown>(url: string, body?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  put<T = unknown>(url: string, body?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  delete<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
}
