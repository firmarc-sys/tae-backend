export interface ApiError {
  error: { code: string; message: string; requestId?: string; retryable: boolean; details?: Record<string, unknown> };
}
export function apiError(code: string, message: string, retryable = false, requestId?: string): ApiError {
  return { error: { code, message, retryable, ...(requestId ? { requestId } : {}) } };
}