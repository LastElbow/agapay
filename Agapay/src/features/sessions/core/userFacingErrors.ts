type AxiosLikeError = {
  message?: string;
  code?: string;
  response?: {
    status?: number;
    data?: any;
  };
};

function isAxiosLikeError(error: unknown): error is AxiosLikeError {
  return typeof error === "object" && error !== null;
}

function getHttpStatus(error: unknown): number | undefined {
  if (!isAxiosLikeError(error)) return undefined;
  const status = error.response?.status;
  return typeof status === "number" ? status : undefined;
}

function isNetworkLikeError(error: unknown): boolean {
  if (!isAxiosLikeError(error)) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  if (code === "ERR_NETWORK") return true;
  if (/network\s*error/i.test(message)) return true;
  if (/timeout/i.test(message)) return true;
  return false;
}

export function getUserFacingSessionsErrorMessage(error: unknown): string {
  if (isNetworkLikeError(error)) {
    return "Could not connect. Check your internet connection and try again.";
  }

  const status = getHttpStatus(error);

  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to view this.";
  if (status === 404) return "We could not find this session.";
  if (status === 408) return "The request timed out. Please try again.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status && status >= 500) return "Server error. Please try again in a bit.";

  return "Something went wrong. Please try again.";
}
