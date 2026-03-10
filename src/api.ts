import type { JsonApiInclude, JsonApiResponse } from "./types.js";

const DEFAULT_BASE_URL = "https://api.bowlslink.com.au/results-api";
const HEADERS = { Accept: "application/json", "Content-Type": "application/json" };

/**
 * Fetch a path from the BowlsLink Results API and return the parsed JSON:API response.
 *
 * @throws {Error} On non-OK HTTP responses.
 */
export async function apiFetch(
  path: string,
  baseUrl: string = DEFAULT_BASE_URL,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<JsonApiResponse> {
  const url = `${baseUrl}${path}`;
  const res = await fetchFn(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`BowlsLink API error: ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as JsonApiResponse;
}

/**
 * Build a lookup map of `{ [id]: attributes }` for a specific type from a
 * JSON:API `include` array.
 */
export function buildLookup(
  include: JsonApiInclude[],
  type: string,
): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (const item of include) {
    if (item.type === type) {
      map[item.id] = item.attributes ?? {};
    }
  }
  return map;
}
