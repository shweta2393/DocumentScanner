import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';

/**
 * PinModal - Set PIN (when locking) or Enter PIN (when opening locked doc).
 * @param {boolean} visible
 * @param {string} mode - 'set' | 'enter'
 * @param {string} title - e.g. "Set PIN" or "Enter PIN to open"
 * @param {string} error - optional error message
 * @param {(pin: string) => void} onSubmit - called with entered PIN
 * @param {() => void} onClose
 */
export default function PinModal({
  visible,
  mode = 'enter',
  title = 'Enter PIN',
  error: externalError,
  onSubmit,
  onClose,
}) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setPin('');
      setConfirmPin('');
      setError(externalError || '');
    } else {
      setError('');
    }
  }, [visible, externalError]);

  const handleSubmit = () => {
    const trimmed = pin.trim();
    if (!trimmed) {
      setError('Please enter a PIN');
      return;
    }
    if (mode === 'set') {
      if (trimmed.length < 4) {
        setError('PIN must be at least 4 characters');
        return;
      }
      if (confirmPin.trim() !== trimmed) {
        setError('PIN and confirmation do not match');
        return;
      }
    }
    setError('');
    onSubmit(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {mode === 'set' && (
            <Text style={styles.hint}>Use at least 4 characters. You'll need this to open locked documents.</Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="PIN"
            placeholderTextColor="#9CA3AF"
            value={pin}
            onChangeText={(t) => { setPin(t); setError(''); }}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={20}
            autoFocus
          />
          {mode === 'set' && (
            <TextInput
              style={styles.input}
              placeholder="Confirm PIN"
              placeholderTextColor="#9CA3AF"
              value={confirmPin}
              onChangeText={(t) => { setConfirmPin(t); setError(''); }}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={20}
            />
          )}
          {(error || externalError) ? (
            <Text style={styles.error}>{error || externalError}</Text>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitText}>{mode === 'set' ? 'Set PIN' : 'Open'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  box: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
  },
  error: {
    fontSize: 13,
    color: '#DC2626',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  submitText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
