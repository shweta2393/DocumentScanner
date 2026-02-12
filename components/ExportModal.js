import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { EXPORT_FORMATS, exportDocument } from '../services/exportService';

export default function ExportModal({ visible, onClose, document }) {
  const [exporting, setExporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState(null);

  const handleExport = async (formatId) => {
    if (!document) return;
    setExporting(true);
    setExportingFormat(formatId);
    try {
      const message = await exportDocument(document, formatId);
      Alert.alert('Export complete', message);
      onClose();
    } catch (err) {
      console.error('Export error:', err);
      Alert.alert('Export failed', err.message || 'Could not export document.');
    } finally {
      setExporting(false);
      setExportingFormat(null);
    }
  };

  if (!document) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>Export document</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Choose export format</Text>
          <ScrollView style={styles.formatsList} showsVerticalScrollIndicator={false}>
            {EXPORT_FORMATS.map((format) => (
              <TouchableOpacity
                key={format.id}
                style={[
                  styles.formatOption,
                  exporting && styles.formatOptionDisabled,
                ]}
                onPress={() => handleExport(format.id)}
                disabled={exporting}
              >
                <Text style={styles.formatLabel}>{format.label}</Text>
                {exportingFormat === format.id ? (
                  <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                  <Text style={styles.formatExt}>.{format.ext}</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 20,
    color: '#6B7280',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  formatsList: {
    padding: 12,
    maxHeight: 320,
  },
  formatOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 4,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  formatOptionDisabled: {
    opacity: 0.7,
  },
  formatLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  formatExt: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
});
