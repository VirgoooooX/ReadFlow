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
import { WordDefinition } from '../types';

interface WordDefinitionModalProps {
  visible: boolean;
  word: string;
  definition: WordDefinition | null;
  loading: boolean;
  onClose: () => void;
  onAddToVocabulary?: () => void;
}

const WordDefinitionModal: React.FC<WordDefinitionModalProps> = ({
  visible,
  word,
  definition,
  loading,
  onClose,
  onAddToVocabulary,
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
            <Text style={styles.headerTitle}>词典查询</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color={theme?.colors?.onSurface} />
            </TouchableOpacity>
          </View>

          {/* 内容 */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme?.colors?.primary} />
                <Text style={styles.loadingText}>查询中...</Text>
              </View>
            ) : definition ? (
              <>
                {/* 单词和音标 */}
                <View style={styles.wordHeader}>
                  <Text style={styles.word}>{definition.word}</Text>
                  {definition.wordForm && (
                    <Text style={styles.wordForm}>({definition.wordForm})</Text>
                  )}
                </View>
                
                {definition.phonetic && (
                  <Text style={styles.phonetic}>/{definition.phonetic}/</Text>
                )}

                {/* 当前词形释义 */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>释义</Text>
                  {definition.definitions.map((def, index) => (
                    <View key={index} style={styles.definitionItem}>
                      <Text style={styles.partOfSpeech}>{def.partOfSpeech}</Text>
                      {def.translation && (
                        <Text style={styles.translation}>{def.translation}</Text>
                      )}
                      {def.definition && (
                        <Text style={styles.definition}>{def.definition}</Text>
                      )}
                      {def.example && (
                        <Text style={styles.example}>例：{def.example}</Text>
                      )}
                    </View>
                  ))}
                </View>

                {/* 原始单词释义 */}
                {definition.baseWord && definition.baseWordDefinitions && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      原形：{definition.baseWord}
                    </Text>
                    {definition.baseWordDefinitions.map((def, index) => (
                      <View key={index} style={styles.definitionItem}>
                        <Text style={styles.partOfSpeech}>{def.partOfSpeech}</Text>
                        {def.translation && (
                          <Text style={styles.translation}>{def.translation}</Text>
                        )}
                        {def.definition && (
                          <Text style={styles.definition}>{def.definition}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* 来源标记 */}
                <Text style={styles.source}>
                  来源: {definition.source === 'cache' ? '本地缓存' : 'LLM查询'}
                </Text>
              </>
            ) : (
              <View style={styles.errorContainer}>
                <MaterialIcons name="error-outline" size={48} color={theme?.colors?.error} />
                <Text style={styles.errorText}>查询失败或未找到释义</Text>
              </View>
            )}
          </ScrollView>

          {/* 底部按钮 */}
          {definition && onAddToVocabulary && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={onAddToVocabulary}
              >
                <MaterialIcons name="bookmark-add" size={20} color="#FFFFFF" />
                <Text style={styles.addButtonText}>添加到单词本</Text>
              </TouchableOpacity>
            </View>
          )}
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
      maxHeight: '80%',
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
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    },
    wordHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: 8,
    },
    word: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme?.colors?.primary || '#6750A4',
    },
    wordForm: {
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      marginLeft: 8,
    },
    phonetic: {
      fontSize: 16,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      marginBottom: 20,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 12,
    },
    definitionItem: {
      marginBottom: 16,
      paddingLeft: 12,
      borderLeftWidth: 3,
      borderLeftColor: theme?.colors?.primary || '#6750A4',
    },
    partOfSpeech: {
      fontSize: 12,
      fontWeight: '600',
      color: theme?.colors?.secondary || '#625B71',
      marginBottom: 4,
    },
    translation: {
      fontSize: 16,
      fontWeight: '500',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 4,
    },
    definition: {
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      marginBottom: 4,
      lineHeight: 20,
    },
    example: {
      fontSize: 13,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      fontStyle: 'italic',
      lineHeight: 18,
    },
    source: {
      fontSize: 12,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      textAlign: 'center',
      marginTop: 8,
    },
    errorContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    errorText: {
      marginTop: 12,
      fontSize: 14,
      color: theme?.colors?.error || '#B3261E',
    },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#E6E0E9'),
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme?.colors?.primary || '#6750A4',
      borderRadius: 24,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    addButtonText: {
      marginLeft: 8,
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });

export default WordDefinitionModal;
