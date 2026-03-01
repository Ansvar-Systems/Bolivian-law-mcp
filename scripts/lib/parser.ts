/**
 * Bolivian Law HTML Parser
 *
 * Parses law text from HTML pages downloaded from LexiVox (lexivox.org).
 * LexiVox serves cleaned HTML content -- no PDF extraction needed.
 *
 * Bolivian civil law article patterns:
 *   "Artículo 1" / "ARTÍCULO 1" / "Art. 1"
 *   "Artículo 1°" / "Artículo Único"
 *   "ARTICULO 1ro." (older orthography without accent)
 *
 * Structure patterns:
 *   TÍTULO I / TITULO I
 *   CAPÍTULO I / CAPITULO I
 *   SECCIÓN I / SECCION I
 *   DISPOSICIONES TRANSITORIAS / FINALES / ABROGATORIAS
 *
 * Definition patterns:
 *   "se entiende por"
 *   "a los efectos de"
 *   "Para los fines de la presente ley"
 *
 * No child_process usage -- HTML only.
 */

/* ---------- Shared Types ---------- */

export interface ActIndexEntry {
  id: string;
  title: string;
  titleEn: string;
  shortName: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issuedDate: string;
  inForceDate: string;
  url: string;
  description?: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: string;
  issued_date: string;
  in_force_date: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

/* ---------- HTML Entity Decoding ---------- */

function decodeEntities(text: string): string {
  return text
    .replace(/&aacute;/g, '\u00e1').replace(/&eacute;/g, '\u00e9')
    .replace(/&iacute;/g, '\u00ed').replace(/&oacute;/g, '\u00f3')
    .replace(/&uacute;/g, '\u00fa').replace(/&ntilde;/g, '\u00f1')
    .replace(/&Aacute;/g, '\u00c1').replace(/&Eacute;/g, '\u00c9')
    .replace(/&Iacute;/g, '\u00cd').replace(/&Oacute;/g, '\u00d3')
    .replace(/&Uacute;/g, '\u00da').replace(/&Ntilde;/g, '\u00d1')
    .replace(/&uuml;/g, '\u00fc').replace(/&Uuml;/g, '\u00dc')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&laquo;/g, '\u00ab').replace(/&raquo;/g, '\u00bb')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/* ---------- HTML Stripping ---------- */

function stripTags(html: string): string {
  return html
    // Replace block-level close tags with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    // Remove all remaining tags
    .replace(/<[^>]*>/g, '');
}

/**
 * Clean raw HTML into plain text suitable for article parsing.
 */
function cleanHtml(html: string): string {
  let text = html;

  // Remove script, style, and comment blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Strip tags (converting block elements to newlines)
  text = stripTags(text);

  // Decode HTML entities
  text = decodeEntities(text);

  // Normalize whitespace
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

/* ---------- Article Patterns ---------- */

// Bolivian article patterns (case-insensitive, multiline)
const ARTICLE_PATTERNS: RegExp[] = [
  // Modern: "Artículo 1." / "Artículo 1°.-" / "ARTÍCULO 1.-"
  /(?:^|\n)\s*(?:ART[ÍI]CULO)\s+((?:\d+[\s.]*(?:bis|ter|quater)?|\d+[A-Z]?(?:\.\d+)?|[ÚU]NICO))\s*[°º.]*\s*[-.:–]?\s*([^\n]*)/gimu,
  // Abbreviated: "Art. 1.-" / "Art. 1."
  /(?:^|\n)\s*Art\.\s+((?:\d+[\s.]*(?:bis|ter|quater)?|\d+[A-Z]?(?:\.\d+)?|[ÚU]NICO))\s*[°º.]*\s*[-.:–]?\s*([^\n]*)/gimu,
  // Older form without accent: "ARTICULO 1ro." / "ARTICULO 1o.-"
  /(?:^|\n)\s*ARTICULO\s+(\d+)\s*[roº°]*\s*[.]*\s*[-.:–]?\s*([^\n]*)/gimu,
];

// Chapter / Title / Section heading patterns
const CHAPTER_RE = /(?:^|\n)\s*((?:CAP[ÍI]TULO|T[ÍI]TULO|SECCI[ÓO]N|PARTE)\s+[IVXLC0-9]+[^\n]*)/gimu;

// Disposiciones patterns (transitory, final, abrogatory)
const DISPOSICIONES_RE = /(?:^|\n)\s*(DISPOSICION(?:ES)?\s+(?:TRANSITORIA|FINAL|ABROGATORIA|DEROGATORIA|ADICIONAL)(?:ES|S)?[^\n]*)/gimu;

// Definition patterns for Bolivian law
const DEFINITION_PATTERNS: RegExp[] = [
  // "se entiende por X: Y" / "se entiende por X a Y"
  /se\s+(?:entiende|entender[áa])\s+por\s+"?([^".:,]+)"?\s*(?:[:,a])\s*([^.]+\.)/gi,
  // "se define X como Y"
  /se\s+define\s+"?([^".:,]+)"?\s*como\s+([^.]+\.)/gi,
  // "Para los efectos/fines de la presente ley:" followed by definitions
  /(?:Para\s+(?:los\s+)?(?:efectos?|fines?)\s+de\s+(?:la\s+presente\s+)?(?:ley|norma|decreto)[^:]*:\s*)\n?\s*(?:\d+[.)]\s*)?([^:–\-]+)\s*[:–\-]\s*([^.;]+[.;])/gim,
  // "a los efectos de esta ley, X es Y"
  /a\s+los\s+efectos?\s+de\s+(?:esta|la\s+presente)\s+(?:ley|norma)[^,]*,\s*"?([^".,]+)"?\s+(?:es|son|significa)\s+([^.]+\.)/gi,
];

