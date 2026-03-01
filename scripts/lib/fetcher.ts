/**
 * Rate-limited HTTP client for Bolivian Law (LexiVox)
 *
 * - 300ms minimum delay between requests (be respectful to third-party server)
 * - User-Agent header identifying the MCP
 * - Fetches HTML pages from lexivox.org
 * - No auth needed (public access)
 */

const USER_AGENT = 'bolivian-law-mcp/1.0 (https://github.com/Ansvar-Systems/Bolivian-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 300;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
  url: string;
}

/**
 * Fetch a URL with rate limiting and proper headers.
 * Retries up to 3 times on 429/5xx errors with exponential backoff.
 */
export async function fetchWithRateLimit(url: string, maxRetries = 3): Promise<FetchResult> {
  await rateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html, */*',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          console.log(`  HTTP ${response.status} for ${url}, retrying in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
      }

      const body = await response.text();
      return {
        status: response.status,
        body,
        contentType: response.headers.get('content-type') ?? '',
        url: response.url,
      };
    } catch (err) {
      clearTimeout(timeout);

      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  Fetch error for ${url}: ${msg}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      throw err;
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}
