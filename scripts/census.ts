#!/usr/bin/env tsx
/**
 * Bolivian Law MCP -- Census Script
 *
 * Enumerates legislation from LexiVox (lexivox.org), the most reliable
 * Bolivian legal portal accessible outside Bolivia. Official .gob.bo
 * sites timeout from non-Bolivian IPs.
 *
 * Strategy:
 *   1. Fetch all-documents search (no type filter) via offset-based pagination
 *   2. Pagination parameter: sacb524current=N (offset, 15 results per page)
 *   3. Total documents: ~28,635 → ~1,909 pages
 *   4. Extract: title, URL, document number, date, type from each entry
 *   5. Classify type from URL path: BO-L = Ley, BO-DS = Decreto Supremo, etc.
 *   6. Write data/census.json with standard schema
 *
 * Source: https://www.lexivox.org/packages/lexml/buscar_normas.php?lang=es
 *
 * Usage:
 *   npx tsx scripts/census.ts
 *   npx tsx scripts/census.ts --limit 100
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const CENSUS_PATH = path.join(DATA_DIR, 'census.json');

const BASE_URL = 'https://www.lexivox.org';
const SEARCH_URL = `${BASE_URL}/packages/lexml/buscar_normas.php`;

const USER_AGENT = 'bolivian-law-mcp/1.0 (https://github.com/Ansvar-Systems/Bolivian-law-mcp; hello@ansvar.ai)';

/** Conservative delay — LexiVox is a third-party portal, be respectful */
const DELAY_MS = 800;
const RESULTS_PER_PAGE = 15;

/* ---------- Types ---------- */

interface RawEntry {
  title: string;
  url: string;
  number: string;
  date: string;
  type: string;
  typeCode: string;
}

interface CensusLawEntry {
  id: string;
  title: string;
  identifier: string;
  url: string;
  status: 'in_force' | 'amended' | 'repealed';
  category: string;
  classification: 'ingestable' | 'excluded' | 'inaccessible';
  ingested: boolean;
  provision_count: number;
  ingestion_date: string | null;
  issued_date: string;
  doc_type: string;
}

/* ---------- URL type code → category mapping ---------- */

/**
 * LexiVox norm URLs follow the pattern: /norms/BO-{TYPE}-{ID}
 *
 *   BO-L-N123     → Ley (Law)
 *   BO-DS-N456    → Decreto Supremo (Supreme Decree)
 *   BO-CPE        → Constitucion Politica del Estado (Constitution)
 *   BO-C          → Codigo (Code)
 *   BO-COD        → Codigo (Code, alternate)
 *   BO-DL-N789    → Decreto Ley (Decree-Law)
 *   BO-RE-N012    → Resolucion (Resolution)
 *   BO-RM-N345    → Resolucion Ministerial (Ministerial Resolution)
 *   BO-RA-N678    → Resolucion Administrativa
 *   BO-RS-N901    → Resolucion Suprema
 */
interface TypeMapping {
  label: string;
  category: string;
  idPrefix: string;
}

const TYPE_MAP: Record<string, TypeMapping> = {
  'L':   { label: 'Ley',                    category: 'act',          idPrefix: 'bo-ley' },
  'DS':  { label: 'Decreto Supremo',        category: 'decree',       idPrefix: 'bo-ds' },
  'CPE': { label: 'Constitucion',           category: 'constitution', idPrefix: 'bo-cpe' },
  'C':   { label: 'Codigo',                 category: 'code',         idPrefix: 'bo-codigo' },
  'COD': { label: 'Codigo',                 category: 'code',         idPrefix: 'bo-codigo' },
  'DL':  { label: 'Decreto Ley',            category: 'decree',       idPrefix: 'bo-dl' },
  'RE':  { label: 'Resolucion',             category: 'regulation',   idPrefix: 'bo-re' },
  'RM':  { label: 'Resolucion Ministerial', category: 'regulation',   idPrefix: 'bo-rm' },
  'RA':  { label: 'Resolucion Admin.',      category: 'regulation',   idPrefix: 'bo-ra' },
  'RS':  { label: 'Resolucion Suprema',     category: 'regulation',   idPrefix: 'bo-rs' },
};

