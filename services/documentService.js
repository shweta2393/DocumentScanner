import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPin } from './pinHash';

const STORAGE_KEY = '@document_scanner_documents';

export { hashPin };

// Verify that entered PIN matches document's stored hash
export const verifyDocumentPin = async (doc, pin) => {
  if (!doc?.locked || !doc?.pinHash) return false;
  const hash = await hashPin(pin);
  return hash !== null && hash === doc.pinHash;
};

// Use documentDirectory only on native; it can be null/undefined on web
const getDocumentsDir = () => {
  if (FileSystem.documentDirectory) {
    return `${FileSystem.documentDirectory}documents/`;
  }
  return null;
};

const DOCUMENTS_DIR = getDocumentsDir();

// Ensure documents directory exists (native only)
const ensureDocumentsDir = async () => {
  if (!DOCUMENTS_DIR) return false;
  try {
    const dirInfo = await FileSystem.getInfoAsync(DOCUMENTS_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(DOCUMENTS_DIR, { intermediates: true });
    }
    return true;
  } catch (e) {
    return false;
  }
};

// Format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

// Format date
const formatDate = (date) => {
  const now = new Date();
  const docDate = new Date(date);
  const diffTime = Math.abs(now - docDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffTime / (1000 * 60));
      return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
    }
    return docDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else if (diffDays === 1) {
    return 'Yesterday, ' + docDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else if (diffDays < 7) {
    return docDate.toLocaleDateString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else {
    return docDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
};

// Save document - always persist to AsyncStorage so count/list update even if file copy fails
export const saveDocument = async (imageUri, source = 'camera') => {
  const timestamp = Date.now();
  const fileName = `document_${timestamp}.jpg`;
  let fileUri = imageUri; // fallback to original URI if copy fails
  let fileSize = 0;

  // Try to copy to app documents directory (works on iOS; may fail on Android content URIs or web)
  if (DOCUMENTS_DIR) {
    const dirReady = await ensureDocumentsDir();
    if (dirReady) {
      const targetUri = `${DOCUMENTS_DIR}${fileName}`;
      try {
        await FileSystem.copyAsync({
          from: imageUri,
          to: targetUri,
        });
        const fileInfo = await FileSystem.getInfoAsync(targetUri, { size: true });
        if (fileInfo.exists) {
          fileUri = targetUri;
          fileSize = fileInfo.size ?? 0;
        }
      } catch (copyErr) {
        console.warn('File copy failed, saving with original URI:', copyErr);
        // Keep fileUri as imageUri; we still save the record below
      }
    }
  }

  // Build document record and always save to AsyncStorage so UI updates
  const document = {
    id: timestamp.toString(),
    name: fileName,
    uri: fileUri,
    originalUri: imageUri,
    size: fileSize,
    formattedSize: formatFileSize(fileSize),
    type: 'Image',
    source: source,
    createdAt: new Date().toISOString(),
    formattedDate: formatDate(new Date()),
  };

  try {
    const existingDocsJson = await AsyncStorage.getItem(STORAGE_KEY);
    const existingDocs = existingDocsJson ? JSON.parse(existingDocsJson) : [];
    const updatedDocs = [document, ...existingDocs];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedDocs));
    console.log('Document saved successfully:', document.id);
    return document;
  } catch (error) {
    console.error('Error saving document to storage:', error);
    throw error;
  }
};

