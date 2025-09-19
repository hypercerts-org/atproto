/**
 * Retry wrapper for API calls that might fail due to OAuth/DPoP issues
 */
export async function retryApiCall<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 1000,
): Promise<T> {
  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Check if this is a retryable OAuth error
      const isRetryable =
        error?.message?.includes('use_dpop_nonce') ||
        error?.message?.includes('DPoP') ||
        error?.message?.includes('Invalid identifier or password') ||
        error?.status === 401

      if (!isRetryable || attempt === maxRetries) {
        throw error
      }

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000
      console.warn(
        `API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms:`,
        error.message,
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}
