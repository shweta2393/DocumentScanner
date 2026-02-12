import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  saveDocument,
  getAllDocuments,
  getDocumentCount,
  getTotalStorageUsed,
} from '../services/documentService';
import { scanDocumentWithAI } from '../services/scanService';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const navigation = useNavigation();
  const [lastImage, setLastImage] = useState(null);
  const [lastSource, setLastSource] = useState('gallery');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [totalScans, setTotalScans] = useState(0);
  const [storageUsed, setStorageUsed] = useState('0 Bytes');
  const [recentScans, setRecentScans] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // Debug: log navigation availability
  useEffect(() => {
    console.log('Navigation available:', !!navigation);
    console.log('Navigation.navigate available:', !!(navigation && navigation.navigate));
  }, [navigation]);

  // Load document stats and recent scans
  const loadDocumentData = async () => {
    try {
      console.log('Loading document data...');
      const count = await getDocumentCount();
      const storage = await getTotalStorageUsed();
      const docs = await getAllDocuments();
      
      console.log('Loaded:', { count, storage: storage.formatted, docsCount: docs.length });
      
      setTotalScans(count);
      setStorageUsed(storage.formatted);
      setRecentScans(docs.slice(0, 2)); // Show 2 most recent
    } catch (error) {
      console.error('Error loading document data:', error);
    }
  };

  // Load data on mount and when screen comes into focus
  useEffect(() => {
    loadDocumentData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadDocumentData();
    }, [])
  );

  const requestCameraPermission = async () => {
    if (Platform.OS === 'web') return { granted: true };
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera permission required',
        'Please allow camera access in Settings to scan documents.'
      );
      return { granted: false };
    }
    return { granted: true };
  };

  const handleSaveImageOnly = async () => {
    if (!lastImage) return;
    setSaveLoading(true);
    try {
      console.log('Saving image:', lastImage);
      const savedDoc = await saveDocument(lastImage, lastSource);
      console.log('Saved document:', savedDoc);
      Alert.alert('Saved', `Image saved as ${savedDoc.name}`);
      // Small delay to ensure AsyncStorage persists before reloading
      await new Promise(resolve => setTimeout(resolve, 200));
      await loadDocumentData();
      setLastImage(null);
    } catch (err) {
      console.error('Save error:', err);
      Alert.alert('Error', err.message || 'Failed to save.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleScanWithAI = async () => {
    console.log('=== Scan with AI clicked ===');
    console.log('lastImage:', lastImage);
    console.log('navigation:', navigation);
    
    if (!lastImage) {
      console.warn('No image available');
      Alert.alert('No image', 'Please upload or capture an image first.');
      return;
    }
    
    // Get root navigator if we're in a nested structure
    const rootNavigation = navigation?.getParent?.() || navigation;
    console.log('rootNavigation:', rootNavigation);
    console.log('rootNavigation.navigate:', rootNavigation?.navigate);
    
    if (!rootNavigation || !rootNavigation.navigate) {
      console.error('Navigation not available:', { navigation, rootNavigation });
      Alert.alert('Error', 'Navigation not available. Please restart the app.');
      return;
    }
    
    setScanLoading(true);
    console.log('Scan loading set to true');
    
    try {
      console.log('=== Starting AI scan ===');
      console.log('Image URI:', lastImage);
      console.log('Image URI type:', typeof lastImage);
      console.log('Image URI starts with:', lastImage?.substring(0, 20));
      
      // Check API key first
      const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
      console.log('API Key present:', !!apiKey);
      console.log('API Key starts with:', apiKey?.substring(0, 10));
      
      const extraction = await scanDocumentWithAI(lastImage);
      console.log('=== Extraction completed ===');
      console.log('Extraction result:', JSON.stringify(extraction, null, 2));
      
      if (!extraction) {
        throw new Error('No extraction result returned');
      }
      
      console.log('=== Navigating to Preview ===');
      console.log('Navigation params:', {
        imageUri: lastImage,
        extraction,
        source: lastSource,
      });
      
      // Navigate to Preview screen
      rootNavigation.navigate('Preview', {
        imageUri: lastImage,
        extraction,
        source: lastSource,
      });
      
      console.log('=== Navigation called ===');
    } catch (err) {
      console.error('=== Scan error occurred ===');
      console.error('Error type:', err?.constructor?.name);
      console.error('Error message:', err?.message);
      console.error('Error stack:', err?.stack);
      console.error('Full error:', err);
      
      let errorMessage = err?.message || 'Could not extract text. Check your API key and connection.';
      let errorTitle = 'Scan failed';
      
      // Customize alert based on error type
      if (errorMessage.includes('Quota Exceeded') || errorMessage.includes('quota') || errorMessage.includes('billing')) {
        errorTitle = 'API Quota Exceeded';
        errorMessage = errorMessage.replace(/\n/g, '\n');
      } else if (errorMessage.includes('Invalid API Key') || errorMessage.includes('API key not set')) {
        errorTitle = 'API Key Error';
      } else if (errorMessage.includes('Rate Limit')) {
        errorTitle = 'Rate Limit Exceeded';
      }
      
      Alert.alert(
        errorTitle,
        errorMessage,
        [
          { text: 'OK', style: 'default' },
          ...(errorMessage.includes('Quota') || errorMessage.includes('billing') 
            ? [{ 
                text: 'Open Billing', 
                onPress: () => {
                  if (Platform.OS === 'web') {
                    window.open('https://platform.openai.com/account/billing', '_blank');
                  }
                }
              }]
            : [])
        ]
      );
    } finally {
      console.log('=== Setting scan loading to false ===');
      setScanLoading(false);
    }
  };

  const requestMediaLibraryPermission = async () => {
    if (Platform.OS === 'web') return { granted: true };
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photo library permission required',
        'Please allow photo library access in Settings to upload documents.'
      );
      return { granted: false };
    }
    return { granted: true };
  };

  const openCamera = async () => {
    const { granted } = await requestCameraPermission();
    if (!granted) return;
    setCameraLoading(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]) {
        setLastImage(result.assets[0].uri);
        setLastSource('camera');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not open camera.');
    } finally {
      setCameraLoading(false);
    }
  };

  const openGallery = async () => {
    const { granted } = await requestMediaLibraryPermission();
    if (!granted) return;
    setGalleryLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]) {
        setLastImage(result.assets[0].uri);
        setLastSource('gallery');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not open photo library.');
    } finally {
      setGalleryLoading(false);
    }
  };

  // Quick action: pick image(s). PDF/Image = single pick (then save or scan; export as PDF later). Batch = multi-pick and save all.
  const handleQuickActionPDF = () => openGallery();
  const handleQuickActionImage = () => openGallery();
  const handleQuickActionBatch = async () => {
    const { granted } = await requestMediaLibraryPermission();
    if (!granted) return;
    setBatchLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) {
        setBatchLoading(false);
        return;
      }
      let saved = 0;
      for (const asset of result.assets) {
        try {
          await saveDocument(asset.uri, 'gallery');
          saved++;
        } catch (e) {
          console.warn('Failed to save image:', e);
        }
      }
      await loadDocumentData();
      Alert.alert('Batch save', saved === result.assets.length ? `${saved} image(s) saved.` : `${saved} of ${result.assets.length} saved.`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not open photo library.');
    } finally {
      setBatchLoading(false);
    }
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
          <View>
            <Text style={styles.greeting}>Hello!</Text>
            <Text style={styles.title}>Document Scanner</Text>
          </View>
        </View>

        {/* Camera & Upload Buttons */}
        <View style={styles.scannerSection}>
          <Text style={styles.scannerSectionTitle}>Scan or upload a document</Text>
          <View style={styles.scannerButtonsRow}>
            <TouchableOpacity
              style={[styles.scannerButton, styles.cameraButton]}
              onPress={openCamera}
              disabled={cameraLoading || galleryLoading}
              activeOpacity={0.8}
            >
              {cameraLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <View style={styles.scannerIconContainer}>
                    <Text style={styles.scannerIcon}>📷</Text>
                  </View>
                  <Text style={styles.scannerButtonText}>Camera</Text>
                  <Text style={styles.scannerButtonSubtext}>Take a photo</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.scannerButton, styles.uploadButton]}
              onPress={openGallery}
              disabled={cameraLoading || galleryLoading}
              activeOpacity={0.8}
            >
              {galleryLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <View style={styles.scannerIconContainer}>
                    <Text style={styles.scannerIcon}>📤</Text>
                  </View>
                  <Text style={styles.scannerButtonText}>Upload</Text>
                  <Text style={styles.scannerButtonSubtext}>Choose from gallery</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {lastImage ? (
            <View style={styles.lastImageContainer}>
              <Text style={styles.lastImageLabel}>Preview — choose an action</Text>
              <Image source={{ uri: lastImage }} style={styles.lastImage} resizeMode="cover" />
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.saveOnlyButton]}
                  onPress={handleSaveImageOnly}
                  disabled={saveLoading || scanLoading}
                >
                  {saveLoading ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                  ) : (
                    <Text style={styles.actionButtonText}>Save image only</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.scanAIButton,
                    (saveLoading || scanLoading) && styles.buttonDisabled,
                  ]}
                  onPress={(e) => {
                    console.log('=== BUTTON CLICKED ===');
                    console.log('Event:', e);
                    console.log('lastImage:', lastImage);
                    console.log('scanLoading:', scanLoading);
                    console.log('saveLoading:', saveLoading);
                    console.log('navigation:', navigation);
                    if (!lastImage) {
                      Alert.alert('No Image', 'Please upload an image first');
                      return;
                    }
                    handleScanWithAI();
                  }}
                  disabled={saveLoading || scanLoading}
                  activeOpacity={0.7}
                >
                  {scanLoading ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.scanAIButtonText}>Scanning...</Text>
                    </>
                  ) : (
                    <Text style={styles.scanAIButtonText}>Scan with AI</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <Text style={styles.quickActionsHint}>Pick from gallery to save or scan; export as PDF/Image from History.</Text>
          <View style={styles.quickActionsContainer}>
            <TouchableOpacity
              style={styles.quickActionCard}
              activeOpacity={0.7}
              onPress={handleQuickActionPDF}
              disabled={galleryLoading}
            >
              <View style={styles.quickActionIcon}>
                <Text style={styles.quickActionEmoji}>📄</Text>
              </View>
              <Text style={styles.quickActionText}>PDF</Text>
              <Text style={styles.quickActionSubtext}>Pick doc</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              activeOpacity={0.7}
              onPress={handleQuickActionImage}
              disabled={galleryLoading}
            >
              <View style={styles.quickActionIcon}>
                <Text style={styles.quickActionEmoji}>🖼️</Text>
              </View>
              <Text style={styles.quickActionText}>Image</Text>
              <Text style={styles.quickActionSubtext}>Pick image</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              activeOpacity={0.7}
              onPress={handleQuickActionBatch}
              disabled={batchLoading}
            >
              <View style={styles.quickActionIcon}>
                {batchLoading ? <ActivityIndicator size="small" color="#4F46E5" /> : <Text style={styles.quickActionEmoji}>📋</Text>}
              </View>
              <Text style={styles.quickActionText}>Batch</Text>
              <Text style={styles.quickActionSubtext}>Save many</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Scans Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Scans</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('History')}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.recentScansContainer}>
            {recentScans.length > 0 ? (
              recentScans.map((scan) => (
                <View key={scan.id} style={styles.recentScanCard}>
                  <View style={styles.recentScanIcon}>
                    <Text style={styles.recentScanEmoji}>
                      {scan.type === 'PDF' ? '📄' : '🖼️'}
                    </Text>
                  </View>
                  <View style={styles.recentScanInfo}>
                    <Text style={styles.recentScanName} numberOfLines={1}>
                      {scan.name}
                    </Text>
                    <Text style={styles.recentScanDate}>{scan.formattedDate}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyRecentScans}>
                <Text style={styles.emptyRecentScansText}>
                  No documents scanned yet
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{totalScans}</Text>
            <Text style={styles.statLabel}>Total Scans</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {recentScans.filter((doc) => {
                const docDate = new Date(doc.createdAt);
                const now = new Date();
                return docDate.getMonth() === now.getMonth() &&
                       docDate.getFullYear() === now.getFullYear();
              }).length}
            </Text>
            <Text style={styles.statLabel}>This Month</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{storageUsed}</Text>
            <Text style={styles.statLabel}>Storage Used</Text>
          </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 30,
    backgroundColor: '#FFFFFF',
  },
  greeting: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  scannerSection: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 30,
  },
  scannerSectionTitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  scannerButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  scannerButton: {
    flex: 1,
    backgroundColor: '#4F46E5',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
    shadowColor: '#4F46E5',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cameraButton: {
    backgroundColor: '#4F46E5',
  },
  uploadButton: {
    backgroundColor: '#059669',
  },
  lastImageContainer: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    padding: 12,
    alignItems: 'center',
  },
  lastImageLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  lastImage: {
    width: width - 64,
    height: (width - 64) * 0.75,
    borderRadius: 8,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  saveOnlyButton: {
    backgroundColor: '#EEF2FF',
  },
  scanAIButton: {
    backgroundColor: '#4F46E5',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  scanAIButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  scannerIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  scannerIcon: {
    fontSize: 28,
  },
  scannerButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  scannerButtonSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  section: {
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  seeAllText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
  quickActionsHint: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionEmoji: {
    fontSize: 24,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  quickActionSubtext: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  recentScansContainer: {
    gap: 12,
  },
  recentScanCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recentScanIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  recentScanEmoji: {
    fontSize: 24,
  },
  recentScanInfo: {
    flex: 1,
  },
  recentScanName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  recentScanDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyRecentScans: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  emptyRecentScansText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});
