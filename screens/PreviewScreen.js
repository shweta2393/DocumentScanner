import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import ExportModal from '../components/ExportModal';
import { getDocumentById } from '../services/documentService';

const FieldRow = ({ label, value }) => (
  <View style={styles.fieldRow}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue}>{value ?? '—'}</Text>
  </View>
);

const SectionTitle = ({ title }) => (
  <Text style={styles.sectionTitle}>{title}</Text>
);

function PassportView({ data }) {
  const d = data?.structuredData || data || {};
  return (
    <View style={[styles.card, styles.passportCard]}>
      <View style={styles.passportHeader}>
        <Text style={styles.passportTitle}>PASSPORT</Text>
      </View>
      <FieldRow label="Full name" value={d.fullName} />
      <FieldRow label="Date of birth" value={d.dateOfBirth} />
      <FieldRow label="Place of birth" value={d.placeOfBirth} />
      <FieldRow label="Passport number" value={d.passportNumber} />
      <FieldRow label="Nationality" value={d.nationality} />
      <FieldRow label="Gender" value={d.gender} />
      <FieldRow label="Issue date" value={d.issueDate} />
      <FieldRow label="Expiry date" value={d.expiryDate} />
      <FieldRow label="Issuing authority" value={d.issuingAuthority} />
      {(d.mrzLine1 || d.mrzLine2) && (
        <View style={styles.mrzBlock}>
          <Text style={styles.mrzLabel}>MRZ</Text>
          <Text style={styles.mrzText}>{d.mrzLine1}</Text>
          <Text style={styles.mrzText}>{d.mrzLine2}</Text>
        </View>
      )}
    </View>
  );
}

function IdCardView({ data }) {
  const d = data?.structuredData || data || {};
  return (
    <View style={[styles.card, styles.idCard]}>
      <SectionTitle title="ID CARD" />
      <FieldRow label="Full name" value={d.fullName} />
      <FieldRow label="ID number" value={d.idNumber} />
      <FieldRow label="Date of birth" value={d.dateOfBirth} />
      <FieldRow label="Nationality" value={d.nationality} />
      <FieldRow label="Address" value={d.address} />
      <FieldRow label="Issue / Expiry" value={d.issueDate && d.expiryDate ? `${d.issueDate} – ${d.expiryDate}` : d.issueDate || d.expiryDate} />
      <FieldRow label="Issuing authority" value={d.issuingAuthority} />
    </View>
  );
}

function ReceiptView({ data }) {
  const d = data?.structuredData || data || {};
  const items = d.items || [];
  return (
    <View style={[styles.card, styles.receiptCard]}>
      <SectionTitle title="RECEIPT" />
      <FieldRow label="Vendor" value={d.vendorName} />
      <FieldRow label="Address" value={d.vendorAddress} />
      <FieldRow label="Date / Time" value={d.date && d.time ? `${d.date} ${d.time}` : d.date || d.time} />
      {items.length > 0 && (
        <View style={styles.itemsSection}>
          <Text style={styles.itemsHeading}>Items</Text>
          {items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemQty}>{item.quantity} × {item.unitPrice}</Text>
              <Text style={styles.itemTotal}>{item.total}</Text>
            </View>
          ))}
        </View>
      )}
      <FieldRow label="Subtotal" value={d.subtotal} />
      <FieldRow label="Tax" value={d.tax} />
      <FieldRow label="Total" value={d.total} />
      <FieldRow label="Payment" value={d.paymentMethod} />
      <FieldRow label="Currency" value={d.currency} />
    </View>
  );
}

