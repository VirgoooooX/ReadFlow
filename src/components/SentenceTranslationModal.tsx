import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../theme';

interface SentenceTranslationModalProps {
  visible: boolean;
  originalText: string;
  translatedText: string | null;
  loading: boolean;
  onClose: () => void;
}

const SentenceTranslationModal: React.FC<SentenceTranslationModalProps> = ({
  visible,
  originalText,
  translatedText,
  loading,
  onClose,
}) => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* 头部 */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>句子翻译</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color={theme?.colors?.onSurface} />
            </TouchableOpacity>
          </View>

          {/* 内容 */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* 原文 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons 
                  name="translate" 
                  size={20} 
                  color={theme?.colors?.primary} 
                />
                <Text style={styles.sectionTitle}>原文</Text>
              </View>
              <Text style={styles.originalText}>{originalText}</Text>
            </View>

            {/* 译文 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons 
                  name="check-circle" 
                  size={20} 
                  color={theme?.colors?.secondary} 
                />
                <Text style={styles.sectionTitle}>译文</Text>
              </View>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={theme?.colors?.primary} />
                  <Text style={styles.loadingText}>翻译中...</Text>
                </View>
              ) : translatedText ? (
                <Text style={styles.translatedText}>{translatedText}</Text>
              ) : (
                <View style={styles.errorContainer}>
                  <MaterialIcons name="error-outline" size={32} color={theme?.colors?.error} />
                  <Text style={styles.errorText}>翻译失败</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: theme?.colors?.surface || (isDark ? '#1C1B1F' : '#FFFBFE'),
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '60%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#E6E0E9'),
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    closeButton: {
      padding: 4,
    },
    content: {
      padding: 20,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginLeft: 8,
    },
    originalText: {
      fontSize: 15,
      lineHeight: 22,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      padding: 12,
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 8,
    },
    translatedText: {
      fontSize: 16,
      lineHeight: 24,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      padding: 12,
      backgroundColor: theme?.colors?.secondaryContainer || (isDark ? '#4A4458' : '#E8DEF8'),
      borderRadius: 8,
      fontWeight: '500',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    loadingText: {
      marginLeft: 12,
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    errorText: {
      marginLeft: 12,
      fontSize: 14,
      color: theme?.colors?.error || '#B3261E',
    },
  });

export default SentenceTranslationModal;
