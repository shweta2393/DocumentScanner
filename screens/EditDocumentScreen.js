import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { getDocumentById } from '../services/documentService';

const FieldEditor = ({ label, value, onChange, multiline = false, placeholder = '' }) => (
  <View style={styles.fieldEditor}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
      value={value || ''}
      onChangeText={onChange}
      placeholder={placeholder || `Enter ${label.toLowerCase()}`}
      multiline={multiline}
      numberOfLines={multiline ? 4 : 1}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  </View>
);

const ArrayItemEditor = ({ items, onChange, itemLabel = 'Item' }) => {
  const [localItems, setLocalItems] = useState(items || []);

  useEffect(() => {
    setLocalItems(items || []);
  }, [items]);

  const updateItem = (index, field, value) => {
    const updated = [...localItems];
    if (!updated[index]) updated[index] = {};
    updated[index][field] = value;
    setLocalItems(updated);
    onChange(updated);
  };

  const addItem = () => {
    const updated = [...localItems, {}];
    setLocalItems(updated);
    onChange(updated);
  };

  const removeItem = (index) => {
    const updated = localItems.filter((_, i) => i !== index);
    setLocalItems(updated);
    onChange(updated);
  };

  return (
    <View style={styles.arrayEditor}>
      <View style={styles.arrayHeader}>
        <Text style={styles.arrayTitle}>{itemLabel}s</Text>
        <TouchableOpacity onPress={addItem} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>
      {localItems.map((item, index) => (
        <View key={index} style={styles.arrayItem}>
          <View style={styles.arrayItemHeader}>
            <Text style={styles.arrayItemIndex}>{itemLabel} {index + 1}</Text>
            <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeButton}>
              <Text style={styles.removeButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
          {Object.keys(item).map((key) => (
            <FieldEditor
              key={key}
              label={key.charAt(0).toUpperCase() + key.slice(1)}
              value={item[key]}
              onChange={(val) => updateItem(index, key, val)}
            />
          ))}
          {/* Add new field to item */}
          <View style={styles.addFieldRow}>
            <TextInput
              style={styles.newFieldInput}
              placeholder="Field name"
              onSubmitEditing={(e) => {
                const fieldName = e.nativeEvent.text.trim();
                if (fieldName) updateItem(index, fieldName, '');
              }}
            />
          </View>
        </View>
      ))}
      {localItems.length === 0 && (
        <TouchableOpacity onPress={addItem} style={styles.emptyArrayButton}>
          <Text style={styles.emptyArrayText}>+ Add first {itemLabel.toLowerCase()}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function EditDocumentScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { imageUri: paramImageUri, extraction: paramExtraction, source, documentId } = route.params || {};
  
  const [editedExtraction, setEditedExtraction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [documentType, setDocumentType] = useState(paramExtraction?.documentType || 'other');

  // When editing an existing document, load latest so we show current content (and preserve Edited badge after save)
  useFocusEffect(
    useCallback(() => {
      if (!documentId) {
        if (paramExtraction) {
          setEditedExtraction(JSON.parse(JSON.stringify(paramExtraction)));
          setDocumentType(paramExtraction.documentType || 'other');
        }
        return;
      }
      let cancelled = false;
      getDocumentById(documentId).then((doc) => {
        if (cancelled || !doc) return;
        const ext = doc.extraction || paramExtraction;
        if (ext) {
          setEditedExtraction(JSON.parse(JSON.stringify(ext)));
          setDocumentType(ext.documentType || 'other');
        }
      });
      return () => { cancelled = true; };
    }, [documentId, paramExtraction])
  );

  // Initial load when no documentId (e.g. new scan from Preview)
  useEffect(() => {
    if (!documentId && paramExtraction && !editedExtraction) {
      setEditedExtraction(JSON.parse(JSON.stringify(paramExtraction)));
      setDocumentType(paramExtraction.documentType || 'other');
    }
  }, [documentId, paramExtraction]);

  const updateStructuredData = (field, value) => {
    setEditedExtraction((prev) => ({
      ...prev,
      structuredData: {
        ...prev.structuredData,
        [field]: value,
      },
    }));
  };

  const updateArrayField = (field, items) => {
    setEditedExtraction((prev) => ({
      ...prev,
      structuredData: {
        ...prev.structuredData,
        [field]: items,
      },
    }));
  };

  const handleSave = async () => {
    if (!editedExtraction) return;
    setSaving(true);
    try {
      const { updateDocumentExtraction } = await import('../services/documentService');
      
      if (documentId) {
        // Updating existing document - go back to where we came from (History or Preview)
        await updateDocumentExtraction(documentId, editedExtraction);
        Alert.alert('Saved', 'Document updated successfully.');
        // Small delay to ensure AsyncStorage persists
        await new Promise(resolve => setTimeout(resolve, 100));
        // Go back to previous screen (History if came from History, Preview if came from Preview)
        navigation.goBack();
        return;
      } else {
        // New document - save it
        const { saveDocumentWithExtraction } = await import('../services/documentService');
        await saveDocumentWithExtraction(paramImageUri, editedExtraction, source || 'gallery');
        Alert.alert('Saved', 'Document and edited data have been saved.');
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      navigation.goBack();
    } catch (err) {
      console.error('Save error:', err);
      Alert.alert('Error', err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Cancel = leave without saving. No changes to the document or edit badge.
    navigation.goBack();
  };

  if (!editedExtraction) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4F46E5" style={styles.loader} />
        <Text style={styles.loadingText}>Loading editor...</Text>
      </View>
    );
  }

  const structuredData = editedExtraction.structuredData || {};
  const isStructured = documentType !== 'other' && Object.keys(structuredData).length > 0;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Document</Text>
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Document Type Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Document Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeSelector}>
            {['passport', 'id_card', 'receipt', 'invoice', 'letter', 'form', 'other'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeChip,
                  documentType === type && styles.typeChipActive,
                ]}
                onPress={() => {
                  setDocumentType(type);
                  setEditedExtraction((prev) => ({ ...prev, documentType: type }));
                }}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    documentType === type && styles.typeChipTextActive,
                  ]}
                >
                  {type.replace('_', ' ').toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Structured Data Editor */}
        {isStructured ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Document Fields</Text>
            
            {/* Passport fields */}
            {documentType === 'passport' && (
              <>
                <FieldEditor label="Full Name" value={structuredData.fullName} onChange={(v) => updateStructuredData('fullName', v)} />
                <FieldEditor label="Date of Birth" value={structuredData.dateOfBirth} onChange={(v) => updateStructuredData('dateOfBirth', v)} />
                <FieldEditor label="Place of Birth" value={structuredData.placeOfBirth} onChange={(v) => updateStructuredData('placeOfBirth', v)} />
                <FieldEditor label="Passport Number" value={structuredData.passportNumber} onChange={(v) => updateStructuredData('passportNumber', v)} />
                <FieldEditor label="Nationality" value={structuredData.nationality} onChange={(v) => updateStructuredData('nationality', v)} />
                <FieldEditor label="Gender" value={structuredData.gender} onChange={(v) => updateStructuredData('gender', v)} />
                <FieldEditor label="Issue Date" value={structuredData.issueDate} onChange={(v) => updateStructuredData('issueDate', v)} />
                <FieldEditor label="Expiry Date" value={structuredData.expiryDate} onChange={(v) => updateStructuredData('expiryDate', v)} />
                <FieldEditor label="Issuing Authority" value={structuredData.issuingAuthority} onChange={(v) => updateStructuredData('issuingAuthority', v)} />
                <FieldEditor label="MRZ Line 1" value={structuredData.mrzLine1} onChange={(v) => updateStructuredData('mrzLine1', v)} />
                <FieldEditor label="MRZ Line 2" value={structuredData.mrzLine2} onChange={(v) => updateStructuredData('mrzLine2', v)} />
              </>
            )}

            {/* ID Card fields */}
            {documentType === 'id_card' && (
              <>
                <FieldEditor label="Full Name" value={structuredData.fullName} onChange={(v) => updateStructuredData('fullName', v)} />
                <FieldEditor label="ID Number" value={structuredData.idNumber} onChange={(v) => updateStructuredData('idNumber', v)} />
                <FieldEditor label="Date of Birth" value={structuredData.dateOfBirth} onChange={(v) => updateStructuredData('dateOfBirth', v)} />
                <FieldEditor label="Nationality" value={structuredData.nationality} onChange={(v) => updateStructuredData('nationality', v)} />
                <FieldEditor label="Address" value={structuredData.address} onChange={(v) => updateStructuredData('address', v)} multiline />
                <FieldEditor label="Issue Date" value={structuredData.issueDate} onChange={(v) => updateStructuredData('issueDate', v)} />
                <FieldEditor label="Expiry Date" value={structuredData.expiryDate} onChange={(v) => updateStructuredData('expiryDate', v)} />
                <FieldEditor label="Issuing Authority" value={structuredData.issuingAuthority} onChange={(v) => updateStructuredData('issuingAuthority', v)} />
              </>
            )}

            {/* Receipt fields */}
            {documentType === 'receipt' && (
              <>
                <FieldEditor label="Vendor Name" value={structuredData.vendorName} onChange={(v) => updateStructuredData('vendorName', v)} />
                <FieldEditor label="Vendor Address" value={structuredData.vendorAddress} onChange={(v) => updateStructuredData('vendorAddress', v)} multiline />
                <FieldEditor label="Date" value={structuredData.date} onChange={(v) => updateStructuredData('date', v)} />
                <FieldEditor label="Time" value={structuredData.time} onChange={(v) => updateStructuredData('time', v)} />
                <ArrayItemEditor
                  items={structuredData.items}
                  onChange={(items) => updateArrayField('items', items)}
                  itemLabel="Item"
                />
                <FieldEditor label="Subtotal" value={structuredData.subtotal} onChange={(v) => updateStructuredData('subtotal', v)} />
                <FieldEditor label="Tax" value={structuredData.tax} onChange={(v) => updateStructuredData('tax', v)} />
                <FieldEditor label="Total" value={structuredData.total} onChange={(v) => updateStructuredData('total', v)} />
                <FieldEditor label="Payment Method" value={structuredData.paymentMethod} onChange={(v) => updateStructuredData('paymentMethod', v)} />
                <FieldEditor label="Currency" value={structuredData.currency} onChange={(v) => updateStructuredData('currency', v)} />
              </>
            )}

            {/* Invoice fields */}
            {documentType === 'invoice' && (
              <>
                <FieldEditor label="Invoice Number" value={structuredData.invoiceNumber} onChange={(v) => updateStructuredData('invoiceNumber', v)} />
                <FieldEditor label="Issue Date" value={structuredData.issueDate} onChange={(v) => updateStructuredData('issueDate', v)} />
                <FieldEditor label="Due Date" value={structuredData.dueDate} onChange={(v) => updateStructuredData('dueDate', v)} />
                <FieldEditor label="Seller Name" value={structuredData.seller?.name || structuredData.seller} onChange={(v) => updateStructuredData('seller', typeof structuredData.seller === 'object' ? { ...structuredData.seller, name: v } : v)} />
                <FieldEditor label="Seller Address" value={structuredData.seller?.address || ''} onChange={(v) => updateStructuredData('seller', typeof structuredData.seller === 'object' ? { ...structuredData.seller, address: v } : { name: structuredData.seller, address: v })} multiline />
                <FieldEditor label="Buyer Name" value={structuredData.buyer?.name || structuredData.buyer} onChange={(v) => updateStructuredData('buyer', typeof structuredData.buyer === 'object' ? { ...structuredData.buyer, name: v } : v)} />
                <FieldEditor label="Buyer Address" value={structuredData.buyer?.address || ''} onChange={(v) => updateStructuredData('buyer', typeof structuredData.buyer === 'object' ? { ...structuredData.buyer, address: v } : { name: structuredData.buyer, address: v })} multiline />
                <ArrayItemEditor
                  items={structuredData.items}
                  onChange={(items) => updateArrayField('items', items)}
                  itemLabel="Line Item"
                />
                <FieldEditor label="Subtotal" value={structuredData.subtotal} onChange={(v) => updateStructuredData('subtotal', v)} />
                <FieldEditor label="Tax" value={structuredData.tax} onChange={(v) => updateStructuredData('tax', v)} />
                <FieldEditor label="Total" value={structuredData.total} onChange={(v) => updateStructuredData('total', v)} />
                <FieldEditor label="Currency" value={structuredData.currency} onChange={(v) => updateStructuredData('currency', v)} />
                <FieldEditor label="Payment Terms" value={structuredData.paymentTerms} onChange={(v) => updateStructuredData('paymentTerms', v)} />
              </>
            )}

            {/* Letter fields */}
            {documentType === 'letter' && (
              <>
                <FieldEditor label="Date" value={structuredData.date} onChange={(v) => updateStructuredData('date', v)} />
                <FieldEditor label="From" value={structuredData.sender} onChange={(v) => updateStructuredData('sender', v)} />
                <FieldEditor label="To" value={structuredData.recipient} onChange={(v) => updateStructuredData('recipient', v)} />
                <FieldEditor label="Subject" value={structuredData.subject} onChange={(v) => updateStructuredData('subject', v)} />
                <FieldEditor label="Body" value={structuredData.body} onChange={(v) => updateStructuredData('body', v)} multiline />
                <FieldEditor label="Signature Block" value={structuredData.signatureBlock} onChange={(v) => updateStructuredData('signatureBlock', v)} />
              </>
            )}

            {/* Form fields */}
            {documentType === 'form' && (
              <>
                <FieldEditor label="Form Title" value={structuredData.formTitle} onChange={(v) => updateStructuredData('formTitle', v)} />
                <ArrayItemEditor
                  items={structuredData.fields}
                  onChange={(fields) => updateArrayField('fields', fields)}
                  itemLabel="Field"
                />
              </>
            )}

            {/* Generic structured fields (for other types or custom) */}
            {documentType !== 'passport' &&
              documentType !== 'id_card' &&
              documentType !== 'receipt' &&
              documentType !== 'invoice' &&
              documentType !== 'letter' &&
              documentType !== 'form' && (
                <>
                  {Object.keys(structuredData).map((key) => {
                    const value = structuredData[key];
                    if (Array.isArray(value)) {
                      return (
                        <ArrayItemEditor
                          key={key}
                          items={value}
                          onChange={(items) => updateArrayField(key, items)}
                          itemLabel={key}
                        />
                      );
                    }
                    return (
                      <FieldEditor
                        key={key}
                        label={key.charAt(0).toUpperCase() + key.slice(1)}
                        value={typeof value === 'object' ? JSON.stringify(value) : String(value || '')}
                        onChange={(v) => {
                          try {
                            const parsed = JSON.parse(v);
                            updateStructuredData(key, parsed);
                          } catch {
                            updateStructuredData(key, v);
                          }
                        }}
                        multiline={typeof value === 'string' && value.length > 50}
                      />
                    );
                  })}
                </>
              )}
          </View>
        ) : null}

        {/* Raw Text Editor (for Tesseract fallback or other documents) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Extracted Text</Text>
            {documentType === 'other' && !isStructured && (
              <View style={styles.fallbackBadge}>
                <Text style={styles.fallbackBadgeText}>Free OCR</Text>
              </View>
            )}
          </View>
          {documentType === 'other' && !isStructured && (
            <Text style={styles.fallbackNote}>
              This text was extracted using free OCR (OpenAI quota exceeded). You can edit it here or change the document type above to add structured fields.
            </Text>
          )}
          <TextInput
            style={styles.rawTextEditor}
            value={editedExtraction.extractedText || ''}
            onChangeText={(text) =>
              setEditedExtraction((prev) => ({ ...prev, extractedText: text }))
            }
            placeholder="No text extracted..."
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Summary Editor */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <TextInput
            style={styles.summaryEditor}
            value={editedExtraction.formattedSummary || ''}
            onChangeText={(text) =>
              setEditedExtraction((prev) => ({ ...prev, formattedSummary: text }))
            }
            placeholder="Document summary..."
            multiline
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  loader: {
    marginTop: 100,
  },
  loadingText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#6B7280',
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    marginTop: 20,
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  fallbackBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
  },
  fallbackBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
  },
  fallbackNote: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  typeSelector: {
    marginTop: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  typeChipActive: {
    backgroundColor: '#4F46E5',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  typeChipTextActive: {
    color: '#fff',
  },
  fieldEditor: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
    minHeight: 44,
  },
  fieldInputMultiline: {
    minHeight: 100,
    paddingTop: 12,
  },
  arrayEditor: {
    marginTop: 8,
  },
  arrayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  arrayTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#4F46E5',
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  arrayItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
  },
  arrayItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  arrayItemIndex: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  removeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeButtonText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  addFieldRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  newFieldInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    backgroundColor: '#fff',
  },
  emptyArrayButton: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyArrayText: {
    fontSize: 14,
    color: '#6B7280',
  },
  rawTextEditor: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
    minHeight: 200,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
  },
  summaryEditor: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
    minHeight: 100,
  },
});
