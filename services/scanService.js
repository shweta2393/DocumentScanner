import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Format for extraction result (used by both OpenAI and Tesseract fallback) */
function formatExtraction(overrides = {}) {
  return {
    documentType: 'other',
    language: '',
    languages: [],
    extractedText: '',
    structuredData: {},
    formattedSummary: '',
    ...overrides,
  };
}

/**
 * Free fallback: use Tesseract.js for OCR (web only). No API key needed.
 */
async function scanWithTesseract(imageUri) {
  if (Platform.OS !== 'web') {
    throw new Error('Tesseract fallback is only available on web.');
  }
  console.log('=== Using Tesseract.js fallback (free, no API key) ===');
  console.log('Image URI:', imageUri);

  // Convert to data URL so Tesseract can load it reliably (blob URLs can be tricky)
  let imageSource = imageUri;
  if (imageUri.startsWith('blob:') || (imageUri.startsWith('http') && !imageUri.startsWith('data:'))) {
    try {
      const base64 = await imageUriToBase64(imageUri);
      imageSource = `data:image/jpeg;base64,${base64}`;
    } catch (e) {
      console.warn('Could not convert to data URL, using original URI:', e);
    }
  }

  const Tesseract = (await import('tesseract.js')).default;

  const result = await Tesseract.recognize(imageSource, 'eng+fra+deu+spa+ita+por', {
    logger: (m) => {
      if (m.status === 'recognizing text') console.log('Tesseract:', m.progress?.toFixed(0) + '%');
    },
  });

  const text = (result?.data?.text || '').trim();
  console.log('Tesseract extracted', text.length, 'characters');

  return formatExtraction({
    documentType: 'other',
    extractedText: text,
    structuredData: { rawText: text },
    formattedSummary: text
      ? `Extracted ${text.length} characters using free OCR. (OpenAI was unavailable.)`
      : 'No text could be extracted from this image.',
  });
}

function getApiKey() {
  const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  console.log('getApiKey called, key present:', !!key);
  console.log('Key value (first 10 chars):', key?.substring(0, 10));
  
  if (!key || key === 'sk-proj-your-key-here') {
    const error = new Error('OpenAI API key not set. Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart Expo.');
    console.error('API key error:', error.message);
    throw error;
  }
  return key;
}

/**
 * Convert image URI to base64. Handles file://, blob:, and data: URIs (web).
 */
export async function imageUriToBase64(uri) {
  console.log('=== imageUriToBase64 called ===');
  console.log('URI:', uri);
  console.log('Platform.OS:', Platform.OS);
  
  if (!uri) {
    console.error('No URI provided');
    throw new Error('No image URI provided');
  }

  // Data URI is already base64
  if (uri.startsWith('data:image')) {
    console.log('Data URI detected');
    const base64 = uri.split(',')[1];
    return base64 || uri;
  }

  // Web: blob URL - fetch and convert via FileReader
  if (Platform.OS === 'web' && (uri.startsWith('blob:') || uri.startsWith('http'))) {
    console.log('Web blob/http URI detected, fetching...');
    try {
      const response = await fetch(uri);
      console.log('Fetch response status:', response.status);
      const blob = await response.blob();
      console.log('Blob size:', blob.size, 'bytes');
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          console.log('FileReader completed');
          const dataUrl = reader.result;
          const base64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : dataUrl;
          console.log('Base64 length:', base64?.length);
          resolve(base64);
        };
        reader.onerror = (err) => {
          console.error('FileReader error:', err);
          reject(err);
        };
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error('Error fetching blob:', err);
      throw err;
    }
  }

  // Native or file:// URI (expo-file-system works on native; on web file:// may not)
  if (Platform.OS !== 'web' && FileSystem.readAsStringAsync) {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (e) {
      console.warn('FileSystem read failed:', e);
    }
  }

  // Web fallback: try fetch for any remaining URI (e.g. blob from picker)
  if (Platform.OS === 'web') {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          const base64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : dataUrl;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Web fetch fallback failed:', e);
    }
  }

  throw new Error('Could not read image as base64 for this platform');
}

const SYSTEM_PROMPT = `You are an expert document OCR and structuring assistant. Your task is to:
1. Extract ALL text from the image with high accuracy.
2. Support multiple languages: Latin, Cyrillic, Arabic, CJK (Chinese, Japanese, Korean), Hebrew, Thai, and others. Preserve the original script.
3. Classify the document type and return structured data appropriate for that type.

Document types and required structured output:

- passport: Use tag "passport". Extract: fullName, dateOfBirth, placeOfBirth, passportNumber, nationality, gender, issueDate, expiryDate, issuingAuthority, mrzLine1, mrzLine2 (if visible). Use ISO dates (YYYY-MM-DD) where possible.

- id_card / national_id: Use tag "id_card". Extract: fullName, idNumber, dateOfBirth, nationality, address, issueDate, expiryDate, issuingAuthority.

- receipt: Use tag "receipt". Extract: vendorName, vendorAddress, date, time, items (array of { name, quantity, unitPrice, total }), subtotal, tax, total, paymentMethod, currency.

- invoice: Use tag "invoice". Extract: invoiceNumber, issueDate, dueDate, seller (name, address), buyer (name, address), items (array of { description, quantity, unitPrice, amount }), subtotal, tax, total, currency, paymentTerms.

- letter / contract: Use tag "letter". Extract: date, sender, recipient, subject, body (full text or summary), signatureBlock if present.

- form: Use tag "form". Extract: formTitle, fields (array of { label, value } for each filled field), rawText.

- other: Use tag "other". Extract: rawText (all extracted text), detectedLanguage.

Always respond with a single valid JSON object (no markdown, no code fence). Use this exact structure:
{
  "documentType": "passport" | "id_card" | "receipt" | "invoice" | "letter" | "form" | "other",
  "language": "iso 639-1 code or language name",
  "languages": ["array of detected language codes if multiple"],
  "extractedText": "full raw text from the image, preserving line breaks",
  "structuredData": { ... type-specific fields as described above ... },
  "formattedSummary": "Short human-readable summary (1-2 sentences) for preview"
}

If a field is not present or unreadable, use null or empty string. Never invent data.`;

