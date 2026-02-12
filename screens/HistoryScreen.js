import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  getAllDocuments,
  lockDocuments,
  unlockDocuments,
  verifyDocumentPin,
} from '../services/documentService';
import ExportModal from '../components/ExportModal';
import PinModal from '../components/PinModal';

export default function HistoryScreen() {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportDocument, setExportDocument] = useState(null);
  // Selection mode for Lock/Unlock
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  // PIN modal: 'set' (lock) | 'enter' (open/export/edit/unlock)
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinModalMode, setPinModalMode] = useState('enter');
  const [pinModalTitle, setPinModalTitle] = useState('Enter PIN');
  const [pinError, setPinError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);

  const loadHistory = async () => {
    try {
      const docs = await getAllDocuments();
      setHistoryItems(docs);
    } catch (error) {
      console.error('Error loading history:', error);
      setHistoryItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadHistory();
    }, [])
  );

  const filters = ['All', 'PDF', 'Image', 'Recent'];

  const getFileIcon = (type) => {
    return type === 'PDF' ? '📄' : '🖼️';
  };

  const getFileTypeColor = (type) => {
    return type === 'PDF' ? '#EF4444' : '#3B82F6';
  };

  // Filter by search and type
  const filteredItems = historyItems.filter((item) => {
    const matchesSearch = !searchQuery.trim() ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      selectedFilter === 'All' ||
      (selectedFilter === 'Image' && item.type === 'Image') ||
      (selectedFilter === 'PDF' && item.type === 'PDF') ||
      (selectedFilter === 'Recent' && historyItems.indexOf(item) < 10);
    return matchesSearch && matchesFilter;
  });

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedLockedCount = filteredItems.filter(
    (item) => selectedIds.has(item.id) && item.locked
  ).length;
  const selectedUnlockedCount = filteredItems.filter(
    (item) => selectedIds.has(item.id) && !item.locked
  ).length;

  const handlePinSubmit = async (pin) => {
    setPinError('');
    try {
      if (pendingAction?.type === 'lock') {
        const ok = await lockDocuments(Array.from(pendingAction.documentIds), pin);
        if (ok) {
          setPinModalVisible(false);
          setPendingAction(null);
          setSelectionMode(false);
          setSelectedIds(new Set());
          loadHistory();
        } else {
          setPinError('Failed to lock documents');
        }
        return;
      }
      if (pendingAction?.type === 'unlock') {
        const ok = await unlockDocuments(Array.from(pendingAction.documentIds), pin);
        if (ok) {
          setPinModalVisible(false);
          setPendingAction(null);
          setSelectionMode(false);
          setSelectedIds(new Set());
          loadHistory();
        } else {
          setPinError('Incorrect PIN');
        }
        return;
      }
      if (pendingAction?.type === 'open' || pendingAction?.type === 'export' || pendingAction?.type === 'edit') {
        const doc = pendingAction.document;
        const valid = await verifyDocumentPin(doc, pin);
        if (!valid) {
          setPinError('Incorrect PIN');
          return;
        }
        setPinModalVisible(false);
        const rootNav = navigation?.getParent?.() || navigation;
        if (pendingAction.type === 'open' && rootNav?.navigate) {
          rootNav.navigate('Preview', {
            imageUri: doc.uri || doc.originalUri,
            extraction: doc.extraction || null,
            source: doc.source || 'gallery',
            documentId: doc.id,
            document: doc,
          });
        } else if (pendingAction.type === 'export') {
          setExportDocument(doc);
          setExportModalVisible(true);
        } else if (pendingAction.type === 'edit' && rootNav?.navigate) {
          rootNav.navigate('EditDocument', {
            imageUri: doc.uri || doc.originalUri,
            extraction: doc.extraction || { documentType: 'other', extractedText: '', structuredData: {}, formattedSummary: '' },
            source: doc.source || 'gallery',
            documentId: doc.id,
          });
        }
        setPendingAction(null);
      }
    } catch (e) {
      setPinError(e?.message || 'Something went wrong');
    }
  };

  const openLockedDoc = (item, action) => {
    setPendingAction({ type: action, document: item });
    setPinModalMode('enter');
    setPinModalTitle('Enter PIN to open');
    setPinError('');
    setPinModalVisible(true);
  };

  const startLock = () => {
    const ids = Array.from(selectedIds).filter((id) => {
      const doc = historyItems.find((d) => d.id === id);
      return doc && !doc.locked;
    });
    if (ids.length === 0) {
      Alert.alert('No documents selected', 'Select unlocked documents to lock.');
      return;
    }
    setPendingAction({ type: 'lock', documentIds: ids });
    setPinModalMode('set');
    setPinModalTitle('Set PIN');
    setPinError('');
    setPinModalVisible(true);
  };

  const startUnlock = () => {
    const ids = Array.from(selectedIds).filter((id) => {
      const doc = historyItems.find((d) => d.id === id);
      return doc?.locked;
    });
    if (ids.length === 0) {
      Alert.alert('No locked documents selected', 'Select locked documents to unlock.');
      return;
    }
    setPendingAction({ type: 'unlock', documentIds: ids });
    setPinModalMode('enter');
    setPinModalTitle('Enter PIN to unlock');
    setPinError('');
    setPinModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>History</Text>
            {!selectionMode ? (
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => { setSelectionMode(true); setSelectedIds(new Set()); }}
              >
                <Text style={styles.selectButtonText}>Select</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                >
                  <Text style={styles.headerActionText}>Cancel</Text>
                </TouchableOpacity>
                {selectedUnlockedCount > 0 && (
                  <TouchableOpacity style={styles.lockButton} onPress={startLock}>
                    <Text style={styles.lockButtonText}>🔒 Lock</Text>
                  </TouchableOpacity>
                )}
                {selectedLockedCount > 0 && (
                  <TouchableOpacity style={styles.unlockButton} onPress={startUnlock}>
                    <Text style={styles.unlockButtonText}>🔓 Unlock</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          <Text style={styles.headerSubtitle}>
            {selectionMode && selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : loading ? 'Loading...' : `${historyItems.length} documents scanned`}
          </Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search documents..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter Chips */}
        <View style={styles.filtersContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersScrollContent}
          >
            {filters.map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterChip,
                  selectedFilter === filter && styles.filterChipActive,
                ]}
                onPress={() => setSelectedFilter(filter)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedFilter === filter && styles.filterChipTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* History List */}
        <View style={styles.historyList}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4F46E5" />
              <Text style={styles.loadingText}>Loading history...</Text>
            </View>
          ) : (
            filteredItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.historyItem, item.locked && styles.historyItemLocked]}
                activeOpacity={0.7}
                onPress={() => {
                  if (selectionMode) {
                    toggleSelect(item.id);
                    return;
                  }
                  if (item.locked) {
                    openLockedDoc(item, 'open');
                    return;
                  }
                  const rootNav = navigation?.getParent?.() || navigation;
                  if (rootNav?.navigate) {
                    rootNav.navigate('Preview', {
                      imageUri: item.uri || item.originalUri,
                      extraction: item.extraction || null,
                      source: item.source || 'gallery',
                      documentId: item.id,
                      document: item,
                    });
                  }
                }}
              >
                {selectionMode && (
                  <View style={styles.checkboxWrap}>
                    <View style={[styles.checkbox, selectedIds.has(item.id) && styles.checkboxChecked]}>
                      {selectedIds.has(item.id) ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                  </View>
                )}
                <View style={styles.historyItemLeft}>
                  <View
                    style={[
                      styles.fileIconContainer,
                      { backgroundColor: `${getFileTypeColor(item.type)}15` },
                    ]}
                  >
                    <Text style={styles.fileIcon}>{item.locked ? '🔒' : getFileIcon(item.type)}</Text>
                  </View>
                  <View style={styles.historyItemInfo}>
                    <Text style={styles.historyItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.historyItemMeta}>
                      {item.locked && (
                        <>
                          <Text style={styles.lockedBadge}>Locked</Text>
                          <Text style={styles.historyItemSeparator}>•</Text>
                        </>
                      )}
                      <Text style={styles.historyItemDate}>
                        {item.formattedDate}
                      </Text>
                      <Text style={styles.historyItemSeparator}>•</Text>
                      <Text style={styles.historyItemSize}>
                        {item.formattedSize}
                      </Text>
                      {item.wasEdited === true && (
                        <>
                          <Text style={styles.historyItemSeparator}>•</Text>
                          <Text style={styles.editedBadge}>✏️ Edited</Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.historyItemRight}>
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: getFileTypeColor(item.type) },
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>{item.type}</Text>
                  </View>
                  {!selectionMode && (
                    <View style={styles.historyItemActions}>
                      {!item.locked && (
                        <TouchableOpacity
                          style={styles.actionIconButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            setPendingAction({ type: 'lock', documentIds: [item.id] });
                            setPinModalMode('set');
                            setPinModalTitle('Set PIN to lock this document');
                            setPinError('');
                            setPinModalVisible(true);
                          }}
                        >
                          <Text style={styles.actionIcon}>🔒</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.actionIconButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          if (item.locked) {
                            openLockedDoc(item, 'export');
                            return;
                          }
                          setExportDocument(item);
                          setExportModalVisible(true);
                        }}
                      >
                        <Text style={styles.actionIcon}>📤</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionIconButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          if (item.locked) {
                            openLockedDoc(item, 'edit');
                            return;
                          }
                          const rootNav = navigation?.getParent?.() || navigation;
                          if (rootNav?.navigate) {
                            rootNav.navigate('EditDocument', {
                              imageUri: item.uri || item.originalUri,
                              extraction: item.extraction || {
                                documentType: 'other',
                                extractedText: '',
                                structuredData: {},
                                formattedSummary: '',
                              },
                              source: item.source || 'gallery',
                              documentId: item.id,
                            });
                          }
                        }}
                      >
                        <Text style={styles.actionIcon}>✏️</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <ExportModal
          visible={exportModalVisible}
          onClose={() => {
            setExportModalVisible(false);
            setExportDocument(null);
          }}
          document={exportDocument}
        />

        <PinModal
          visible={pinModalVisible}
          mode={pinModalMode}
          title={pinModalTitle}
          error={pinError}
          onSubmit={handlePinSubmit}
          onClose={() => {
            setPinModalVisible(false);
            setPendingAction(null);
            setPinError('');
          }}
        />

        {/* Empty State (if no results) */}
        {!loading && filteredItems.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📭</Text>
            <Text style={styles.emptyStateText}>
              {historyItems.length === 0
                ? 'No documents found'
                : 'No documents match your search'}
            </Text>
            <Text style={styles.emptyStateSubtext}>
              {historyItems.length === 0
                ? 'Start scanning to see your documents here'
                : 'Try a different search or filter'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  selectButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  headerActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  lockButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  lockButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  unlockButton: {
    backgroundColor: '#10B981',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  unlockButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    padding: 0,
  },
  clearIcon: {
    fontSize: 18,
    color: '#9CA3AF',
    marginLeft: 8,
  },
  filtersContainer: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 16,
  },
  filtersScrollContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  historyList: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  historyItemLocked: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  checkboxWrap: {
    marginRight: 12,
    justifyContent: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  lockedBadge: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  fileIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileIcon: {
    fontSize: 24,
  },
  historyItemInfo: {
    flex: 1,
  },
  historyItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  historyItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyItemDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  historyItemSeparator: {
    fontSize: 12,
    color: '#9CA3AF',
    marginHorizontal: 6,
  },
  historyItemSize: {
    fontSize: 12,
    color: '#6B7280',
  },
  editedBadge: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  historyItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIconButton: {
    padding: 6,
  },
  actionIcon: {
    fontSize: 18,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  moreButton: {
    padding: 4,
  },
  moreIcon: {
    fontSize: 20,
    color: '#9CA3AF',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
