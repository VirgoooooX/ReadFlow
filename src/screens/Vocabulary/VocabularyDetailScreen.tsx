import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useThemeContext } from '../../theme';
import { vocabularyService } from '../../services/VocabularyService';
import { VocabularyEntry, WordDefinition } from '../../types';
import type { VocabularyStackParamList } from '../../navigation/types';
import { stripHtmlTags } from '../../utils/stringUtils';
import * as StyleUtils from '../../utils/styleUtils';
import { withAlpha } from '../../utils/colorUtils';

type VocabularyDetailRouteProp = RouteProp<VocabularyStackParamList, 'VocabularyDetail'>;

const VocabularyDetailScreen: React.FC = () => {
  const route = useRoute<VocabularyDetailRouteProp>();
  const navigation = useNavigation();
  const { entryId } = route.params;
  const { theme } = useThemeContext();
  
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<VocabularyEntry | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const styles = createStyles(theme);

  useEffect(() => {
    loadWordDetail();
  }, [entryId]);

  const loadWordDetail = async () => {
    try {
      setLoading(true);
      const wordEntry = await vocabularyService.getWordById(entryId);
      setEntry(wordEntry);
    } catch (error) {
      console.error('Failed to load word detail:', error);
      Alert.alert('加载失败', '无法加载单词详情');
    } finally {
      setLoading(false);
    }
  };

  // 发音功能
  const handleSpeak = useCallback(async (text: string) => {
    try {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        await Speech.stop();
      }
      
      setSpeaking(true);
      
      Speech.speak(text, {
        language: 'en-US',
        rate: 0.75,
        pitch: 1.0,
        onStart: () => {
          setSpeaking(true);
        },
        onDone: () => {
          setSpeaking(false);
        },
        onStopped: () => {
          setSpeaking(false);
        },
        onError: () => {
          setSpeaking(false);
          Alert.alert('发音失败', '无法播放语音，请检查设备音量设置');
        },
      });
    } catch (error) {
      setSpeaking(false);
      Alert.alert('发音错误', String(error));
    }
  }, []);

  // 获取释义数据
  const getDefinition = (): WordDefinition | null => {
    if (!entry) return null;
    if (typeof entry.definition === 'object' && entry.definition !== null) {
      return entry.definition as WordDefinition;
    }
    return null;
  };

  // 删除单词
  const handleDelete = () => {
    if (!entry) return;
    Alert.alert(
      '删除单词',
      `确定要从单词本中删除 "${entry.word}" 吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await vocabularyService.deleteWord(entryId);
              navigation.goBack();
            } catch (error) {
              Alert.alert('删除失败', String(error));
            }
          },
        },
      ]
    );
  };

  // 获取掌握程度标签
  const getMasteryInfo = (level: number) => {
    if (level >= 5) return { text: '已掌握', color: theme.semantic.success, bg: withAlpha(theme.semantic.success, 0.12) };
    if (level >= 2) return { text: '学习中', color: theme.semantic.warning, bg: withAlpha(theme.semantic.warning, 0.12) };
    return { text: '新单词', color: theme.semantic.info, bg: withAlpha(theme.semantic.info, 0.12) };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color={theme.colors.error} />
        <Text style={styles.errorText}>单词不存在</Text>
      </View>
    );
  }

  const definition = getDefinition();
  const masteryLevel = entry.masteryLevel || (entry as any).mastery_level || 0;
  const masteryInfo = getMasteryInfo(masteryLevel);
  const reviewCount = entry.reviewCount || (entry as any).review_count || 0;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 单词头部 */}
        <View style={styles.wordHeader}>
          <View style={styles.wordTitleRow}>
            <Text style={styles.wordText}>{entry.word}</Text>
            <TouchableOpacity 
              style={[styles.speakButton, speaking && styles.speakButtonActive]}
              onPress={() => handleSpeak(entry.word)}
              disabled={speaking}
            >
              <MaterialIcons 
                name={speaking ? "volume-up" : "volume-up"} 
                size={28} 
                color={speaking ? theme.colors.onPrimary : theme.colors.primary} 
              />
            </TouchableOpacity>
          </View>
          
          {/* 音标 */}
          {definition?.phonetic && (
            <Text style={styles.phoneticText}>/{definition.phonetic}/</Text>
          )}
          
          {/* 词形说明 */}
          {definition?.wordForm && (
            <Text style={styles.wordFormText}>({definition.wordForm})</Text>
          )}
        </View>

        {/* 掌握程度和统计 */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <View style={[styles.masteryBadge, { backgroundColor: masteryInfo.bg }]}>
              <Text style={[styles.masteryText, { color: masteryInfo.color }]}>
                {masteryInfo.text}
              </Text>
            </View>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>复习次数</Text>
            <Text style={styles.statValue}>{reviewCount}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>掌握度</Text>
            <Text style={styles.statValue}>{masteryLevel}/5</Text>
          </View>
        </View>

        {/* 释义部分 */}
        {definition?.definitions && definition.definitions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>释义</Text>
            {definition.definitions.map((def, index) => (
              <View key={index} style={styles.definitionItem}>
                <View style={styles.posTag}>
                  <Text style={styles.posText}>{def.partOfSpeech}</Text>
                </View>
                {def.translation && (
                  <Text style={styles.translationText}>{def.translation}</Text>
                )}
                {def.definition && (
                  <Text style={styles.definitionText}>{def.definition}</Text>
                )}
                {def.example && (
                  <View style={styles.exampleContainer}>
                    <MaterialIcons name="format-quote" size={16} color={theme.colors.primary} />
                    <Text style={styles.exampleText}>{def.example}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* 原形释义 */}
        {definition?.baseWord && definition?.baseWordDefinitions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>原形: {definition.baseWord}</Text>
            {definition.baseWordDefinitions.map((def, index) => (
              <View key={index} style={styles.definitionItem}>
                <View style={styles.posTag}>
                  <Text style={styles.posText}>{def.partOfSpeech}</Text>
                </View>
                {def.translation && (
                  <Text style={styles.translationText}>{def.translation}</Text>
                )}
                {def.definition && (
                  <Text style={styles.definitionText}>{def.definition}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* 来源文章 */}
        {entry.context && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>上下文</Text>
            <View style={styles.contextCard}>
              <Text style={styles.contextText}>{stripHtmlTags(entry.context)}</Text>
            </View>
          </View>
        )}

        {/* 来源文章标题 */}
        {(entry as any).sourceArticleTitle && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>来源文章</Text>
            <Text style={styles.sourceText}>{(entry as any).sourceArticleTitle}</Text>
          </View>
        )}

        {/* 添加时间 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>添加时间</Text>
          <Text style={styles.timeText}>
            {entry.addedAt ? new Date(entry.addedAt).toLocaleString('zh-CN') : '未知'}
          </Text>
        </View>

        {/* 删除按钮 */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <MaterialIcons name="delete-outline" size={20} color={theme.colors.onError} />
          <Text style={styles.deleteButtonText}>从单词本中删除</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 16,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      marginTop: 12,
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
      color: theme.colors.error,
    },
    // 单词头部
    wordHeader: {
      marginBottom: 20,
    },
    wordTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    wordText: {
      fontSize: 32,
      lineHeight: 40,
      includeFontPadding: false,
      fontWeight: 'bold',
      color: theme.colors.primary,
    },
    speakButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.surfaceContainer,
      justifyContent: 'center',
      alignItems: 'center',
    },
    speakButtonActive: {
      backgroundColor: theme.colors.primary,
    },
    phoneticText: {
      fontSize: 18,
      lineHeight: 26,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 4,
    },
    wordFormText: {
      fontSize: 14,
      lineHeight: 20,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
      fontStyle: 'italic',
    },
    // 统计卡片
    statsCard: {
      flexDirection: 'row' as any,
      ...StyleUtils.createCardStyle(theme),
      borderRadius: 12,
      marginBottom: 20,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
    },
    masteryBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    masteryText: {
      fontSize: 13,
      lineHeight: 20,
      includeFontPadding: false,
      fontWeight: '600',
    },
    statLabel: {
      fontSize: 12,
      lineHeight: 18,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 18,
      lineHeight: 26,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    // 释义部分
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginBottom: 12,
    },
    definitionItem: {
      ...StyleUtils.createCardStyle(theme),
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
    },
    posTag: {
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginBottom: 8,
    },
    posText: {
      fontSize: 11,
      lineHeight: 16,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onPrimary,
    },
    translationText: {
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
      fontWeight: '500',
      color: theme.colors.onSurface,
      marginBottom: 6,
    },
    definitionText: {
      fontSize: 14,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
      lineHeight: 20,
      marginBottom: 6,
    },
    exampleContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.colors.outlineVariant,
    },
    exampleText: {
      flex: 1,
      fontSize: 13,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
      fontStyle: 'italic',
      marginLeft: 6,
      lineHeight: 18,
    },
    // 上下文
    contextCard: {
      ...StyleUtils.createCardStyle(theme),
      borderRadius: 12,
      padding: 16,
    },
    contextText: {
      fontSize: 14,
      includeFontPadding: false,
      color: theme.colors.onSurface,
      lineHeight: 22,
    },
    sourceText: {
      fontSize: 14,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
    },
    timeText: {
      fontSize: 14,
      lineHeight: 20,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
    },
    // 删除按钮
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.error,
      borderRadius: 24,
      paddingVertical: 12,
      paddingHorizontal: 24,
      marginTop: 20,
      marginBottom: 40,
    },
    deleteButtonText: {
      marginLeft: 8,
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onError,
    },
  });

export default VocabularyDetailScreen;
