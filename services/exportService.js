import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  HeadingLevel,
} from 'docx';

// jsPDF for web PDF (expo-print on web captures current page, not our HTML)
let jsPDF;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    jsPDF = require('jspdf').jsPDF;
  } catch (_) {}
}

const EXPORT_FORMATS = [
  { id: 'pdf', label: 'PDF', mime: 'application/pdf', ext: 'pdf' },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'png', label: 'PNG', mime: 'image/png', ext: 'png' },
  { id: 'docx', label: 'Word (DOCX)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  { id: 'txt', label: 'Plain Text (TXT)', mime: 'text/plain', ext: 'txt' },
  { id: 'html', label: 'HTML', mime: 'text/html', ext: 'html' },
];

export { EXPORT_FORMATS };

function buildHtmlFromExtraction(extraction, docName = 'Document') {
  const type = extraction?.documentType || 'other';
  const data = extraction?.structuredData || {};
  const text = extraction?.extractedText || '';
  const summary = extraction?.formattedSummary || '';

  let body = `
    <h1 style="font-family: sans-serif; color: #111;">${docName}</h1>
    <p style="color: #666; font-size: 14px;">${summary || 'Scanned document'}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
  `;

  // Structured fields (exclude rawText - we show full text once below)
  const dataEntries = Object.entries(data).filter(
    ([k, v]) => k !== 'rawText' && v != null && !(Array.isArray(v) && v.length === 0)
  );
  if (dataEntries.length > 0) {
    body += '<table style="width: 100%; border-collapse: collapse; font-family: sans-serif;">';
    for (const [key, value] of dataEntries) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      const display = Array.isArray(value)
        ? value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ')
        : typeof value === 'object' ? JSON.stringify(value) : String(value);
      body += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: 600; color: #374151; width: 30%;">${label}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #111;">${escapeHtml(display)}</td>
        </tr>
      `;
    }
    body += '</table>';
  }

  const fullText = text || (data.rawText != null ? String(data.rawText) : '');
  if (fullText) {
    body += `<h2 style="font-family: sans-serif; margin-top: 24px;">Full text</h2><pre style="white-space: pre-wrap; font-family: sans-serif; background: #f9fafb; padding: 16px; border-radius: 8px;">${escapeHtml(fullText)}</pre>`;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(docName)}</title>
      <style>body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; color: #111; max-width: 800px; margin: 0 auto; }</style>
    </head>
    <body>${body}</body>
    </html>
  `;
}

function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Single "full text" source: prefer extractedText; avoid duplicating rawText
function getFullText(extraction) {
  const text = extraction?.extractedText || '';
  const rawText = extraction?.structuredData?.rawText;
  if (text) return text;
  if (rawText) return rawText;
  return '';
}

function buildTextFromExtraction(extraction) {
  const type = extraction?.documentType || 'other';
  const data = extraction?.structuredData || {};
  const fullText = getFullText(extraction);
  const summary = extraction?.formattedSummary || '';

  let out = `${type.toUpperCase()} DOCUMENT\n${'='.repeat(40)}\n\n`;
  if (summary) out += `${summary}\n\n`;

  // Structured fields only (skip rawText - we show it once below as "Full text")
  const dataKeys = Object.keys(data).filter((k) => k !== 'rawText');
  if (dataKeys.length > 0) {
    for (const key of dataKeys) {
      const value = data[key];
      if (value == null) continue;
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      const display = Array.isArray(value)
        ? value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ')
        : typeof value === 'object' ? JSON.stringify(value) : String(value);
      out += `${label}: ${display}\n`;
    }
    out += '\n';
  }

  if (fullText) out += `FULL TEXT:\n${fullText}\n`;
  return out;
}

async function buildDocxFromExtraction(extraction, docName = 'Document') {
  const data = extraction?.structuredData || {};
  const text = extraction?.extractedText || '';
  const summary = extraction?.formattedSummary || '';

  const children = [
    new Paragraph({
      text: docName,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }),
  ];

  if (summary) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: summary, italics: true })],
        spacing: { after: 200 },
      })
    );
  }

  // Structured fields (exclude rawText - we show full text once below)
  const dataEntries = Object.entries(data).filter(
    ([k, v]) => k !== 'rawText' && v != null && !(Array.isArray(v) && v.length === 0)
  );
  if (dataEntries.length > 0) {
    const rows = dataEntries.map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
        const display = Array.isArray(value)
          ? value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ')
          : typeof value === 'object' ? JSON.stringify(value) : String(value);
        return new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
              width: { size: 30, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun(display)] })],
              width: { size: 70, type: WidthType.PERCENTAGE },
            }),
          ],
        });
      });
    if (rows.length > 0) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
          },
          rows,
        })
      );
      children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    }
  }

  // Single "Full text" section (extractedText or structuredData.rawText)
  const fullText = text || (data.rawText != null ? String(data.rawText) : '');
  if (fullText) {
    children.push(
      new Paragraph({
        text: 'Full text',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        text: fullText,
        spacing: { after: 200 },
      })
    );
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return doc;
}

async function shareOrDownload(uri, filename, mimeType) {
  const isWeb = Platform.OS === 'web';
  if (isWeb && typeof window !== 'undefined' && window.document) {
    const link = window.document.createElement('a');
    link.href = uri;
    link.download = filename;
    link.click();
    return;
  }
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: `Export: ${filename}`,
    });
  }
}