/* ---------- Parser Internals ---------- */

interface Heading {
  ref: string;
  title: string;
  position: number;
}

/**
 * Find the start of the substantive law text (after preambles).
 *
 * Bolivian laws typically begin with preambles like:
 *   "EL PRESIDENTE DEL ESTADO PLURINACIONAL DE BOLIVIA"
 *   "LA ASAMBLEA LEGISLATIVA PLURINACIONAL DECRETA:"
 *   "EL HONORABLE CONGRESO NACIONAL DECRETA:"
 */
function findLawTextStart(text: string): number {
  const startPatterns = [
    /\bDECRETA\s*:/i,
    /\bRESUELVE\s*:/i,
    /\bPROMULGA\s*LA\s+SIGUIENTE\b/i,
    /\bHA\s+SANCIONADO\s+LA\s+SIGUIENTE\b/i,
    /\bLA\s+SIGUIENTE\s+LEY\b/i,
    /\bDISPONE\s*:/i,
    /(?:^|\n)\s*(?:ART[ÍI]CULO|Art\.)\s+(?:1|PRIMERO|[ÚU]NICO)\s*[°º.]*\s*[-.:–]/im,
  ];

  let earliestPos = text.length;
  for (const pattern of startPatterns) {
    const match = pattern.exec(text);
    if (match && match.index < earliestPos) {
      earliestPos = match.index;
    }
  }

  return earliestPos === text.length ? 0 : earliestPos;
}

/* ---------- Public Parser Functions ---------- */

/**
 * Parse cleaned plain text from a Bolivian law into provisions.
 */