function InvoiceView({ data }) {
  const d = data?.structuredData || data || {};
  const items = d.items || [];
  return (
    <View style={[styles.card, styles.invoiceCard]}>
      <SectionTitle title="INVOICE" />
      <FieldRow label="Invoice number" value={d.invoiceNumber} />
      <FieldRow label="Issue date" value={d.issueDate} />
      <FieldRow label="Due date" value={d.dueDate} />
      {d.seller && (typeof d.seller === 'object' ? (
        <FieldRow label="Seller" value={[d.seller.name, d.seller.address].filter(Boolean).join(', ')} />
      ) : <FieldRow label="Seller" value={d.seller} />)}
      {d.buyer && (typeof d.buyer === 'object' ? (
        <FieldRow label="Buyer" value={[d.buyer.name, d.buyer.address].filter(Boolean).join(', ')} />
      ) : <FieldRow label="Buyer" value={d.buyer} />)}
      {items.length > 0 && (
        <View style={styles.itemsSection}>
          <Text style={styles.itemsHeading}>Line items</Text>
          {items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.description || item.name}</Text>
              <Text style={styles.itemTotal}>{item.amount || item.total}</Text>
            </View>
          ))}
        </View>
      )}
      <FieldRow label="Subtotal" value={d.subtotal} />
      <FieldRow label="Tax" value={d.tax} />
      <FieldRow label="Total" value={d.total} />
      <FieldRow label="Currency" value={d.currency} />
      <FieldRow label="Payment terms" value={d.paymentTerms} />
    </View>
  );
}

function LetterView({ data }) {
  const d = data?.structuredData || data || {};
  return (
    <View style={[styles.card, styles.letterCard]}>
      <SectionTitle title="LETTER / CONTRACT" />
      <FieldRow label="Date" value={d.date} />
      <FieldRow label="From" value={d.sender} />
      <FieldRow label="To" value={d.recipient} />
      <FieldRow label="Subject" value={d.subject} />
      {d.body && (
        <View style={styles.bodyBlock}>
          <Text style={styles.fieldLabel}>Body</Text>
          <Text style={styles.bodyText}>{d.body}</Text>
        </View>
      )}
      <FieldRow label="Signature" value={d.signatureBlock} />
    </View>
  );
}

function FormView({ data }) {
  const d = data?.structuredData || data || {};
  const fields = d.fields || [];
  return (
    <View style={[styles.card, styles.formCard]}>
      <SectionTitle title={d.formTitle || 'FORM'} />
      {fields.length > 0 ? (
        fields.map((f, i) => (
          <FieldRow key={i} label={f.label} value={f.value} />
        ))
      ) : (
        <Text style={styles.rawText}>{d.rawText || data?.extractedText || 'No structured fields extracted.'}</Text>
      )}
    </View>
  );
}

function OtherView({ data }) {
  const text = data?.extractedText || data?.structuredData?.rawText || '';
  return (
    <View style={[styles.card, styles.otherCard]}>
      <SectionTitle title="EXTRACTED TEXT" />
      <Text style={styles.rawText}>{text || 'No text could be extracted.'}</Text>
    </View>
  );
}

function DocumentPreview({ extraction }) {
  const type = extraction?.documentType || 'other';
  const data = extraction;

  switch (type) {
    case 'passport':
      return <PassportView data={data} />;
    case 'id_card':
      return <IdCardView data={data} />;
    case 'receipt':
      return <ReceiptView data={data} />;
    case 'invoice':
      return <InvoiceView data={data} />;
    case 'letter':
      return <LetterView data={data} />;
    case 'form':
      return <FormView data={data} />;
    default:
      return <OtherView data={data} />;
  }
}

