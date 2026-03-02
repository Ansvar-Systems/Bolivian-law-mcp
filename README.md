# Bolivian Law MCP Server

**The Bolivia Justia alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fbolivian-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/bolivian-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Bolivian-law-mcp?style=social)](https://github.com/Ansvar-Systems/Bolivian-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Bolivian-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Bolivian-law-mcp/actions/workflows/ci.yml)
[![Provisions](https://img.shields.io/badge/provisions-25%2C002-blue)]()

Query **2,497 Bolivian statutes** -- from the Código Civil and Código Penal to the Ley de Telecomunicaciones, Ley de Servicios Financieros, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Bolivian legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Por Qué Existe Esto

La investigación jurídica boliviana está dispersa entre el Gaceta Oficial, el sistema de la Asamblea Legislativa Plurinacional, portales como Bolivia Justia, y publicaciones en PDF. Tanto si eres:

- Un **abogado** validando citas en un escrito o contrato
- Un **oficial de cumplimiento** verificando si una ley sigue vigente
- Un **desarrollador de legaltech** construyendo herramientas sobre la legislación boliviana
- Un **investigador** que rastrea el historial legislativo de una norma

...no deberías necesitar decenas de pestañas del navegador y referencias manuales en PDF. Pregúntale a Claude. Obtén la provisión exacta. Con contexto.

Este servidor MCP hace que la legislación boliviana sea **buscable, referenciable y legible por IA**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://bolivian-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add bolivian-law --transport http https://bolivian-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bolivian-law": {
      "type": "url",
      "url": "https://bolivian-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "bolivian-law": {
      "type": "http",
      "url": "https://bolivian-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/bolivian-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bolivian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/bolivian-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "bolivian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/bolivian-law-mcp"]
    }
  }
}
```

---

## Example Queries

Una vez conectado, simplemente pregunta de forma natural:

- *"¿Qué dice el artículo 584 del Código Civil boliviano sobre la compraventa?"*
- *"¿Está vigente la Ley de Telecomunicaciones (Ley 164)?"*
- *"Encuentra disposiciones sobre protección de datos personales en la legislación boliviana"*
- *"¿Qué dice el Código Penal sobre los delitos informáticos?"*
- *"Busca normas sobre contratos laborales en la Ley General del Trabajo"*
- *"¿Qué regulaciones rigen el sistema bancario boliviano según la Ley de Servicios Financieros?"*
- *"Valida la cita 'Artículo 1 de la Ley 1178'"*
- *"Construye una postura legal sobre los derechos del consumidor bajo la legislación boliviana"*
- *"¿Qué dice la Constitución Política del Estado sobre los derechos indígenas?"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | 2,497 laws | Comprehensive Bolivian legislation from Bolivia Justia |
| **Provisions** | 25,002 sections | Full-text searchable with FTS5 |
| **Database Size** | ~51 MB | Optimized SQLite, portable |
| **Freshness Checks** | Automated | Drift detection against source |

**Verified data only** -- every citation is validated against official sources (bolivia.justia.com). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from Bolivia Justia (bolivia.justia.com), which mirrors official Bolivian legislative publications
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains legislation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by statute name and article number
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
Bolivia Justia --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                    ^                        ^
             Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search Bolivia Justia by statute name | Search by plain Spanish: *"protección datos personales"* |
| Navigate multi-article statutes manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "¿Está vigente esta ley?" -- check manually | `check_currency` tool -- answer in seconds |
| Find OAS basis -- dig through OAS documents | `get_eu_basis` -- linked international frameworks instantly |
| No API, no integration | MCP protocol -- AI-native |

**Traditional:** Search Bolivia Justia --> Download PDF --> Ctrl+F --> Cross-reference with other laws --> Verify with Gaceta Oficial --> Repeat

**This MCP:** *"¿Qué dice el Código Civil sobre contratos de compraventa y cómo se relaciona con la Ley del Consumidor?"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across 25,002 provisions with BM25 ranking. Supports quoted phrases, boolean operators, prefix wildcards |
| `get_provision` | Retrieve specific provision by statute name and article number |
| `check_currency` | Check if a statute is in force, amended, or repealed |
| `validate_citation` | Validate citation against database -- zero-hallucination check |
| `build_legal_stance` | Aggregate citations from multiple statutes for a legal topic |
| `format_citation` | Format citations per Bolivian legal conventions (full/short/pinpoint) |
| `list_sources` | List all available statutes with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get international frameworks (OAS, MERCOSUR, Andean Community) that a Bolivian statute aligns with |
| `get_bolivian_implementations` | Find Bolivian laws implementing a specific international convention or treaty |
| `search_eu_implementations` | Search international documents with Bolivian implementation counts |
| `get_provision_eu_basis` | Get international law references for a specific provision |
| `validate_eu_compliance` | Check alignment status of Bolivian statutes against international frameworks |

---

## International Law Alignment

Bolivia is not an EU member state, but Bolivian law has significant alignment with international frameworks:

- **OAS (Organization of American States):** Bolivia is a member and has incorporated OAS conventions including the Inter-American Convention against Corruption and the American Convention on Human Rights into domestic law
- **Andean Community (CAN):** Bolivia is a full member of the Andean Community and implements Andean Decisions as binding law -- Decision 486 on Industrial Property, Decision 351 on Copyright, and more
- **MERCOSUR:** Bolivia joined as a full member in 2024, bringing substantial regulatory harmonization obligations
- **UN Conventions:** Bolivia has ratified major UN conventions (UNCAC, UNCLOS, CISG) which inform domestic legislation

The international alignment tools allow you to explore these relationships -- checking which Bolivian provisions correspond to treaty obligations, and vice versa.

> **Note:** International cross-references reflect alignment and implementation relationships. Bolivia adopts its own legislative approach, and the alignment tools help identify where Bolivian and international law address similar domains.

---

## Data Sources & Freshness

All content is sourced from authoritative Bolivian legal databases:

- **[Bolivia Justia](https://bolivia.justia.com/)** -- Comprehensive mirror of Bolivian official legislation, including statutes from the Asamblea Legislativa Plurinacional

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Asamblea Legislativa Plurinacional de Bolivia (via Bolivia Justia) |
| **Retrieval method** | Structured scrape from bolivia.justia.com |
| **Language** | Spanish |
| **Coverage** | 2,497 Bolivian statutes |
| **Database size** | ~51 MB |

### Automated Freshness Checks

A GitHub Actions workflow monitors for statute changes and amendments:

| Check | Method |
|-------|--------|
| **Statute amendments** | Drift detection against known provision anchors |
| **New statutes** | Comparison against source index |
| **Repealed statutes** | Status change detection |

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from Bolivia Justia, which mirrors official Bolivian legislative publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Verify critical citations** against the Gaceta Oficial de Bolivia for court filings
> - **International cross-references** reflect alignment relationships, not direct transposition
> - **Departmental and municipal regulations** are not included -- this covers national legislation only

For professional legal advice in Bolivia, consult a member of the **Colegio de Abogados de Bolivia**.

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [SECURITY.md](SECURITY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Bolivian-law-mcp
cd Bolivian-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/src/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest          # Ingest statutes from Bolivia Justia
npm run build:db        # Rebuild SQLite database
npm run drift:detect    # Run drift detection against anchors
npm run check-updates   # Check for amendments and new statutes
npm run census          # Generate coverage census
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~51 MB (efficient, portable)
- **Reliability:** 100% ingestion success rate across 2,497 statutes

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npx @ansvar/us-regulations-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

### [@ansvar/colombian-law-mcp](https://github.com/Ansvar-Systems/Colombian-law-mcp)
**Query Colombian legislation** -- neighboring Andean Community member with a similar legal framework. `npx @ansvar/colombian-law-mcp`

**70+ national law MCPs** covering Australia, Brazil, Canada, Chile, Colombia, Denmark, Ecuador, Finland, France, Germany, Ghana, India, Ireland, Japan, Kenya, Netherlands, Nigeria, Norway, Peru, Singapore, South Korea, Sweden, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law expansion (Tribunal Constitucional Plurinacional decisions)
- Gaceta Oficial cross-referencing for amendment history
- Andean Community Decision integration
- Historical statute versions and amendment tracking

---

## Roadmap

- [x] Core statute database with FTS5 search
- [x] Full corpus ingestion (2,497 statutes, 25,002 provisions)
- [x] International law alignment tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Court case law expansion (Tribunal Constitucional Plurinacional)
- [ ] Gaceta Oficial amendment history
- [ ] Andean Community Decision integration
- [ ] Historical statute versions

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{bolivian_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Bolivian Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Bolivian-law-mcp},
  note = {2,497 Bolivian statutes with 25,002 provisions and international law alignment}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Bolivian Government (public domain via Bolivia Justia)
- **International Metadata:** OAS, Andean Community (public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server started as our internal reference tool for Latin American law -- turns out everyone building compliance tools for the Andean region has the same research frustrations.

So we're open-sourcing it. Navigating 2,497 Bolivian statutes shouldn't require hours of manual searching.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