const DEFAULT_TYPE: TypeMapping = { label: 'Otro', category: 'other', idPrefix: 'bo-otro' };

/* ---------- HTTP helpers ---------- */

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a search results page from LexiVox.
 *
 * Pagination uses the `sacb524current` parameter as an offset:
 *   sacb524current=0   → results 1-15
 *   sacb524current=15  → results 16-30
 *   sacb524current=30  → results 31-45
 *   ...
 */
async function fetchSearchPage(offset: number): Promise<string> {
  const params = new URLSearchParams({
    lang: 'es',
    sacb524current: String(offset),
  });

  const url = `${SEARCH_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.5',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status} for offset ${offset}`);
    }

    return response.text();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/* ---------- HTML parsing ---------- */

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#209;/g, 'Ñ').replace(/&#241;/g, 'ñ')
    .replace(/&#193;/g, 'Á').replace(/&#225;/g, 'á')
    .replace(/&#201;/g, 'É').replace(/&#233;/g, 'é')
    .replace(/&#205;/g, 'Í').replace(/&#237;/g, 'í')
    .replace(/&#211;/g, 'Ó').replace(/&#243;/g, 'ó')
    .replace(/&#218;/g, 'Ú').replace(/&#250;/g, 'ú')
    .replace(/&#252;/g, 'ü').replace(/&#220;/g, 'Ü')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í').replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

function cleanText(text: string): string {
  return decodeEntities(stripTags(text)).replace(/\s+/g, ' ').trim();
}

/**
 * Detect the total number of pages from the pagination HTML on the first page.
 *
 * LexiVox pagination links contain `sacb524current=N` parameters. The highest
 * offset in the pagination links (typically the last page link) tells us the
 * total result count. We look for the highest value, which should be near
 * 28,620 (for 28,635 total documents, the last page offset = (1909-1)*15 = 28,620).
 *
 * We also look for a "1908" or "1909" page-number display in the pagination
 * controls (some paginations show page numbers as text).
 */
function detectTotalPages(html: string): number {
  // Strategy 1: Find the highest sacb524current offset in pagination links
  const offsetMatches = [...html.matchAll(/sacb524current=(\d+)/gi)];
  let maxOffset = 0;
  for (const m of offsetMatches) {
    const offset = parseInt(m[1], 10);
    if (offset > maxOffset) maxOffset = offset;
  }

  if (maxOffset > 0) {
    // Total pages = (maxOffset / RESULTS_PER_PAGE) + 1
    return Math.floor(maxOffset / RESULTS_PER_PAGE) + 1;
  }

  // Strategy 2: Look for a total count or page number in the HTML
  // Some pagination controls show "Pagina 1 de 1909" or "28635 resultados"
  const totalMatch = html.match(/(\d[\d.,]+)\s*(?:resultados|registros|normas)/i);
  if (totalMatch) {
    const total = parseInt(totalMatch[1].replace(/[.,]/g, ''), 10);
    if (total > 0) return Math.ceil(total / RESULTS_PER_PAGE);
  }

  // Strategy 3: Look for page numbers displayed as plain text
  const pageNumMatches = [...html.matchAll(/>\s*(\d{3,4})\s*</g)];
  let maxPageNum = 1;
  for (const m of pageNumMatches) {
    const n = parseInt(m[1], 10);
    // Sanity check: page numbers should be in a reasonable range
    if (n > maxPageNum && n < 5000) maxPageNum = n;
  }
  if (maxPageNum > 1) return maxPageNum;

  // Fallback: assume only one page of results
  return 1;
}

/**
 * Parse entries from a LexiVox search results page.
 *
 * Each result entry on LexiVox contains an anchor tag linking to the full
 * text of the norm. Links follow the pattern:
 *   href="/norms/BO-L-N1234"  (Law 1234)
 *   href="/norms/BO-DS-N5678" (Supreme Decree 5678)
 *
 * The anchor text contains the title of the norm.
 */
function parseSearchResults(html: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const seenUrls = new Set<string>();

  // Match all anchor tags that link to /norms/ paths
  // Handles both relative (/norms/...) and absolute (https://www.lexivox.org/norms/...) URLs
  const linkRegex = /<a\s+[^>]*href=["']([^"']*\/norms\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1];
    const rawTitle = cleanText(match[2]);

    // Skip empty/very short titles (navigation links, icons)
    if (!rawTitle || rawTitle.length < 3) continue;

    // Normalize URL
    let url: string;
    if (rawHref.startsWith('http')) {
      url = rawHref;
    } else if (rawHref.startsWith('/')) {
      url = `${BASE_URL}${rawHref}`;
    } else {
      url = `${BASE_URL}/${rawHref}`;
    }

    // Skip duplicates within this page
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    // Skip search page self-links
    if (url.includes('buscar_normas')) continue;

    // Extract type code and number from URL
    // Pattern: /norms/BO-{TYPE}(-N{NUMBER})(.html)?
    const urlParts = url.match(/\/norms\/BO-([A-Z]+)(?:-N?(\d+[A-Za-z]?))?/i);
    let typeCode = '';
    let number = '';

    if (urlParts) {
      typeCode = urlParts[1].toUpperCase();
      number = urlParts[2] ?? '';
    }

    // If no number from URL, try to extract from title
    if (!number) {
      const titleNumMatch = rawTitle.match(/(?:N[°ºo.]?\s*|No\.?\s*)(\d+)/i)
        ?? rawTitle.match(/\b(?:Ley|Decreto|D\.S\.)\s+(?:N[°ºo.]?\s*)?(\d+)/i);
      if (titleNumMatch) number = titleNumMatch[1];
    }

    // Extract date from title
    const date = extractDate(rawTitle);

    // Determine type label
    const mapping = TYPE_MAP[typeCode] ?? DEFAULT_TYPE;

    entries.push({
      title: rawTitle,
      url,
      number,
      date,
      type: mapping.label.toLowerCase().replace(/\s+/g, '_'),
      typeCode,
    });
  }

  return entries;
}

/**
 * Extract a date from text, returning ISO format (YYYY-MM-DD) or empty string.
 *
 * Handles:
 *   "13 de febrero de 2009"
 *   "13/02/2009"
 *   "13-02-2009"
 */
function extractDate(text: string): string {
  // Spanish date: "DD de MONTH de YYYY"
  const spanishMatch = text.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
  if (spanishMatch) {
    const monthNum = parseSpanishMonth(spanishMatch[2]);
    if (monthNum) {
      return `${spanishMatch[3]}-${monthNum}-${spanishMatch[1].padStart(2, '0')}`;
    }
  }

  // Numeric date: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const numericMatch = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (numericMatch) {
    return `${numericMatch[3]}-${numericMatch[2].padStart(2, '0')}-${numericMatch[1].padStart(2, '0')}`;
  }

  // Year only (from title patterns like "Ley de 15 Octubre 1834")
  const yearOnlyMatch = text.match(/\b(1[89]\d{2}|20[0-2]\d)\b/);
  if (yearOnlyMatch) {
    return `${yearOnlyMatch[1]}-01-01`;
  }

  return '';
}

function parseSpanishMonth(month: string): string | null {
  const months: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', setiembre: '09', octubre: '10',
    noviembre: '11', diciembre: '12',
  };
  return months[month.toLowerCase()] ?? null;
}

/* ---------- Utilities ---------- */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

function parseArgs(): { limit: number | null } {
  const args = process.argv.slice(2);
  let limit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      if (isNaN(limit) || limit < 1) {
        console.error(`Invalid --limit value: ${args[i + 1]}`);
        process.exit(1);
      }
      i++;
    }
  }

  return { limit };
}

function mapStatus(title: string): 'in_force' | 'amended' | 'repealed' {
  if (/abrogad[ao]|derogad[ao]|sin\s+efecto/i.test(title)) return 'repealed';
  if (/modific/i.test(title)) return 'amended';
  return 'in_force';
}

/* ---------- Main ---------- */

async function main(): Promise<void> {
  const { limit } = parseArgs();

  console.log('Bolivian Law MCP -- Census');
  console.log('=========================\n');
  console.log('  Source:      lexivox.org (LexiVox)');
  console.log('  Method:      offset-based pagination (sacb524current=N, 15 results/page)');
  console.log('  Expected:    ~28,635 documents from 1825-2025');
  console.log('  Total pages: ~1,909');
  console.log('  Delay:       800ms between requests');
  if (limit) console.log(`  --limit:     ${limit}`);
  console.log('');

  fs.mkdirSync(DATA_DIR, { recursive: true });

  /* ---- Phase 1: Fetch page 1, verify access, detect total pages ---- */

  console.log('Phase 1: Fetching page 1 (offset=0) to verify access and detect total pages...');
  await sleep(DELAY_MS);

  let firstPageHtml: string;
  try {
    firstPageHtml = await fetchSearchPage(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nFailed to fetch first page: ${msg}`);
    console.error('LexiVox may be down or blocking requests. Aborting.');
    process.exit(1);
  }

  const firstPageEntries = parseSearchResults(firstPageHtml);
  const detectedTotalPages = detectTotalPages(firstPageHtml);

  console.log(`  First page:   ${firstPageEntries.length} entries found`);
  console.log(`  Total pages:  ${detectedTotalPages} detected from pagination`);

  if (firstPageEntries.length === 0) {
    console.error('\nNo entries found on first page. The page structure may have changed.');
    console.error('Check https://www.lexivox.org/packages/lexml/buscar_normas.php?lang=es manually.');
    process.exit(1);
  }

  // Use detected total or fall back to expected total
  // If detection failed (returned 1 but we know there are ~1909 pages), use expected value
  let totalPages = detectedTotalPages;
  const EXPECTED_TOTAL_PAGES = 1909;

  if (totalPages <= 1 && firstPageEntries.length >= RESULTS_PER_PAGE) {
    console.log(`  WARNING: Pagination detection returned ${totalPages} pages but first page is full.`);
    console.log(`  Falling back to expected total: ${EXPECTED_TOTAL_PAGES} pages.`);
    console.log(`  The script will stop when it hits an empty page.`);
    totalPages = EXPECTED_TOTAL_PAGES;
  }

  /* ---- Phase 2: Paginate through all results ---- */

  const allEntries: RawEntry[] = [];
  const seenUrls = new Set<string>();

  // Add first page entries
  for (const entry of firstPageEntries) {
    if (!seenUrls.has(entry.url)) {
      seenUrls.add(entry.url);
      allEntries.push(entry);
    }
  }

  // Calculate how many pages to fetch
  let maxPages = totalPages;
  if (limit) {
    maxPages = Math.min(totalPages, Math.ceil(limit / RESULTS_PER_PAGE));
  }

  console.log(`\nPhase 2: Fetching pages 2-${maxPages} (${(maxPages - 1) * RESULTS_PER_PAGE} remaining offsets)...`);

  let consecutiveEmptyPages = 0;
  const MAX_CONSECUTIVE_EMPTY = 3;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  for (let pageNum = 2; pageNum <= maxPages; pageNum++) {
    const offset = (pageNum - 1) * RESULTS_PER_PAGE;

    // Progress reporting every 50 pages, or every page for small runs
    const reportEvery = maxPages > 100 ? 50 : 1;
    if (pageNum % reportEvery === 0 || pageNum === 2 || pageNum === maxPages) {
      const pct = ((pageNum / maxPages) * 100).toFixed(1);
      process.stdout.write(
        `  Page ${pageNum}/${maxPages} (offset=${offset}, ${allEntries.length} entries so far, ${pct}%)... `
      );
    }

    await sleep(DELAY_MS);

    try {
      const html = await fetchSearchPage(offset);
      const entries = parseSearchResults(html);

      consecutiveErrors = 0; // Reset error counter on success

      if (pageNum % reportEvery === 0 || pageNum === 2 || pageNum === maxPages) {
        console.log(`${entries.length} entries`);
      }

      if (entries.length === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY) {
          console.log(`\n  ${MAX_CONSECUTIVE_EMPTY} consecutive empty pages. Reached end of results.`);
          break;
        }
      } else {
        consecutiveEmptyPages = 0;

        for (const entry of entries) {
          if (!seenUrls.has(entry.url)) {
            seenUrls.add(entry.url);
            allEntries.push(entry);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      consecutiveErrors++;

      if (pageNum % reportEvery === 0 || pageNum === 2 || pageNum === maxPages) {
        console.log(`ERROR: ${msg}`);
      } else {
        console.log(`  Page ${pageNum}: ERROR: ${msg}`);
      }

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`\n  ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Aborting pagination.`);
        break;
      }

      // Back off on error
      await sleep(DELAY_MS * 3);
    }

    // Check limit
    if (limit && allEntries.length >= limit) {
      console.log(`\n  Reached --limit ${limit} (have ${allEntries.length} entries).`);
      break;
    }
  }

  /* ---- Phase 3: Build census entries ---- */

  const trimmedEntries = limit ? allEntries.slice(0, limit) : allEntries;

  console.log(`\nPhase 3: Building census from ${trimmedEntries.length} entries...`);

  const laws: CensusLawEntry[] = trimmedEntries.map((entry, idx) => {
    const mapping = TYPE_MAP[entry.typeCode] ?? DEFAULT_TYPE;
    const number = entry.number || String(idx + 1);
    const slug = slugify(entry.title).substring(0, 30);
    const id = `${mapping.idPrefix}-${number}-${slug}`;

    let identifier = entry.title;
    if (entry.typeCode === 'L' && entry.number) {
      identifier = `Ley No. ${entry.number}`;
    } else if (entry.typeCode === 'DS' && entry.number) {
      identifier = `D.S. No. ${entry.number}`;
    } else if ((entry.typeCode === 'C' || entry.typeCode === 'COD') && entry.number) {
      identifier = `Código No. ${entry.number}`;
    } else if (entry.typeCode === 'DL' && entry.number) {
      identifier = `D.L. No. ${entry.number}`;
    } else if (entry.typeCode === 'CPE') {
      identifier = `Constitución Política del Estado`;
    }

    return {
      id,
      title: entry.title,
      identifier,
      url: entry.url,
      status: mapStatus(entry.title),
      category: mapping.category,
      classification: 'ingestable' as const,
      ingested: false,
      provision_count: 0,
      ingestion_date: null as string | null,
      issued_date: entry.date,
      doc_type: entry.type,
    };
  });

  /* ---- Phase 4: Write census.json ---- */

  const byType = new Map<string, number>();
  for (const law of laws) {
    byType.set(law.doc_type, (byType.get(law.doc_type) ?? 0) + 1);
  }

  const ingestable = laws.filter(l => l.classification === 'ingestable').length;
  const inaccessible = laws.filter(l => l.classification === 'inaccessible').length;
  const repealed = laws.filter(l => l.status === 'repealed').length;

  const census = {
    schema_version: '2.0',
    jurisdiction: 'BO',
    jurisdiction_name: 'Bolivia',
    portal: 'lexivox.org',
    portal_url: 'https://www.lexivox.org/packages/lexml/buscar_normas.php?lang=es',
    census_date: new Date().toISOString().split('T')[0],
    agent: 'bolivian-law-mcp/census.ts',
    notes: [
      'Official .gob.bo portals are geo-blocked from outside Bolivia.',
      'LexiVox is a third-party mirror with broad coverage (28K+ documents from 1825-2025).',
      'Pagination uses sacb524current=N offset parameter (15 results per page).',
      'Document types are classified from URL path pattern: /norms/BO-{TYPE}-N{NUMBER}.',
    ].join(' '),
    summary: {
      total_laws: laws.length,
      ingestable,
      inaccessible,
      repealed,
      excluded: 0,
      ocr_needed: 0,
      by_type: Object.fromEntries(byType),
    },
    laws,
  };

  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2));

  /* ---- Summary ---- */

  console.log('\n==================================================');
  console.log('CENSUS COMPLETE');
  console.log('==================================================');
  console.log(`  Total documents discovered: ${laws.length}`);
  console.log('');
  console.log('  Breakdown by type:');

  const sortedTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes) {
    console.log(`    ${type.padEnd(25)} ${count}`);
  }

  console.log('');
  console.log(`  Ingestable:  ${ingestable}`);
  console.log(`  Inaccessible: ${inaccessible}`);
  console.log(`  Repealed:    ${repealed}`);
  console.log(`\n  Output: ${CENSUS_PATH}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
