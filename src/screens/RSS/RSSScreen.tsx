import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { RSSStackScreenProps } from '../../navigation/types';
import { useThemeContext } from '../../theme';

type Props = RSSStackScreenProps<'RSSMain'>;

const RSSScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();

  const styles = createStyles(isDark, theme);

  const handleAddRSSSource = () => {
    navigation.navigate('AddRSSSource');
  };

  const handleRSSSettings = () => {
    navigation.navigate('ManageSubscriptions');
  };

  const handleSourceDetail = (sourceId: number) => {
    navigation.navigate('RSSSourceDetail', { sourceId });
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <MaterialIcons 
          name="rss-feed" 
          size={48} 
          color={theme?.colors?.primary || '#3B82F6'} 
        />
        <Text style={styles.title}>RSS订阅</Text>
        <Text style={styles.subtitle}>聚合优质技术内容</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>12</Text>
            <Text style={styles.statLabel}>订阅源</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>156</Text>
            <Text style={styles.statLabel}>总文章</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>23</Text>
            <Text style={styles.statLabel}>未读</Text>
          </View>
        </View>

        <View style={styles.actionSection}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleAddRSSSource}>
            <MaterialIcons name="add" size={24} color={theme?.colors?.onPrimary || '#FFFFFF'} />
            <Text style={styles.primaryButtonText}>添加RSS源</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleRSSSettings}>
            <MaterialIcons name="settings" size={24} color={theme?.colors?.primary || '#3B82F6'} />
            <Text style={styles.secondaryButtonText}>RSS设置</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>我的订阅</Text>
          <View style={styles.sourceList}>
            {[
              { id: 1, name: 'TechCrunch', url: 'https://techcrunch.com/feed/', articles: 45, unread: 8, active: true },
              { id: 2, name: 'Hacker News', url: 'https://hnrss.org/frontpage', articles: 32, unread: 12, active: true },
              { id: 3, name: 'GitHub Blog', url: 'https://github.blog/feed/', articles: 28, unread: 3, active: true },
              { id: 4, name: 'Stack Overflow Blog', url: 'https://stackoverflow.blog/feed/', articles: 19, unread: 0, active: false },
              { id: 5, name: 'Dev.to', url: 'https://dev.to/feed', articles: 67, unread: 15, active: true },
            ].map((source) => (
              <TouchableOpacity
                key={source.id}
                style={styles.sourceItem}
                onPress={() => handleSourceDetail(source.id)}
              >
                <View style={styles.sourceIcon}>
                  <MaterialIcons 
                    name="rss-feed" 
                    size={24} 
                    color={source.active ? (theme?.colors?.primary || '#3B82F6') : (theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'))} 
                  />
                </View>
                <View style={styles.sourceContent}>
                  <Text style={styles.sourceName}>{source.name}</Text>
                  <Text style={styles.sourceUrl}>{source.url}</Text>
                  <View style={styles.sourceStats}>
                    <Text style={styles.sourceStatsText}>
                      {source.articles} 篇文章 • {source.unread} 篇未读
                    </Text>
                  </View>
                </View>
                <View style={styles.sourceMeta}>
                  <View style={[styles.statusBadge, source.active ? styles.activeBadge : styles.inactiveBadge]}>
                    <Text style={[styles.statusText, source.active ? styles.activeText : styles.inactiveText]}>
                      {source.active ? '活跃' : '暂停'}
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
          <Text style={styles.sectionTitle}>推荐RSS源</Text>
          <View style={styles.recommendList}>
            {[
              { name: 'MIT Technology Review', category: '科技前沿', description: '权威科技资讯与深度分析' },
              { name: 'Ars Technica', category: '技术评测', description: '专业的技术产品评测' },
              { name: 'Wired', category: '科技文化', description: '科技与文化的交汇点' },
              { name: 'The Verge', category: '数码科技', description: '最新数码产品资讯' },
            ].map((item, index) => (
              <View key={index} style={styles.recommendItem}>
                <View style={styles.recommendContent}>
                  <Text style={styles.recommendName}>{item.name}</Text>
                  <Text style={styles.recommendCategory}>{item.category}</Text>
                  <Text style={styles.recommendDescription}>{item.description}</Text>
                </View>
                <TouchableOpacity style={styles.addButton}>
                  <MaterialIcons name="add" size={20} color={theme?.colors?.primary || '#3B82F6'} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>同步设置</Text>
          <View style={styles.settingsList}>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>自动更新频率</Text>
              <Text style={styles.settingValue}>每小时</Text>
            </View>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>仅WiFi更新</Text>
              <Text style={styles.settingValue}>开启</Text>
            </View>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>保留文章天数</Text>
              <Text style={styles.settingValue}>30天</Text>
            </View>
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
    header: {
      alignItems: 'center',
      padding: 32,
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginTop: 16,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 16,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
    content: {
      padding: 16,
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
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 16,
    },
    sourceList: {
      gap: 12,
    },
    sourceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
      padding: 16,
    },
    sourceIcon: {
      marginRight: 12,
    },
    sourceContent: {
      flex: 1,
    },
    sourceName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 2,
    },
    sourceUrl: {
      fontSize: 12,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      marginBottom: 4,
    },
    sourceStats: {
      flexDirection: 'row',
    },
    sourceStatsText: {
      fontSize: 12,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
    sourceMeta: {
      alignItems: 'center',
      gap: 8,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    activeBadge: {
      backgroundColor: theme?.colors?.successContainer || (isDark ? '#1A4D1A' : '#E8F5E8'),
    },
    inactiveBadge: {
      backgroundColor: theme?.colors?.errorContainer || (isDark ? '#4D1A1A' : '#FFEBEE'),
    },
    statusText: {
      fontSize: 10,
      fontWeight: '500',
    },
    activeText: {
      color: theme?.colors?.onSuccessContainer || (isDark ? '#A5D6A5' : '#2E7D32'),
    },
    inactiveText: {
      color: theme?.colors?.onErrorContainer || (isDark ? '#F5A5A5' : '#C62828'),
    },
    recommendList: {
      gap: 12,
    },
    recommendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
      padding: 16,
    },
    recommendContent: {
      flex: 1,
    },
    recommendName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 2,
    },
    recommendCategory: {
      fontSize: 12,
      color: theme?.colors?.primary || '#3B82F6',
      fontWeight: '500',
      marginBottom: 4,
    },
    recommendDescription: {
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
    addButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#E8DEF8' : '#F7F2FA'),
    },
    settingsList: {
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
    },
    settingItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,

    },
    settingLabel: {
      fontSize: 16,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    settingValue: {
      fontSize: 16,
      color: theme?.colors?.primary || '#3B82F6',
      fontWeight: '500',
    },
  });

export default RSSScreen;