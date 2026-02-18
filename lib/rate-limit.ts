/**
 * Rate limiting for auth endpoints using Upstash Redis.
 * Gracefully skips if env vars are not configured.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

let ratelimit: Ratelimit | null = null

function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const redis = new Redis({ url, token })
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    analytics: true,
  })
  return ratelimit
}

export async function checkAuthRateLimit(identifier: string): Promise<{ ok: boolean; remaining?: number }> {
  const rl = getRatelimit()
  if (!rl) return { ok: true }
  try {
    const { success, remaining } = await rl.limit(`auth:${identifier}`)
    return { ok: success, remaining }
  } catch {
    return { ok: true }
  }
}
