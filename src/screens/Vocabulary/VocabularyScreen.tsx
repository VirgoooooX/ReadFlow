import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList, // 改用 FlatList 提升长列表性能
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import type { VocabularyStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';
import { DatabaseService } from '../../database/DatabaseService';
import { translationService } from '../../services/TranslationService';
import { vocabularyService } from '../../services/VocabularyService';
import { typography } from '../../theme/typography';
import { VocabularyEntry } from '../../types';
import { useFocusEffect } from '@react-navigation/native';
import * as StyleUtils from '../../utils/styleUtils';

type Props = VocabularyStackScreenProps<'VocabularyMain'>;

// 顶部 Tab 组件
const SegmentedTab = ({ tabs, activeTab, onTabPress, theme, isDark }: any) => {
  return (
    <View style={styles(isDark, theme).tabContainer}>
      {tabs.map((tab: any) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles(isDark, theme).tabItem, isActive && styles(isDark, theme).tabItemActive]}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles(isDark, theme).tabText, isActive && styles(isDark, theme).tabTextActive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles(isDark, theme).tabIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// 单词卡片组件
const WordCard = ({ item, theme, isDark, onPress, onSpeak }: any) => {
  const mastery = getMasteryLabel(item.masteryLevel || item.mastery_level || 0);
  const translation = typeof item.definition === 'object' 
    ? item.definition?.definitions?.[0]?.translation 
    : item.translation;
  const phonetic = typeof item.definition === 'object'
    ? item.definition?.phonetic
    : null;

  return (
    <TouchableOpacity 
      style={styles(isDark, theme).wordCard} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles(isDark, theme).wordCardHeader}>
        <View style={styles(isDark, theme).wordMain}>
          <Text style={styles(isDark, theme).wordText}>{item.word}</Text>
          {phonetic && <Text style={styles(isDark, theme).phoneticText}>/{phonetic}/</Text>}
        </View>
        
        {/* 发音按钮 */}
        <TouchableOpacity 
          style={styles(isDark, theme).speakBtn}
          onPress={(e) => {
            e.stopPropagation();
            onSpeak(item.word);
          }}
        >
          <MaterialIcons name="volume-up" size={20} color={theme?.colors?.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles(isDark, theme).divider} />

      <View style={styles(isDark, theme).wordCardBody}>
        <Text style={styles(isDark, theme).meaningText} numberOfLines={2}>
          {translation || '暂无释义'}
        </Text>
        
        {/* 状态徽章 (放在右下角) */}
        <View style={[styles(isDark, theme).statusBadge, { backgroundColor: mastery.color + '15' }]}>
          <View style={[styles(isDark, theme).statusDot, { backgroundColor: mastery.color }]} />
          <Text style={[styles(isDark, theme).statusText, { color: mastery.color }]}>{mastery.text}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// 辅助函数：获取掌握程度样式
const getMasteryLabel = (level: number) => {
  if (level >= 5) return { text: '已掌握', color: '#4CAF50' }; // Green
  if (level >= 2) return { text: '学习中', color: '#FF9800' }; // Orange
  return { text: '新单词', color: '#2196F3' }; // Blue
};

const VocabularyScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'vocabulary' | 'dictionary' | 'translation'>('vocabulary');
  const [stats, setStats] = useState({ vocabulary: 0, dictionary: 0, translation: 0, needReview: 0 });
  const [listData, setListData] = useState<any[]>([]);

  // 样式对象
  const currentStyles = styles(isDark, theme);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [activeTab])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const db = DatabaseService.getInstance();
      await db.initializeDatabase();
      
      // 并行加载统计数据
      const [vocabCount, dictCount, transCount, needReviewCount] = await Promise.all([
        db.executeQuery('SELECT COUNT(*) as count FROM vocabulary').catch(() => [{ count: 0 }]),
        db.executeQuery('SELECT COUNT(*) as count FROM dictionary_cache').catch(() => [{ count: 0 }]),
        db.executeQuery('SELECT COUNT(*) as count FROM translation_cache').catch(() => [{ count: 0 }]),
        db.executeQuery('SELECT COUNT(*) as count FROM vocabulary WHERE next_review_at <= ? AND mastery_level < 5', [new Date().toISOString()]).catch(() => [{ count: 0 }])
      ]);
      
      setStats({
        vocabulary: vocabCount[0]?.count || 0,
        dictionary: dictCount[0]?.count || 0,
        translation: transCount[0]?.count || 0,
        needReview: needReviewCount[0]?.count || 0,
      });
      
      // 加载列表数据
      let data = [];
      if (activeTab === 'vocabulary') {
        data = await vocabularyService.getAllWords({ limit: 50, sortBy: 'added_at', sortOrder: 'DESC' });
      } else if (activeTab === 'dictionary') {
        const rows = await db.executeQuery('SELECT * FROM dictionary_cache ORDER BY created_at DESC LIMIT 50').catch(() => []);
        data = rows.map((row: any) => ({
          ...row,
          definitions: JSON.parse(row.definitions || '{}'),
        }));
      } else if (activeTab === 'translation') {
        data = await translationService.getTranslationHistory(50);
      }
      setListData(data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSpeak = async (word: string) => {
    try {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) await Speech.stop();
      Speech.speak(word, { language: 'en', rate: 0.9 });
    } catch (error) {
      // ignore
    }
  };

  const renderItem = ({ item }: any) => {
    if (activeTab === 'vocabulary') {
      return (
        <WordCard 
          item={item} 
          theme={theme} 
          isDark={isDark} 
          onPress={() => navigation.navigate('VocabularyDetail', { entryId: item.id })}
          onSpeak={handleSpeak}
        />
      );
    } 
    
    if (activeTab === 'dictionary') {
      const translation = item.definitions?.definitions?.[0]?.translation || '暂无释义';
      return (
        <View style={currentStyles.simpleCard}>
          <View style={currentStyles.simpleCardRow}>
            <Text style={currentStyles.simpleWord}>{item.word}</Text>
            <Text style={currentStyles.simpleTime}>{new Date(item.created_at * 1000).toLocaleDateString()}</Text>
          </View>
          <Text style={currentStyles.simpleMeaning} numberOfLines={1}>{translation}</Text>
        </View>
      );
    }

    // Translation
    return (
      <View style={currentStyles.transCard}>
        <Text style={currentStyles.transOriginal}>{item.originalText}</Text>
        <View style={currentStyles.transDivider} />
        <Text style={currentStyles.transResult}>{item.translatedText}</Text>
      </View>
    );
  };

  return (
    <View style={currentStyles.container}>
      {/* 固定顶栏：Header + Banner + Tab */}
      <View style={currentStyles.fixedTopBar}>
        {/* 顶部统计概览 */}
        <View style={currentStyles.header}>
          <View style={currentStyles.statItem}>
            <Text style={currentStyles.statValue}>{stats.vocabulary}</Text>
            <Text style={currentStyles.statTitle}>总单词</Text>
          </View>
          <View style={currentStyles.statDivider} />
          <View style={currentStyles.statItem}>
            <Text style={currentStyles.statValue}>{stats.needReview}</Text>
            <Text style={currentStyles.statTitle}>待复习</Text>
          </View>
          <View style={currentStyles.statDivider} />
          <View style={currentStyles.statItem}>
            <Text style={currentStyles.statValue}>{stats.dictionary + stats.translation}</Text>
            <Text style={currentStyles.statTitle}>查词/翻译</Text>
          </View>
        </View>

        {/* 待复习横幅 (仅当有复习任务时显示) */}
        {activeTab === 'vocabulary' && stats.needReview > 0 && (
          <TouchableOpacity 
            style={currentStyles.reviewBanner}
            onPress={() => navigation.navigate('ReviewSession')}
          >
            <View style={currentStyles.reviewBannerLeft}>
              <View style={currentStyles.reviewIconBg}>
                <MaterialIcons name="school" size={20} color="#FFF" />
              </View>
              <View>
                <Text style={currentStyles.reviewTitle}>开始今日复习</Text>
                <Text style={currentStyles.reviewSubtitle}>{stats.needReview} 个单词需要巩固</Text>
              </View>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme?.colors?.primary} />
          </TouchableOpacity>
        )}

        {/* 分段控制器 */}
        <SegmentedTab 
          tabs={[
            { key: 'vocabulary', label: '单词本' },
            { key: 'dictionary', label: '查词历史' },
            { key: 'translation', label: '翻译历史' },
          ]}
          activeTab={activeTab}
          onTabPress={setActiveTab}
          theme={theme}
          isDark={isDark}
        />
      </View>

      {/* 列表内容（考虑顶栏高度） */}
      {loading ? (
        <View style={currentStyles.centerContainer}>
          <ActivityIndicator size="large" color={theme?.colors?.primary} />
        </View>
      ) : (
        <FlatList
          data={listData}
          renderItem={renderItem}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={currentStyles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={currentStyles.emptyContainer}>
              <MaterialIcons name="inbox" size={48} color={theme?.colors?.outline} />
              <Text style={currentStyles.emptyText}>暂无记录</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

// 样式定义
const styles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#F9F9F9'),
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // --- 固定顶栏 ---
  fixedTopBar: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderBottomWidth: 1,
    borderBottomColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#F0F0F0'),
  },
  
  // --- Header (在固定顶栏内) ---
  header: {
    flexDirection: 'row' as any,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center' as any,
    paddingHorizontal: 8,
  },
  statValue: {
    ...typography.titleLarge,
    fontWeight: '800' as any,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', // 数字用等宽字体更有质感
    lineHeight: 28,
  },
  statTitle: {
    ...typography.bodySmall,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginTop: 4,
    fontWeight: '500' as any,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#E0E0E0'),
    opacity: 0.5,
  },

  // --- Review Banner (在固定顶栏内) ---
  reviewBanner: {
    flexDirection: 'row' as any,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: (theme?.colors?.primary || '#6750A4') + '15',
    marginHorizontal: 12,
    marginVertical: 8,
    marginBottom: 8, // 与分割线紧贴
    padding: 12,
    borderRadius: 12,
  },
  reviewBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme?.colors?.primary || '#6750A4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reviewTitle: {
    ...typography.titleMedium,
    fontWeight: '600',
    color: theme?.colors?.onSurface || '#333',
  },
  reviewSubtitle: {
    ...typography.bodyMedium,
    color: theme?.colors?.primary || '#6750A4',
    marginTop: 2,
  },

  // --- Tabs (在固定顶栏内) ---
  tabContainer: {
    flexDirection: 'row' as any,
    justifyContent: 'center' as any,
    alignItems: 'center' as any,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#F0F0F0'),
  },
  tabItem: {
    marginHorizontal: 20,
    paddingVertical: 2,
    paddingHorizontal: 4,
    position: 'relative' as any,
    minWidth: 60,
    alignItems: 'center' as any,
  },
  tabItemActive: {
    // 活跃状态样式（可选）
  },
  tabText: {
    ...typography.bodyMedium,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    fontWeight: '500' as any,
  },
  tabTextActive: {
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '600' as any,
    ...typography.bodyMedium,
  },
  tabIndicator: {
    position: 'absolute' as any,
    bottom: -12,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: theme?.colors?.primary || '#6750A4',
    borderRadius: 1.5,
  },

  // --- List ---
  listContent: {
    padding: 16,
    paddingBottom: 20,
  },
  
  // --- Word Card (Flashcard Style) ---
  wordCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFF'),
    borderRadius: 16,
    marginBottom: 10,
    padding: 12,
    // Card Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.05,
    shadowRadius: 8,
    elevation: isDark ? 0 : 2,
    borderWidth: isDark ? 1 : 0,
    borderColor: theme?.colors?.outlineVariant || 'rgba(255,255,255,0.1)',
  },
  wordCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  wordMain: {
    flex: 1,
  },
  wordText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 1,
    letterSpacing: 0.5,
  },
  phoneticText: {
    ...typography.labelSmall,
    color: theme?.colors?.secondary || '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontStyle: 'italic',
  },
  speakBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: (theme?.colors?.primary || '#6750A4') + '10', // Very light bg
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: theme?.colors?.outlineVariant || '#F0F0F0',
    opacity: 0.5,
    marginBottom: 12,
  },
  wordCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  meaningText: {
    flex: 1,
    ...typography.bodyMedium,
    color: theme?.colors?.onSurfaceVariant || '#666',
    lineHeight: 22,
    marginRight: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    ...typography.labelSmall,
    fontWeight: '600',
  },

  // --- Simple Card (History) ---
  simpleCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFF'),
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme?.colors?.outlineVariant || '#F5F5F5',
  },
  simpleCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  simpleWord: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: theme?.colors?.onSurface || '#333',
  },
  simpleTime: {
    ...typography.bodySmall,
    color: theme?.colors?.outline || '#AAA',
  },
  simpleMeaning: {
    ...typography.bodySmall,
    color: theme?.colors?.onSurfaceVariant || '#666',
  },

  // --- Trans Card ---
  transCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFF'),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  transOriginal: {
    ...typography.bodyMedium,
    color: theme?.colors?.onSurface || '#333',
    lineHeight: 22,
  },
  transDivider: {
    height: 1,
    backgroundColor: theme?.colors?.outlineVariant || '#F0F0F0',
    marginVertical: 8,
  },
  transResult: {
    ...typography.bodyMedium,
    color: theme?.colors?.primary || '#6750A4',
    lineHeight: 22,
    fontWeight: '500',
  },

  // --- Empty ---
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    marginTop: 16,
    ...typography.bodyMedium,
    color: theme?.colors?.outline || '#999',
  },
});

export default VocabularyScreen;
