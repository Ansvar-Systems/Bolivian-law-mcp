#!/usr/bin/env tsx
/**
 * Bolivian Law MCP -- Census-Driven Ingestion Pipeline
 *
 * Reads data/census.json and fetches + parses every ingestable document
 * from LexiVox (lexivox.org). LexiVox serves full-text HTML pages
 * for Bolivian legislation.
 *
 * Pipeline per law:
 *   1. Fetch full-text HTML page from LexiVox
 *   2. Parse articles, definitions, chapter structure from HTML
 *   3. Write seed JSON for build-db.ts
 *
 * Features:
 *   - Resume support: skips documents that already have a seed JSON file
 *   - Census update: writes provision counts + ingestion dates back to census.json
 *   - Rate limiting: 300ms minimum between requests (be nice to LexiVox)
 *   - Checkpoint: saves census every 50 documents
 *
 * Usage:
 *   npm run ingest                    # Full census-driven ingestion
 *   npm run ingest -- --limit 5       # Test with 5 documents
 *   npm run ingest -- --skip-fetch    # Reuse cached HTML (re-parse only)
 *   npm run ingest -- --force         # Re-ingest even if seed exists
 *
 * Data source: lexivox.org (LexiVox -- third-party Bolivian law portal)
 * Format: HTML (full-text pages)
 * License: Public domain (Bolivian legislation)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseBOLawHtml, type ActIndexEntry, type ParsedAct } from './lib/parser.js';
import { fetchWithRateLimit } from './lib/fetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CENSUS_PATH = path.resolve(__dirname, '../data/census.json');

const CHECKPOINT_INTERVAL = 50;

/* ---------- Types ---------- */

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
  issued_date?: string;
  doc_type?: string;
}

interface CensusFile {
  schema_version: string;
  jurisdiction: string;
  jurisdiction_name: string;
  portal: string;
  portal_url?: string;
  census_date: string;
  agent: string;
  notes?: string;
  summary: {
    total_laws: number;
    ingestable: number;
    inaccessible: number;
    repealed?: number;
    excluded: number;
    ocr_needed: number;
  };
  laws: CensusLawEntry[];
}

/* ---------- Helpers ---------- */

function parseArgs(): { limit: number | null; skipFetch: boolean; force: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  return { limit, skipFetch, force };
}

function censusToActEntry(law: CensusLawEntry): ActIndexEntry {
  const shortName = law.identifier || (law.title.length > 40 ? law.title.substring(0, 37) + '...' : law.title);

  return {
    id: law.id,
    title: law.title,
    titleEn: law.title, // Bolivian law is in Spanish; no English translation
    shortName,
    status: law.status === 'in_force' ? 'in_force' : law.status === 'amended' ? 'amended' : 'repealed',
    issuedDate: law.issued_date ?? '',
    inForceDate: law.issued_date ?? '',
    url: law.url,
  };
}

/**
 * Fetch the full-text HTML for a law from LexiVox.
 */
async function fetchLawHtml(url: string, outputPath: string): Promise<boolean> {
  try {
    const result = await fetchWithRateLimit(url);

    if (result.status !== 200) {
      console.log(` HTTP ${result.status}`);
      return false;
    }

    // Verify we got actual HTML content (not an error page)
    if (result.body.length < 200) {
      console.log(' Response too short');
      return false;
    }

    // Check for common error indicators
    if (/404|not\s+found|no\s+encontrad/i.test(result.body) && result.body.length < 2000) {
      console.log(' Error page detected');
      return false;
    }

    fs.writeFileSync(outputPath, result.body, 'utf-8');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(` Error: ${msg}`);
    return false;
  }
}

/**
 * Write the census file back to disk (checkpoint).
 */
function writeCensus(census: CensusFile, censusMap: Map<string, CensusLawEntry>): void {
  census.laws = Array.from(censusMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title, 'es'),
  );

  census.summary.total_laws = census.laws.length;
  census.summary.ingestable = census.laws.filter(l => l.classification === 'ingestable').length;
  census.summary.inaccessible = census.laws.filter(l => l.classification === 'inaccessible').length;
  census.summary.excluded = census.laws.filter(l => l.classification === 'excluded').length;

  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2));
}

/* ---------- Main ---------- */

