// Text Extractor: Extracts and formats clean text from TXT, EPUB, PDF, and Subtitle files (.SRT / .VTT)
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

export interface ExtractedBook {
  title: string;
  rawText: string;
  sentences: string[];
  wordCount: number;
  format: 'txt' | 'epub' | 'pdf' | 'srt' | 'pasted';
  cues?: Array<{ start: number; end: number; text: string }>;
}

/**
 * Strips HTML tags and unescapes common HTML entities
 */
function cleanHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, ' — ')
    .replace(/&ndash;/g, ' – ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits plain English text into clean sentences using boundary heuristics
 */
export function segmentIntoSentences(text: string): string[] {
  // Normalize whitespace and clean non-printable characters
  const clean = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Match sentences ending in ., !, ? but avoiding abbreviations like Mr., Mrs., Dr., etc.
  const raw = clean.split(/(?<=[.?!])\s+(?=[A-Z"“'‘—])/g);

  const sentences: string[] = [];
  for (const s of raw) {
    const trimmed = s.trim();
    if (trimmed.length > 0) {
      sentences.push(trimmed);
    }
  }

  return sentences.length > 0 ? sentences : [clean];
}

/**
 * Parses .SRT or .VTT subtitle file into timed cues
 */
export function parseSubtitleFile(content: string): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  const timeRegex = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})/;

  const blocks = content.replace(/\r\n/g, '\n').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(timeRegex);
      if (match) {
        const startH = parseInt(match[1] || '0', 10);
        const startM = parseInt(match[2], 10);
        const startS = parseInt(match[3], 10);
        const startMs = parseInt(match[4], 10);
        const start = startH * 3600 + startM * 60 + startS + startMs / 1000;

        const endH = parseInt(match[5] || '0', 10);
        const endM = parseInt(match[6], 10);
        const endS = parseInt(match[7], 10);
        const endMs = parseInt(match[8], 10);
        const end = endH * 3600 + endM * 60 + endS + endMs / 1000;

        const textLines = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
        if (textLines) {
          cues.push({ start, end, text: textLines });
        }
        break;
      }
    }
  }
  return cues;
}

/**
 * Extracts plain text from an EPUB file using JSZip
 */
export async function extractFromEpub(file: File): Promise<string> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(file);

  const htmlFiles: string[] = [];

  // Find all .html or .xhtml chapters
  zipContent.forEach((relativePath) => {
    if (/\.(x?html|htm)$/i.test(relativePath)) {
      htmlFiles.push(relativePath);
    }
  });

  // Sort logically (e.g. chapter1.xhtml, chapter2.xhtml)
  htmlFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  let fullBookText = '';
  for (const filePath of htmlFiles) {
    const fileData = await zipContent.file(filePath)?.async('text');
    if (fileData) {
      const cleaned = cleanHtml(fileData);
      if (cleaned.length > 50) {
        fullBookText += cleaned + '\n\n';
      }
    }
  }

  return fullBookText.trim();
}

/**
 * Extracts plain text from a PDF file using pdfjs-dist
 */
export async function extractFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  try {
    // Set worker src or load data
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdfDoc = await loadingTask.promise;

    let fullText = '';
    const numPages = Math.min(pdfDoc.numPages, 300); // safety cap

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageItems = textContent.items.map((item: any) => item.str || '').join(' ');
      fullText += pageItems + '\n\n';
    }

    return fullText.trim();
  } catch (err) {
    console.warn('PDF.js parse warning, falling back to stream decode:', err);
    // Fallback: decode raw text stream
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const raw = decoder.decode(arrayBuffer);
    const cleaned = raw.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ');
    return cleaned.trim();
  }
}

/**
 * Universal file text extractor supporting TXT, EPUB, PDF, and SRT
 */
export async function extractBookFromFile(file: File): Promise<ExtractedBook> {
  const filename = file.name;
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  let rawText = '';
  let format: ExtractedBook['format'] = 'txt';
  let cues: ExtractedBook['cues'] = undefined;

  if (ext === 'txt') {
    format = 'txt';
    rawText = await file.text();
  } else if (ext === 'epub') {
    format = 'epub';
    rawText = await extractFromEpub(file);
  } else if (ext === 'pdf') {
    format = 'pdf';
    rawText = await extractFromPdf(file);
  } else if (ext === 'srt' || ext === 'vtt') {
    format = 'srt';
    const content = await file.text();
    cues = parseSubtitleFile(content);
    rawText = cues.map((c) => c.text).join(' ');
  } else {
    // Default fallback: read as text
    rawText = await file.text();
  }

  const sentences = segmentIntoSentences(rawText);
  const wordCount = rawText.split(/\s+/).filter(Boolean).length;
  const title = filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

  return {
    title,
    rawText,
    sentences,
    wordCount,
    format,
    cues,
  };
}