/** Build PDF from extraction using jsPDF (web only) - generates content, not current page */
function buildPdfFromExtractionWeb(extraction, docName = 'Document') {
  if (!jsPDF) throw new Error('jsPDF not available');
  const data = extraction?.structuredData || {};
  const fullText = getFullText(extraction);
  const summary = extraction?.formattedSummary || '';

  const doc = new jsPDF({ putOnlyUsedFonts: true });
  let y = 20;
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;

  doc.setFontSize(18);
  doc.text(docName, margin, y);
  y += 12;

  if (summary) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'italic');
    const summaryLines = doc.splitTextToSize(summary, maxWidth);
    doc.text(summaryLines, margin, y);
    doc.setFont(undefined, 'normal');
    y += summaryLines.length * 6 + 6;
  }

  const dataEntries = Object.entries(data).filter(
    ([k, v]) => k !== 'rawText' && v != null && !(Array.isArray(v) && v.length === 0)
  );
  if (dataEntries.length > 0) {
    doc.setFontSize(12);
    doc.text('Details', margin, y);
    y += 8;
    doc.setFontSize(10);
    for (const [key, value] of dataEntries) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      const display = Array.isArray(value)
        ? value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ')
        : typeof value === 'object' ? JSON.stringify(value) : String(value);
      const lines = doc.splitTextToSize(`${label}: ${display}`, maxWidth);
      if (y + lines.length * 6 > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(lines, margin, y);
      y += lines.length * 6 + 4;
    }
    y += 8;
  }

  if (fullText) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.text('Full text', margin, y);
    y += 8;
    doc.setFontSize(10);
    const textLines = doc.splitTextToSize(fullText, maxWidth);
    for (let i = 0; i < textLines.length; i++) {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text(textLines[i], margin, y);
      y += 6;
    }
  }

  return doc;
}

/** Fetch image as blob and trigger download with correct MIME (web) - use actual image bytes so file is valid */
async function downloadImageAsFileWeb(imageUri, filename, requestedMime) {
  const response = await fetch(imageUri);
  if (!response.ok) throw new Error('Could not load image');
  const blob = await response.blob();
  // Use blob's actual type so saved file is valid (avoid wrong format / FPI exception)
  const actualMime = blob.type || requestedMime || 'image/jpeg';
  const ext = actualMime === 'image/png' ? 'png' : 'jpg';
  const name = filename.replace(/\.(jpg|jpeg|png)$/i, `.${ext}`);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export a saved document in the chosen format.
 * @param {Object} savedDoc - { id, name, uri, extraction, ... }
 * @param {string} formatId - 'pdf' | 'jpeg' | 'png' | 'docx' | 'txt' | 'html'
 * @returns {Promise<string>} - message or thrown error
 */
export async function exportDocument(savedDoc, formatId) {
  if (!savedDoc) throw new Error('No document provided');
  const baseName = (savedDoc.name || 'document').replace(/\.[^.]+$/, '');
  const format = EXPORT_FORMATS.find((f) => f.id === formatId);
  if (!format) throw new Error(`Unsupported format: ${formatId}`);

  const filename = `${baseName}.${format.ext}`;
  const isWeb = Platform.OS === 'web';

  switch (formatId) {
    case 'pdf': {
      if (isWeb && jsPDF) {
        // Web: generate PDF from extraction content (not current page)
        const doc = buildPdfFromExtractionWeb(savedDoc.extraction || {}, savedDoc.name);
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        return `Downloaded ${filename}`;
      }
      // Native: use expo-print with our HTML
      const html = buildHtmlFromExtraction(savedDoc.extraction || {}, savedDoc.name);
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      await shareOrDownload(uri, filename, format.mime);
      return `Exported as ${filename}`;
    }

    case 'jpeg':
    case 'png': {
      const imageUri = savedDoc.uri || savedDoc.originalUri;
      if (!imageUri) throw new Error('Document has no image to export');
      if (isWeb && typeof window !== 'undefined' && window.document) {
        // Fetch image and download with correct MIME so file is valid JPG/PNG
        await downloadImageAsFileWeb(imageUri, filename, format.mime);
        return `Downloaded ${filename}`;
      }
      await shareOrDownload(imageUri, filename, format.mime);
      return `Shared ${filename}`;
    }

    case 'docx': {
      const doc = await buildDocxFromExtraction(savedDoc.extraction || {}, savedDoc.name);
      if (isWeb && typeof window !== 'undefined' && window.document) {
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        return `Downloaded ${filename}`;
      }
      const base64 = await Packer.toBase64String(doc);
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const path = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      await shareOrDownload(path, filename, format.mime);
      return `Exported ${filename}`;
    }

    case 'txt': {
      const text = buildTextFromExtraction(savedDoc.extraction || {});
      if (isWeb && typeof window !== 'undefined' && window.document) {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        return `Downloaded ${filename}`;
      }
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const path = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(path, text);
      await shareOrDownload(path, filename, format.mime);
      return `Exported ${filename}`;
    }

    case 'html': {
      const html = buildHtmlFromExtraction(savedDoc.extraction || {}, savedDoc.name);
      if (isWeb && typeof window !== 'undefined' && window.document) {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        return `Downloaded ${filename}`;
      }
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const path = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(path, html);
      await shareOrDownload(path, filename, format.mime);
      return `Exported ${filename}`;
    }

    default:
      throw new Error(`Export not implemented: ${formatId}`);
  }
}