async function main(): Promise<void> {
  const { limit, skipFetch, force } = parseArgs();

  console.log('Bolivian Law MCP -- Ingestion Pipeline (Census-Driven)');
  console.log('======================================================\n');
  console.log('  Source: lexivox.org (LexiVox)');
  console.log('  Format: HTML (full-text pages)');
  console.log('  License: Public domain (Bolivian legislation)');

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log(`  --skip-fetch`);
  if (force) console.log(`  --force (re-ingest all)`);

  // Load census
  if (!fs.existsSync(CENSUS_PATH)) {
    console.error(`\nERROR: Census file not found at ${CENSUS_PATH}`);
    console.error('Run "npx tsx scripts/census.ts" first.');
    process.exit(1);
  }

  const census: CensusFile = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));
  const ingestable = census.laws.filter(l => l.classification === 'ingestable');
  const acts = limit ? ingestable.slice(0, limit) : ingestable;

  console.log(`\n  Census: ${census.summary.total_laws} total, ${ingestable.length} ingestable`);
  console.log(`  Processing: ${acts.length} documents\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const results: { act: string; provisions: number; definitions: number; status: string }[] = [];

  const censusMap = new Map<string, CensusLawEntry>();
  for (const law of census.laws) {
    censusMap.set(law.id, law);
  }

  const today = new Date().toISOString().split('T')[0];

  for (const law of acts) {
    const act = censusToActEntry(law);
    const sourceFile = path.join(SOURCE_DIR, `${act.id}.html`);
    const seedFile = path.join(SEED_DIR, `${act.id}.json`);

    // Resume support: skip if seed already exists
    if (!force && fs.existsSync(seedFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as ParsedAct;
        const provCount = existing.provisions?.length ?? 0;
        const defCount = existing.definitions?.length ?? 0;
        totalProvisions += provCount;
        totalDefinitions += defCount;

        const entry = censusMap.get(law.id);
        if (entry) {
          entry.ingested = true;
          entry.provision_count = provCount;
          entry.ingestion_date = entry.ingestion_date ?? today;
        }

        results.push({ act: act.shortName, provisions: provCount, definitions: defCount, status: 'resumed' });
        skipped++;
        processed++;
        continue;
      } catch {
        // Corrupt seed file -- re-ingest
      }
    }

    try {
      // Step 1: Fetch HTML
      if (!fs.existsSync(sourceFile) || force) {
        if (skipFetch) {
          console.log(`  [${processed + 1}/${acts.length}] No cached HTML for ${act.id}, skipping`);
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'no-cache' });
          failed++;
          processed++;
          continue;
        }

        process.stdout.write(`  [${processed + 1}/${acts.length}] Fetching ${act.id}...`);
        const ok = await fetchLawHtml(act.url, sourceFile);
        if (!ok) {
          const entry = censusMap.get(law.id);
          if (entry) entry.classification = 'inaccessible';
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'fetch-failed' });
          failed++;
          processed++;
          continue;
        }

        const size = fs.statSync(sourceFile).size;
        console.log(` OK (${(size / 1024).toFixed(0)} KB)`);
      } else {
        const size = fs.statSync(sourceFile).size;
        console.log(`  [${processed + 1}/${acts.length}] Using cached ${act.id} (${(size / 1024).toFixed(0)} KB)`);
      }

      // Step 2: Parse HTML
      const html = fs.readFileSync(sourceFile, 'utf-8');
      const parsed = parseBOLawHtml(html, act);
      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;
      console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions`);

      // Update census entry
      const entry = censusMap.get(law.id);
      if (entry) {
        entry.ingested = true;
        entry.provision_count = parsed.provisions.length;
        entry.ingestion_date = today;
      }

      results.push({
        act: act.shortName,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status: 'OK',
      });
      ingested++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR parsing ${act.id}: ${msg}`);
      results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `ERROR: ${msg.substring(0, 80)}` });
      failed++;
    }

    processed++;

    // Checkpoint: save census periodically
    if (processed % CHECKPOINT_INTERVAL === 0) {
      writeCensus(census, censusMap);
      console.log(`  [checkpoint] Census updated at ${processed}/${acts.length}`);
    }
  }

  // Final census write
  writeCensus(census, censusMap);

  // Print report
  console.log(`\n${'='.repeat(70)}`);
  console.log('Ingestion Report');
  console.log('='.repeat(70));
  console.log(`\n  Source:      lexivox.org (LexiVox -- HTML extraction)`);
  console.log(`  Processed:   ${processed}`);
  console.log(`  New:         ${ingested}`);
  console.log(`  Resumed:     ${skipped}`);
  console.log(`  Failed:      ${failed}`);
  console.log(`  Total provisions:  ${totalProvisions}`);
  console.log(`  Total definitions: ${totalDefinitions}`);

  const failures = results.filter(r =>
    r.status.startsWith('fetch') || r.status.startsWith('ERROR') || r.status === 'no-cache',
  );
  if (failures.length > 0) {
    console.log(`\n  Failed documents:`);
    for (const f of failures.slice(0, 30)) {
      console.log(`    ${f.act}: ${f.status}`);
    }
    if (failures.length > 30) {
      console.log(`    ... and ${failures.length - 30} more`);
    }
  }

  const zeroProv = results.filter(r => r.provisions === 0 && r.status === 'OK');
  if (zeroProv.length > 0) {
    console.log(`\n  Zero-provision documents (${zeroProv.length}):`);
    for (const z of zeroProv.slice(0, 20)) {
      console.log(`    ${z.act}`);
    }
    if (zeroProv.length > 20) {
      console.log(`    ... and ${zeroProv.length - 20} more`);
    }
  }

  console.log('');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
