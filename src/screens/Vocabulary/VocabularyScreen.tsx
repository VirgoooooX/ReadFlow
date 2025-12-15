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
import type { VocabularyStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';
import { DatabaseService } from '../../database/DatabaseService';
import { translationService } from '../../services/TranslationService';
import { vocabularyService } from '../../services/VocabularyService';
import { VocabularyEntry } from '../../types';
import { useFocusEffect } from '@react-navigation/native';

type Props = VocabularyStackScreenProps<'VocabularyMain'>;

const VocabularyScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'vocabulary' | 'dictionary' | 'translation'>('vocabulary');
  const [stats, setStats] = useState({ vocabulary: 0, dictionary: 0, translation: 0, needReview: 0 });
  const [vocabularyWords, setVocabularyWords] = useState<VocabularyEntry[]>([]);
  const [dictionaryWords, setDictionaryWords] = useState<any[]>([]);
  const [translations, setTranslations] = useState<any[]>([]);

  const styles = createStyles(isDark, theme);

  // 使用 useFocusEffect 在页面获得焦点时重新加载
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [activeTab])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const db = DatabaseService.getInstance();
      
      // 确保数据库已初始化
      await db.initializeDatabase();
      
      // 加载统计数据
      const vocabCount = await db.executeQuery('SELECT COUNT(*) as count FROM vocabulary').catch(() => [{ count: 0 }]);
      const dictCount = await db.executeQuery('SELECT COUNT(*) as count FROM dictionary_cache').catch(() => [{ count: 0 }]);
      const transCount = await db.executeQuery('SELECT COUNT(*) as count FROM translation_cache').catch(() => [{ count: 0 }]);
      const needReviewCount = await db.executeQuery(
        'SELECT COUNT(*) as count FROM vocabulary WHERE next_review_at <= ? AND mastery_level < 5',
        [new Date().toISOString()]
      ).catch(() => [{ count: 0 }]);
      
      setStats({
        vocabulary: vocabCount[0]?.count || 0,
        dictionary: dictCount[0]?.count || 0,
        translation: transCount[0]?.count || 0,
        needReview: needReviewCount[0]?.count || 0,
      });
      
      // 根据当前标签页加载数据
      if (activeTab === 'vocabulary') {
        const entries = await vocabularyService.getAllWords({ limit: 50, sortBy: 'added_at', sortOrder: 'DESC' });
        console.log('加载单词本:', entries.map(e => ({ id: e.id, word: e.word })));
        setVocabularyWords(entries);
      } else if (activeTab === 'dictionary') {
        const words = await db.executeQuery(
          'SELECT * FROM dictionary_cache ORDER BY created_at DESC LIMIT 50'
        ).catch(() => []);
        setDictionaryWords(words.map((row: any) => ({
          word: row.word,
          baseWord: row.base_word,
          wordForm: row.word_form,
          definitions: JSON.parse(row.definitions || '{}'),
          createdAt: new Date(row.created_at * 1000),
        })));
      } else if (activeTab === 'translation') {
        const trans = await translationService.getTranslationHistory(50);
        setTranslations(trans);
      }
    } catch (error) {
      console.error('Failed to load vocabulary data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartReview = () => {
    if (stats.needReview === 0) {
      Alert.alert('暂无复习', '当前没有需要复习的单词');
      return;
    }
    navigation.navigate('ReviewSession');
  };

  const handleDeleteWord = async (id: number, word: string) => {
    console.log(`调用 handleDeleteWord: id=${id}, word=${word}`);
    Alert.alert(
      '删除单词',
      `确定要从单词本中删除 "${word}" 吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log(`执行删除: id=${id}`);
              await vocabularyService.deleteWord(id);
              console.log(`删除成功，重新加载数据`);
              loadData(); // 重新加载
            } catch (error) {
              console.error('Failed to delete word:', error);
              Alert.alert('删除失败', String(error));
            }
          },
        },
      ]
    );
  };

  const getMasteryLabel = (level: number): { text: string; style: string } => {
    if (level >= 5) return { text: '已掌握', style: 'mastered' };
    if (level >= 2) return { text: '学习中', style: 'learning' };
    return { text: '新单词', style: 'new' };
  };

  const handleAddWord = () => {
    navigation.navigate('AddWord', {});
  };

  const handleReviewSession = () => {
    navigation.navigate('ReviewSession');
  };

  const handleViewStats = () => {
    navigation.navigate('VocabularyStats');
  };

  const handleWordDetail = (entryId: number) => {
    navigation.navigate('VocabularyDetail', { entryId });
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 统计卡片 */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.vocabulary}</Text>
            <Text style={styles.statLabel}>单词本</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.dictionary}</Text>
            <Text style={styles.statLabel}>查询记录</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.translation}</Text>
            <Text style={styles.statLabel}>翻译记录</Text>
          </View>
        </View>

        {/* 标签页切换 */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'vocabulary' && styles.activeTab]}
            onPress={() => setActiveTab('vocabulary')}
          >
            <Text style={[styles.tabText, activeTab === 'vocabulary' && styles.activeTabText]}>
              单词本
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'dictionary' && styles.activeTab]}
            onPress={() => setActiveTab('dictionary')}
          >
            <Text style={[styles.tabText, activeTab === 'dictionary' && styles.activeTabText]}>
              查询记录
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'translation' && styles.activeTab]}
            onPress={() => setActiveTab('translation')}
          >
            <Text style={[styles.tabText, activeTab === 'translation' && styles.activeTabText]}>
              翻译记录
            </Text>
          </TouchableOpacity>
        </View>

        {/* 内容区域 */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme?.colors?.primary} />
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : (
          <View style={styles.section}>
            {activeTab === 'vocabulary' && (
              <View style={styles.wordList}>
                {/* 复习按钮 */}
                {stats.vocabulary > 0 && (
                  <TouchableOpacity style={styles.reviewButton} onPress={handleStartReview}>
                    <MaterialIcons name="school" size={20} color="#FFFFFF" />
                    <Text style={styles.reviewButtonText}>
                      开始复习 {stats.needReview > 0 ? `(${stats.needReview})` : ''}
                    </Text>
                  </TouchableOpacity>
                )}
                
                {vocabularyWords.length === 0 ? (
                  <Text style={styles.emptyText}>单词本还是空的，在文章中点击单词可以添加哦</Text>
                ) : (
                  vocabularyWords.map((item: any, index) => {
                    const mastery = getMasteryLabel(item.masteryLevel || item.mastery_level || 0);
                    const translation = typeof item.definition === 'object' 
                      ? item.definition?.definitions?.[0]?.translation 
                      : item.translation;
                    const phonetic = typeof item.definition === 'object'
                      ? item.definition?.phonetic
                      : null;
                    return (
                      <View key={item.id || index} style={styles.wordItem}>
                        <View style={styles.wordContent}>
                          <View style={styles.wordHeader}>
                            <View style={styles.wordTitleContainer}>
                              <Text style={styles.wordText}>{item.word}</Text>
                              {phonetic && (
                                <Text style={styles.phoneticText}>/{phonetic}/</Text>
                              )}
                            </View>
                            <View style={[styles.levelBadge, mastery.style === 'mastered' ? styles.level_mastered : mastery.style === 'learning' ? styles.level_learning : styles.level_new]}>
                              <Text style={[styles.levelText, mastery.style === 'mastered' ? styles.levelText_mastered : mastery.style === 'learning' ? styles.levelText_learning : styles.levelText_new]}>
                                {mastery.text}
                              </Text>
                            </View>
                          </View>
                          {translation && (
                            <Text style={styles.meaningText}>
                              {translation}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity 
                          style={styles.deleteButton}
                          onPress={() => {
                            console.log('Delete pressed, item:', item);
                            if (item.id !== undefined && item.id !== null) {
                              handleDeleteWord(item.id, item.word);
                            } else {
                              console.error('No id found for item:', item);
                              Alert.alert('错误', '无法删除该单词，缺少ID');
                            }
                          }}
                        >
                          <MaterialIcons name="delete-outline" size={20} color={theme?.colors?.error || '#B3261E'} />
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>
            )}
            
            {activeTab === 'dictionary' && (
              <View style={styles.wordList}>
                {dictionaryWords.length === 0 ? (
                  <Text style={styles.emptyText}>暂无查询记录</Text>
                ) : (
                  dictionaryWords.map((item, index) => (
                    <View key={index} style={styles.wordItem}>
                      <View style={styles.wordContent}>
                        <Text style={styles.wordText}>{item.word}</Text>
                        {item.wordForm && (
                          <Text style={styles.wordFormText}>({item.wordForm})</Text>
                        )}
                        {item.definitions.definitions?.[0]?.translation && (
                          <Text style={styles.meaningText}>
                            {item.definitions.definitions[0].translation}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
            
            {activeTab === 'translation' && (
              <View style={styles.wordList}>
                {translations.length === 0 ? (
                  <Text style={styles.emptyText}>暂无翻译记录</Text>
                ) : (
                  translations.map((item, index) => (
                    <View key={index} style={styles.translationItem}>
                      <Text style={styles.originalText}>{item.originalText}</Text>
                      <Text style={styles.translatedText}>{item.translatedText}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    },
    content: {
      padding: 16,
      paddingTop: 24,
    },
    statsSection: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
      padding: 16,
      marginHorizontal: 4,
    },
    statNumber: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme?.colors?.primary || '#3B82F6',
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
    tabsContainer: {
      flexDirection: 'row',
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 24,
      padding: 4,
      marginBottom: 24,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      alignItems: 'center',
    },
    activeTab: {
      backgroundColor: theme?.colors?.primary || '#3B82F6',
    },
    tabText: {
      fontSize: 14,
      fontWeight: '500',
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
    activeTabText: {
      color: '#FFFFFF',
    },
    loadingContainer: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    },
    emptyText: {
      textAlign: 'center',
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      paddingVertical: 32,
    },
    wordFormText: {
      fontSize: 12,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      marginTop: 2,
    },
    translationItem: {
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
    },
    originalText: {
      fontSize: 14,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 8,
      lineHeight: 20,
    },
    translatedText: {
      fontSize: 15,
      fontWeight: '500',
      color: theme?.colors?.primary || '#3B82F6',
      lineHeight: 22,
    },
    actionSection: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    primaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme?.colors?.primary || '#3B82F6',
      borderRadius: 24,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    primaryButtonText: {
      marginLeft: 8,
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onPrimary || '#FFFFFF',
    },
    secondaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      borderRadius: 24,
      paddingVertical: 12,
      paddingHorizontal: 16,

    },
    secondaryButtonText: {
      marginLeft: 8,
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.primary || '#3B82F6',
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    viewAllText: {
      fontSize: 14,
      color: theme?.colors?.primary || '#3B82F6',
      fontWeight: '500',
    },
    wordList: {
      gap: 8,
    },
    reviewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme?.colors?.primary || '#3B82F6',
      borderRadius: 24,
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    reviewButtonText: {
      marginLeft: 8,
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    wordHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    wordTitleContainer: {
      flexDirection: 'column',
      flex: 1,
    },
    deleteButton: {
      padding: 8,
      marginLeft: 8,
    },
    wordItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
      padding: 16,
    },
    wordContent: {
      flex: 1,
    },
    wordText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 2,
    },
    phoneticText: {
      fontSize: 13,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
      fontStyle: 'italic',
      marginTop: 2,
    },
    meaningText: {
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
    wordMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    levelBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    level_mastered: {
      backgroundColor: theme?.colors?.successContainer || (isDark ? '#1B5E20' : '#E8F5E8'),
    },
    level_learning: {
      backgroundColor: theme?.colors?.warningContainer || (isDark ? '#E65100' : '#FFF3E0'),
    },
    level_new: {
      backgroundColor: theme?.colors?.infoContainer || (isDark ? '#0D47A1' : '#E3F2FD'),
    },
    levelText: {
      fontSize: 10,
      fontWeight: '500',
    },
    levelText_mastered: {
      color: theme?.colors?.onSuccessContainer || (isDark ? '#A5D6A7' : '#2E7D32'),
    },
    levelText_learning: {
      color: theme?.colors?.onWarningContainer || (isDark ? '#FFB74D' : '#F57C00'),
    },
    levelText_new: {
      color: theme?.colors?.onInfoContainer || (isDark ? '#90CAF9' : '#1976D2'),
    },
  });

export default VocabularyScreen;