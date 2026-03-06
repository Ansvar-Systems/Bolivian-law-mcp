/**
 * Response metadata utilities for Bolivian Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
  note?: string;
  query_strategy?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Gaceta Oficial de Bolivia / LexIVOX (lexivox.org) — Estado Plurinacional de Bolivia',
    jurisdiction: 'BO',
    disclaimer:
      'This data is sourced from the Gaceta Oficial de Bolivia and LexIVOX under Government Open Data principles. ' +
      'The authoritative versions are maintained by the Estado Plurinacional de Bolivia. ' +
      'Always verify with the official portal (lexivox.org).',
    freshness,
  };
}