/**
 * Call OpenAI Vision to extract and structure document content.
 * @param {string} imageUri - Local file URI or blob URI of the image
 * @returns {Promise<{ documentType, language, languages, extractedText, structuredData, formattedSummary }>}
 */
export async function scanDocumentWithAI(imageUri) {
  console.log('=== scanDocumentWithAI started ===');
  console.log('Image URI:', imageUri);
  
  try {
    const apiKey = getApiKey();
    console.log('API key retrieved successfully');
    
    console.log('Converting image to base64...');
    const base64 = await imageUriToBase64(imageUri);
    console.log('Base64 conversion complete, length:', base64?.length);

    console.log('Sending request to OpenAI...');
    console.log('API URL:', OPENAI_API_URL);
    console.log('Model: gpt-4o');
    
    const requestBody = {
      model: 'gpt-4o-mini', // Using cheaper model to reduce costs
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract and structure all text from this document image. Support any language. Return only the JSON object.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
    };
    
    console.log('Request body size:', JSON.stringify(requestBody).length, 'chars');
    
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);

    if (!response.ok) {
      const errBody = await response.text();
      console.error('API error response:', errBody);
      let message = `OpenAI API error (${response.status})`;
      let errorType = 'unknown';
      let isQuotaError = false;

      try {
        const j = JSON.parse(errBody);
        if (j.error?.message) {
          message = j.error.message;
          errorType = j.error?.type || 'unknown';
          isQuotaError =
            message.includes('quota') ||
            message.includes('billing') ||
            message.includes('exceeded');

          if (isQuotaError) {
            message = `OpenAI API Quota Exceeded\n\nYour API key has run out of credits. Trying free OCR fallback...`;
          } else if (message.includes('invalid_api_key') || message.includes('Incorrect API key')) {
            message = `Invalid API Key\n\nPlease check your .env file and ensure EXPO_PUBLIC_OPENAI_API_KEY is set correctly.\n\nError details: ${j.error.message}`;
          } else if (message.includes('rate_limit')) {
            message = `Rate Limit Exceeded\n\nToo many requests. Please wait a moment and try again.\n\nError details: ${j.error.message}`;
          }
        }
        console.error('Parsed error:', j);
      } catch (_) {
        console.error('Could not parse error body');
      }

      // On web: try free Tesseract.js fallback when quota/billing error
      if (Platform.OS === 'web' && isQuotaError) {
        console.log('OpenAI quota exceeded — using free Tesseract.js OCR fallback');
        try {
          const fallbackResult = await scanWithTesseract(imageUri);
          console.log('Tesseract fallback succeeded');
          return fallbackResult;
        } catch (tesseractErr) {
          console.error('Tesseract fallback failed:', tesseractErr);
          throw new Error(
            `OpenAI quota exceeded and fallback OCR failed.\n\nAdd credits at https://platform.openai.com/account/billing or try again.\n\nFallback error: ${tesseractErr?.message || tesseractErr}`
          );
        }
      }

      throw new Error(
        message +
          (Platform.OS !== 'web'
            ? '\n\nOn web, the app can use free OCR when OpenAI quota is exceeded.'
            : '')
      );
    }

    console.log('Parsing response JSON...');
    const data = await response.json();
    console.log('Response data:', data);
    
    const content = data.choices?.[0]?.message?.content?.trim();
    console.log('Content length:', content?.length);
    
    if (!content) {
      console.error('Empty content in response');
      throw new Error('Empty response from OpenAI');
    }

    // Strip possible markdown code block
    let jsonStr = content;
    const codeMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      console.log('Found code block, extracting JSON');
      jsonStr = codeMatch[1].trim();
    }

    console.log('Parsing JSON result...');
    const result = JSON.parse(jsonStr);
    console.log('Parsed result:', result);

    const extraction = {
      documentType: result.documentType || 'other',
      language: result.language || '',
      languages: result.languages || [],
      extractedText: result.extractedText || '',
      structuredData: result.structuredData || {},
      formattedSummary: result.formattedSummary || '',
    };
    
    console.log('=== scanDocumentWithAI completed successfully ===');
    return extraction;
  } catch (err) {
    console.error('=== scanDocumentWithAI error ===');
    console.error('Error:', err);

    // On web: if OpenAI failed for any reason, try free Tesseract fallback
    if (Platform.OS === 'web') {
      const msg = err?.message || '';
      const isQuotaOrBilling =
        msg.includes('quota') ||
        msg.includes('billing') ||
        msg.includes('exceeded') ||
        msg.includes('401') ||
        msg.includes('429');
      if (isQuotaOrBilling) {
        console.log('Trying free Tesseract.js fallback after OpenAI error');
        try {
          const fallbackResult = await scanWithTesseract(imageUri);
          console.log('Tesseract fallback succeeded');
          return fallbackResult;
        } catch (tesseractErr) {
          console.error('Tesseract fallback failed:', tesseractErr);
        }
      }
    }

    throw err;
  }
}