// Save document with AI extraction result (for preview → save flow)
export const saveDocumentWithExtraction = async (
  imageUri,
  extraction,
  source = 'camera'
) => {
  const doc = await saveDocument(imageUri, source);
  if (!extraction) return doc;

  try {
    const existingDocsJson = await AsyncStorage.getItem(STORAGE_KEY);
    const existingDocs = existingDocsJson ? JSON.parse(existingDocsJson) : [];
    const updated = existingDocs.map((d) =>
      d.id === doc.id ? { ...d, extraction } : d
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return { ...doc, extraction };
  } catch (error) {
    console.error('Error saving extraction:', error);
    return doc;
  }
};

// Update document extraction (for editing) - sets wasEdited so History shows "Edited" only for actually edited docs
export const updateDocumentExtraction = async (documentId, extraction) => {
  try {
    const docsJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!docsJson) throw new Error('Document not found');

    const docs = JSON.parse(docsJson);
    const updated = docs.map((doc) =>
      doc.id === documentId
        ? { ...doc, extraction, wasEdited: true, editedAt: new Date().toISOString() }
        : doc
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log('Document extraction updated:', documentId);
    return true;
  } catch (error) {
    console.error('Error updating document extraction:', error);
    throw error;
  }
};

// Lock selected documents with a PIN (store hash only)
export const lockDocuments = async (documentIds, pin) => {
  const pinHash = await hashPin(pin);
  if (!pinHash || !documentIds?.length) return false;
  try {
    const docsJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!docsJson) return false;
    const docs = JSON.parse(docsJson);
    const idsSet = new Set(documentIds);
    const updated = docs.map((doc) =>
      idsSet.has(doc.id) ? { ...doc, locked: true, pinHash } : doc
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.error('Error locking documents:', error);
    throw error;
  }
};

// Unlock a document (remove PIN) after verifying current PIN
export const unlockDocument = async (documentId, pin) => {
  try {
    const allDocs = await getAllDocuments();
    const doc = allDocs.find((d) => d.id === documentId);
    if (!doc?.locked || !(await verifyDocumentPin(doc, pin))) return false;
    const docsJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!docsJson) return false;
    const docs = JSON.parse(docsJson);
    const updated = docs.map((d) =>
      d.id === documentId ? { ...d, locked: false, pinHash: undefined } : d
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.error('Error unlocking document:', error);
    throw error;
  }
};

// Unlock multiple documents (e.g. after selecting locked docs and entering PIN)
export const unlockDocuments = async (documentIds, pin) => {
  try {
    const allDocs = await getAllDocuments();
    const toUnlock = allDocs.filter((d) => documentIds.includes(d.id) && d.locked);
    for (const doc of toUnlock) {
      if (!(await verifyDocumentPin(doc, pin))) return false;
    }
    const docsJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!docsJson) return false;
    const docs = JSON.parse(docsJson);
    const idsSet = new Set(documentIds);
    const updated = docs.map((d) =>
      idsSet.has(d.id) && d.locked ? { ...d, locked: false, pinHash: undefined } : d
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.error('Error unlocking documents:', error);
    throw error;
  }
};

// Get document by ID
export const getDocumentById = async (documentId) => {
  try {
    const docs = await getAllDocuments();
    return docs.find((doc) => doc.id === documentId) || null;
  } catch (error) {
    console.error('Error getting document by ID:', error);
    return null;
  }
};

// Get all documents
export const getAllDocuments = async () => {
  try {
    const docsJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!docsJson) return [];

    const docs = JSON.parse(docsJson);
    // Update formatted dates for all documents
    return docs.map((doc) => ({
      ...doc,
      formattedDate: formatDate(doc.createdAt),
    }));
  } catch (error) {
    console.error('Error getting documents:', error);
    return [];
  }
};

// Delete document
export const deleteDocument = async (documentId) => {
  try {
    const docsJson = await AsyncStorage.getItem(STORAGE_KEY);
    if (!docsJson) return false;

    const docs = JSON.parse(docsJson);
    const document = docs.find((doc) => doc.id === documentId);

    if (document) {
      // Delete file from filesystem (only if it's our app path)
      try {
        if (DOCUMENTS_DIR && document.uri && document.uri.startsWith(DOCUMENTS_DIR)) {
          const fileInfo = await FileSystem.getInfoAsync(document.uri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(document.uri, { idempotent: true });
          }
        }
      } catch (e) {
        console.warn('Could not delete file:', e);
      }

      // Remove from storage
      const updatedDocs = docs.filter((doc) => doc.id !== documentId);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedDocs));

      return true;
    }

    return false;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
};

// Get document count
export const getDocumentCount = async () => {
  try {
    const docs = await getAllDocuments();
    return docs.length;
  } catch (error) {
    console.error('Error getting document count:', error);
    return 0;
  }
};

// Get total storage used
export const getTotalStorageUsed = async () => {
  try {
    const docs = await getAllDocuments();
    const totalBytes = docs.reduce((sum, doc) => sum + (doc.size || 0), 0);
    return {
      bytes: totalBytes,
      formatted: formatFileSize(totalBytes),
    };
  } catch (error) {
    console.error('Error calculating storage:', error);
    return { bytes: 0, formatted: '0 Bytes' };
  }
};
