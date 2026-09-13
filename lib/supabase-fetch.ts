/**
 * PostgREST helpers for large `.in()` reads.
 *
 * A single `.in(column, ids)` with hundreds of UUIDs blows past the URL/filter
 * length limit (HTTP 400 "Bad Request"). Unpaged selects also stop at ~1000
 * rows with no error. Chunk the id list and page each chunk.
 */

const IN_CHUNK = 150
const PAGE_SIZE = 1000

export async function fetchAllPages<T>(
  runPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await runPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = (data || []) as T[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return out
}

export async function fetchInIdChunks<T>(
  ids: string[],
  runChunk: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  if (ids.length === 0) return []
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    out.push(...(await runChunk(ids.slice(i, i + IN_CHUNK))))
  }
  return out
}

/** Chunk `.in()` by 150 ids and page each chunk past the 1000-row cap. */
export async function fetchInIdChunksPaged<T>(
  ids: string[],
  runPage: (
    chunk: string[],
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  return fetchInIdChunks(ids, (chunk) =>
    fetchAllPages<T>((from, to) => runPage(chunk, from, to))
  )
}

export async function fetchByIds<T>(
  ids: string[],
  runChunk: (
    chunk: string[]
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  return fetchInIdChunks(ids, async (chunk) => {
    const { data, error } = await runChunk(chunk)
    if (error) throw new Error(error.message)
    return data || []
  })
}