export default function PreviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { imageUri: paramImageUri, extraction: paramExtraction, source, document: paramDocument, documentId } = route.params || {};
  const [saving, setSaving] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);

  // When opened from History (documentId), load latest document so we show updated content and edited state
  useFocusEffect(
    useCallback(() => {
      if (!documentId) {
        setCurrentDoc(null);
        return;
      }
      let cancelled = false;
      getDocumentById(documentId).then((doc) => {
        if (!cancelled && doc) setCurrentDoc(doc);
      });
      return () => { cancelled = true; };
    }, [documentId])
  );

  const imageUri = currentDoc ? (currentDoc.uri || currentDoc.originalUri) : paramImageUri;
  const extraction = currentDoc?.extraction ?? paramExtraction ?? null;
  const document = currentDoc ?? paramDocument;

  // For export: use full document when from History, else build minimal doc
  const documentForExport = document || (imageUri ? {
    id: documentId,
    name: `document_${Date.now()}.jpg`,
    uri: imageUri,
    originalUri: imageUri,
    extraction: extraction || {},
  } : null);

  const handleSave = async () => {
    if (!imageUri) return;
    setSaving(true);
    try {
      const docService = await import('../services/documentService');
      if (documentId) {
        // Updating existing document (opened from History) – do not create a new file
        await docService.updateDocumentExtraction(documentId, extraction);
        Alert.alert('Saved', 'Document updated successfully.');
      } else {
        await docService.saveDocumentWithExtraction(imageUri, extraction, source || 'gallery');
        Alert.alert('Saved', 'Document and extracted data have been saved.');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      navigation.goBack();
    } catch (err) {
      console.error('Save error:', err);
      Alert.alert('Error', err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    navigation.navigate('EditDocument', {
      imageUri,
      extraction: documentForExport?.extraction ?? extraction,
      source,
      documentId: documentId || null,
    });
  };

  const handleExport = () => {
    setExportModalVisible(true);
  };

  const handleDiscard = () => {
    Alert.alert(
      'Discard',
      'Leave without saving this scan?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  };

  const tagLabel = (extraction?.documentType || 'other').replace('_', ' ').toUpperCase();
  const tagColor = extraction?.documentType === 'passport' ? '#0d9488' :
    extraction?.documentType === 'receipt' ? '#059669' :
    extraction?.documentType === 'invoice' ? '#4f46e5' : '#6b7280';

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleDiscard} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>
        <View style={[styles.tag, { backgroundColor: tagColor }]}>
          <Text style={styles.tagText}>{tagLabel}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleExport} style={styles.exportButton}>
            <Text style={styles.exportButtonText}>Export</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleEdit} style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.headerButton, styles.saveButton]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {imageUri && (
          <View style={styles.imageSection}>
            <Text style={styles.imageLabel}>Scanned image</Text>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
          </View>
        )}
        {extraction?.formattedSummary ? (
          <View style={styles.summarySection}>
            <Text style={styles.summaryText}>{extraction.formattedSummary}</Text>
            {extraction.language && (
              <Text style={styles.languageTag}>Language: {extraction.language}</Text>
            )}
          </View>
        ) : null}
        <DocumentPreview extraction={extraction} />
      </ScrollView>

      <ExportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        document={documentForExport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerButton: {
    padding: 8,
    minWidth: 72,
  },
  headerButtonText: {
    fontSize: 16,
    color: '#6B7280',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exportButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  saveButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  imageSection: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 8,
  },
  imageLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 8,
  },
  summarySection: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
  },
  summaryText: {
    fontSize: 14,
    color: '#3730A3',
    marginBottom: 4,
  },
  languageTag: {
    fontSize: 12,
    color: '#6366F1',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  passportCard: { borderLeftWidth: 4, borderLeftColor: '#0d9488' },
  idCard: { borderLeftWidth: 4, borderLeftColor: '#3b82f6' },
  receiptCard: { borderLeftWidth: 4, borderLeftColor: '#059669' },
  invoiceCard: { borderLeftWidth: 4, borderLeftColor: '#4f46e5' },
  letterCard: { borderLeftWidth: 4, borderLeftColor: '#7c3aed' },
  formCard: { borderLeftWidth: 4, borderLeftColor: '#ea580c' },
  otherCard: { borderLeftWidth: 4, borderLeftColor: '#6b7280' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#6B7280',
    flex: 0.4,
  },
  fieldValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    flex: 0.6,
    textAlign: 'right',
  },
  mrzBlock: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  mrzLabel: { fontSize: 10, color: '#6B7280', marginBottom: 4 },
  mrzText: { fontFamily: 'monospace', fontSize: 11, color: '#111827' },
  itemsSection: { marginVertical: 12 },
  itemsHeading: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemName: { fontSize: 13, color: '#111827', flex: 1 },
  itemQty: { fontSize: 12, color: '#6B7280', marginRight: 8 },
  itemTotal: { fontSize: 13, fontWeight: '600', color: '#111827' },
  bodyBlock: { marginTop: 8 },
  bodyText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  rawText: { fontSize: 13, color: '#374151', lineHeight: 22 },
});
