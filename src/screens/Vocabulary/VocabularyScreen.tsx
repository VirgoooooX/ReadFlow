import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { VocabularyStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';

type Props = VocabularyStackScreenProps<'VocabularyMain'>;

const VocabularyScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();

  const styles = createStyles(isDark, theme);

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
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>89</Text>
            <Text style={styles.statLabel}>总单词数</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>23</Text>
            <Text style={styles.statLabel}>今日复习</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>76%</Text>
            <Text style={styles.statLabel}>掌握率</Text>
          </View>
        </View>

        <View style={styles.actionSection}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleAddWord}>
            <MaterialIcons name="add" size={24} color={theme?.colors?.onPrimary || '#FFFFFF'} />
            <Text style={styles.primaryButtonText}>添加单词</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleReviewSession}>
            <MaterialIcons name="quiz" size={24} color={theme?.colors?.primary || '#3B82F6'} />
            <Text style={styles.secondaryButtonText}>开始复习</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>最近添加</Text>
            <TouchableOpacity onPress={handleViewStats}>
              <Text style={styles.viewAllText}>查看统计</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.wordList}>
            {[
              { id: 1, word: 'algorithm', meaning: '算法', level: 'mastered' },
              { id: 2, word: 'implementation', meaning: '实现', level: 'learning' },
              { id: 3, word: 'optimization', meaning: '优化', level: 'new' },
              { id: 4, word: 'architecture', meaning: '架构', level: 'learning' },
              { id: 5, word: 'scalability', meaning: '可扩展性', level: 'new' },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.wordItem}
                onPress={() => handleWordDetail(item.id)}
              >
                <View style={styles.wordContent}>
                  <Text style={styles.wordText}>{item.word}</Text>
                  <Text style={styles.meaningText}>{item.meaning}</Text>
                </View>
                <View style={styles.wordMeta}>
                  <View style={[styles.levelBadge, styles[`level_${item.level}`]]}>
                    <Text style={[styles.levelText, styles[`levelText_${item.level}`]]}>
                      {item.level === 'mastered' ? '已掌握' : 
                       item.level === 'learning' ? '学习中' : '新单词'}
                    </Text>
                  </View>
                  <MaterialIcons 
                    name="chevron-right" 
                    size={20} 
                    color={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')} 
                  />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.learningToolsTitle]}>学习工具</Text>
          <View style={styles.toolsList}>
            <TouchableOpacity style={styles.toolItem}>
              <MaterialIcons name="spellcheck" size={32} color={theme?.colors?.primary || '#3B82F6'} />
              <View style={styles.toolContent}>
                <Text style={styles.toolTitle}>拼写练习</Text>
                <Text style={styles.toolDescription}>通过拼写加深记忆</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolItem}>
              <MaterialIcons name="hearing" size={32} color={theme?.colors?.primary || '#3B82F6'} />
              <View style={styles.toolContent}>
                <Text style={styles.toolTitle}>听力练习</Text>
                <Text style={styles.toolDescription}>提升听音辨词能力</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolItem}>
              <MaterialIcons name="quiz" size={32} color={theme?.colors?.primary || '#3B82F6'} />
              <View style={styles.toolContent}>
                <Text style={styles.toolTitle}>选择题</Text>
                <Text style={styles.toolDescription}>多选题巩固理解</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
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
    learningToolsTitle: {
      marginBottom: 24,
    },
    viewAllText: {
      fontSize: 14,
      color: theme?.colors?.primary || '#3B82F6',
      fontWeight: '500',
    },
    wordList: {
      gap: 8,
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
    toolsList: {
      gap: 12,
    },
    toolItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
      padding: 16,

    },
    toolContent: {
      marginLeft: 16,
      flex: 1,
    },
    toolTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 2,
    },
    toolDescription: {
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
  });

export default VocabularyScreen;