export function parseBOLawText(text: string, act: ActIndexEntry): ParsedAct {
  const startIdx = findLawTextStart(text);
  const lawText = text.substring(startIdx);

  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];
  const headings: Heading[] = [];

  // Collect article headings from all patterns
  for (const pattern of ARTICLE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(lawText)) !== null) {
      const num = match[1].replace(/\s+/g, '').replace(/\.$/, '');
      const title = (match[2] ?? '').trim();
      const ref = `art${num.toLowerCase()}`;

      // Avoid duplicate refs at similar positions
      if (!headings.some(h => h.ref === ref && Math.abs(h.position - match!.index) < 20)) {
        headings.push({
          ref,
          title: title || `Art\u00edculo ${num}`,
          position: match.index,
        });
      }
    }
  }

  // Sort by position in the document
  headings.sort((a, b) => a.position - b.position);

  // Collect chapter/section headings for structural assignment
  const chapterRe = new RegExp(CHAPTER_RE.source, CHAPTER_RE.flags);
  const chapterPositions: { chapter: string; position: number }[] = [];
  let chMatch: RegExpExecArray | null;

  while ((chMatch = chapterRe.exec(lawText)) !== null) {
    chapterPositions.push({
      chapter: chMatch[1].trim(),
      position: chMatch.index,
    });
  }

  // Also add disposiciones sections as structural headings
  const dispRe = new RegExp(DISPOSICIONES_RE.source, DISPOSICIONES_RE.flags);
  while ((chMatch = dispRe.exec(lawText)) !== null) {
    chapterPositions.push({
      chapter: chMatch[1].trim(),
      position: chMatch.index,
    });
  }

  chapterPositions.sort((a, b) => a.position - b.position);

  // Extract content between article headings
  let currentChapter = '';
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i + 1];
    const endPos = nextHeading ? nextHeading.position : lawText.length;
    const rawContent = lawText.substring(heading.position, endPos).trim();

    // Update current chapter based on position
    for (const cp of chapterPositions) {
      if (cp.position <= heading.position) {
        currentChapter = cp.chapter;
      }
    }

    // Clean up the content
    const cleanedContent = rawContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    if (cleanedContent.length > 10) {
      provisions.push({
        provision_ref: heading.ref,
        chapter: currentChapter || undefined,
        section: currentChapter || act.title,
        title: heading.title,
        content: cleanedContent,
      });
    }
  }

  // Extract definitions
  for (const pattern of DEFINITION_PATTERNS) {
    const defRe = new RegExp(pattern.source, pattern.flags);
    let defMatch: RegExpExecArray | null;

    while ((defMatch = defRe.exec(lawText)) !== null) {
      const term = (defMatch[1] ?? '').trim();
      const definition = (defMatch[2] ?? '').trim();

      if (term.length < 2 || term.length > 120 || definition.length < 10) continue;

      // Attribute definition to nearest preceding article
      let sourceProvision: string | undefined;
      for (let i = headings.length - 1; i >= 0; i--) {
        if (headings[i].position <= defMatch.index) {
          sourceProvision = headings[i].ref;
          break;
        }
      }

      // Avoid duplicate terms
      if (!definitions.some(d => d.term.toLowerCase() === term.toLowerCase())) {
        definitions.push({ term, definition, source_provision: sourceProvision });
      }
    }
  }

  // Fallback: if no articles found, store entire text as single provision
  if (provisions.length === 0 && lawText.length > 50) {
    provisions.push({
      provision_ref: 'full-text',
      section: act.title,
      title: act.title,
      content: lawText.substring(0, 50000),
    });
  }

  return {
    id: act.id,
    type: 'statute',
    title: act.title,
    title_en: act.titleEn,
    short_name: act.shortName,
    status: act.status,
    issued_date: act.issuedDate,
    in_force_date: act.inForceDate,
    url: act.url,
    provisions,
    definitions,
  };
}

/**
 * Parse Bolivian law from raw HTML (LexiVox page content).
 *
 * Strips HTML tags, decodes entities, then delegates to text parser.
 */
export function parseBOLawHtml(html: string, act: ActIndexEntry): ParsedAct {
  const text = cleanHtml(html);

  if (!text || text.trim().length < 50) {
    return {
      id: act.id,
      type: 'statute',
      title: act.title,
      title_en: act.titleEn,
      short_name: act.shortName,
      status: act.status,
      issued_date: act.issuedDate,
      in_force_date: act.inForceDate,
      url: act.url,
      provisions: [],
      definitions: [],
    };
  }

  return parseBOLawText(text, act);
}
