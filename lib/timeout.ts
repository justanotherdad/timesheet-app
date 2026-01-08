/**
 * Utility functions for handling timeouts in async operations
 * Helps prevent Cloudflare Error 522 by ensuring operations complete within time limits
 */

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds (default: 10000 for 10 seconds)
 * @param errorMessage Custom error message
 * @returns The result of the promise or throws a timeout error
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutId!)
    return result
  } catch (error) {
    clearTimeout(timeoutId!)
    throw error
  }
}

/**
 * Wraps a Supabase query with timeout and error handling
 * @param queryFn Function that returns a Supabase query builder (which can be awaited)
 * @param timeoutMs Timeout in milliseconds (default: 8000 for 8 seconds)
 * @returns The query result or null if it times out or errors
 */
export async function withQueryTimeout<T>(
  queryFn: () => any, // Supabase query builder that can be awaited
  timeoutMs: number = 8000
): Promise<{ data: T | null; error: any }> {
  try {
    const queryBuilder = queryFn()
    // Supabase query builders are thenable, so we can await them directly
    // Wrap in Promise.resolve to ensure it's a proper promise
    const queryPromise = Promise.resolve(queryBuilder)
    
    const result = await withTimeout(
      queryPromise,
      timeoutMs,
      'Database query timed out'
    )
    return result
  } catch (error: any) {
    console.error('Query timeout or error:', error)
    return {
      data: null,
      error: {
        message: error.message || 'Query failed',
        code: 'TIMEOUT',
      },
    }
  }
}
