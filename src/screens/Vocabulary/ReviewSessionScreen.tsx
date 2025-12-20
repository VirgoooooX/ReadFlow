import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { vocabularyService } from '../../services/VocabularyService';
import { VocabularyEntry } from '../../types';
import { useNavigation } from '@react-navigation/native';
import { stripHtmlTags } from '../../utils/stringUtils';
import * as StyleUtils from '../../utils/styleUtils';
const ReviewSessionScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState<VocabularyEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const styles = createStyles(isDark, theme);

  useEffect(() => {
    loadReviewWords();
  }, []);

  const loadReviewWords = async () => {
    try {
      setLoading(true);
      const reviewWords = await vocabularyService.getWordsForReview(50);
      
      if (reviewWords.length === 0) {
        Alert.alert('暂无复习', '当前没有需要复习的单词', [
          { text: '确定', onPress: () => navigation.goBack() }
        ]);
        return;
      }
      
      setWords(reviewWords);
    } catch (error) {
      console.error('Failed to load review words:', error);
      Alert.alert('加载失败', '无法加载复习单词');
    } finally {
      setLoading(false);
    }
  };

  const handleKnow = async () => {
    if (currentIndex >= words.length) return;
    
    const word = words[currentIndex];
    if (word.id) {
      await vocabularyService.recordReview(word.id, true);
    }
    
    moveToNext();
  };

  const handleDontKnow = async () => {
    if (currentIndex >= words.length) return;
    
    const word = words[currentIndex];
    if (word.id) {
      await vocabularyService.recordReview(word.id, false);
    }
    
    moveToNext();
  };

  const moveToNext = () => {
    setReviewedCount(prev => prev + 1);
    setShowDefinition(false);
    
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      Alert.alert(
        '复习完成',
        `已完成 ${words.length} 个单词的复习！`,
        [{ text: '确定', onPress: () => navigation.goBack() }]
      );
    }
  };

  const currentWord = words[currentIndex];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme?.colors?.primary} />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  if (!currentWord) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>暂无复习单词</Text>
      </View>
    );
  }

  const getDefinitionText = () => {
    if (!currentWord.definition) return '暂无释义';
    
    if (typeof currentWord.definition === 'string') {
      return currentWord.definition;
    }
    
    if (currentWord.definition.definitions && currentWord.definition.definitions.length > 0) {
      return currentWord.definition.definitions[0].translation || '暂无释义';
    }
    
    return '暂无释义';
  };

  return (
    <View style={styles.container}>
      {/* 进度条 */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${((currentIndex + 1) / words.length) * 100}%` }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {words.length}
        </Text>
      </View>

      {/* 单词卡片 */}
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <Text style={styles.wordText}>{currentWord.word}</Text>
          
          {currentWord.context && (
            <View style={styles.contextContainer}>
              <Text style={styles.contextLabel}>例句:</Text>
              {/* 【修改】在这里调用 stripHtmlTags 函数 */}
              <Text style={styles.contextText}>
                {stripHtmlTags(currentWord.context)}
              </Text>
            </View>
          )}
          {/* 释义区域 - 默认隐藏 */}
          {showDefinition ? (
            <View style={styles.definitionContainer}>
              <Text style={styles.definitionLabel}>释义:</Text>
              <Text style={styles.definitionText}>
                {getDefinitionText()}
              </Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.showButton}
              onPress={() => setShowDefinition(true)}
            >
              <MaterialIcons name="visibility" size={24} color={theme?.colors?.primary} />
              <Text style={styles.showButtonText}>显示释义</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 操作按钮 */}
      {showDefinition && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.dontKnowButton]}
            onPress={handleDontKnow}
          >
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>不认识</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.knowButton]}
            onPress={handleKnow}
          >
            <MaterialIcons name="check" size={28} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>认识</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  progressContainer: {
    padding: 20,
    paddingBottom: 10,
  },
  progressBar: {
    height: 8,
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E6E0E9'),
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme?.colors?.primary || '#3B82F6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    textAlign: 'center',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 16,
    padding: 32,
    minHeight: 300,
    justifyContent: 'center',
  },
  wordText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    textAlign: 'center',
    marginBottom: 24,
  },
  contextContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E6E0E9'),
    borderRadius: 12,
  },
  contextLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginBottom: 8,
  },
  contextText: {
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    lineHeight: 24,
  },
  definitionContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#004A77' : '#CCE7FF'),
    borderRadius: 12,
  },
  definitionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme?.colors?.onPrimaryContainer || (isDark ? '#CCE7FF' : '#004A77'),
    marginBottom: 8,
  },
  definitionText: {
    fontSize: 18,
    fontWeight: '500',
    color: theme?.colors?.onPrimaryContainer || (isDark ? '#CCE7FF' : '#004A77'),
    lineHeight: 26,
  },
  showButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E6E0E9'),
    borderRadius: 12,
  },
  showButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.primary || '#3B82F6',
    marginLeft: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 16,
    gap: 8,
  },
  dontKnowButton: {
    backgroundColor: theme?.colors?.error || '#B3261E',
  },
  knowButton: {
    backgroundColor: '#22C55E',
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ReviewSessionScreen;
