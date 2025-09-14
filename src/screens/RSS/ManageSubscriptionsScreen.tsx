import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { rssService } from '../../services/RSSService';
import { RSSSource } from '../../types/rss';

type NavigationProp = NativeStackNavigationProp<any, 'ManageSubscriptions'>;

const ManageSubscriptionsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();
  const { rssSources, refreshRSSSources } = useRSSSource();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRSSSources();
  }, []);

  const loadRSSSources = async () => {
    try {
      setLoading(true);
      await refreshRSSSources();
    } catch (error) {
      console.error('Error loading RSS sources:', error);
      Alert.alert('加载失败', '无法加载RSS源列表');
    } finally {
      setLoading(false);
    }
  };

  const categories = ['全部', ...Array.from(new Set(rssSources.map(s => s.category)))];
  
  const filteredSources = selectedCategory === '全部' 
    ? rssSources 
    : rssSources.filter(source => source.category === selectedCategory);

  const totalSources = rssSources.length;
  const activeSources = rssSources.filter(s => s.isActive).length;
  const totalArticles = rssSources.reduce((sum, s) => sum + (s.article_count || 0), 0);
  const totalUnread = rssSources.reduce((sum, s) => sum + (s.unread_count || 0), 0);
  const errorSources = rssSources.filter(s => (s.error_count || 0) > 0).length;

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRSSSources();
    setRefreshing(false);
  };

  const toggleSourceStatus = async (sourceId: number) => {
    try {
      const source = rssSources.find(s => s.id === sourceId);
      if (!source) return;

      const newStatus = !source.isActive;
      console.log(`Toggling source ${sourceId} from ${source.isActive} to ${newStatus}`);
      
      await rssService.updateRSSSource(sourceId, { isActive: newStatus });
      console.log(`Database update completed for source ${sourceId}`);
      
      await refreshRSSSources();
      
      console.log(`Local state updated for source ${sourceId}`);
    } catch (error) {
      console.error('Error toggling source status:', error);
      Alert.alert('操作失败', '无法更新RSS源状态');
    }
  };

  const deleteSource = (sourceId: number) => {
    const source = rssSources.find(s => s.id === sourceId);
    Alert.alert(
      '删除RSS源',
      `确定要删除 "${source?.name}" 吗？这将同时删除该源的所有文章。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await rssService.deleteRSSSource(sourceId);
              await refreshRSSSources();
            } catch (error) {
              console.error('Error deleting source:', error);
              Alert.alert('删除失败', '无法删除RSS源');
            }
          },
        },
      ]
    );
  };

  const editSource = (sourceId: number) => {
    navigation.navigate('EditRSSSource', { sourceId });
  };

  const formatLastUpdated = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours}小时前`;
    } else {
      return `${diffDays}天前`;
    }
  };

  const styles = createStyles(isDark, theme);

  return (
    <ScrollView 
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* 统计信息 */}
      <View style={styles.statsSection}>
        <Text style={styles.sectionTitle}>订阅统计</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{totalSources}</Text>
            <Text style={styles.statLabel}>总订阅源</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: theme?.colors?.primary }]}>{activeSources}</Text>
            <Text style={styles.statLabel}>活跃源</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{totalArticles}</Text>
            <Text style={styles.statLabel}>总文章</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: theme?.colors?.tertiary }]}>{totalUnread}</Text>
            <Text style={styles.statLabel}>未读</Text>
          </View>
        </View>
        
        {errorSources > 0 && (
          <View style={styles.errorAlert}>
            <MaterialIcons 
              name="warning" 
              size={20} 
              color={theme?.colors?.error || '#B3261E'} 
            />
            <Text style={styles.errorText}>
              {errorSources} 个RSS源存在获取错误
            </Text>
          </View>
        )}
      </View>

      {/* 分类筛选 */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.filterChip,
                selectedCategory === category && styles.filterChipSelected
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={[
                styles.filterChipText,
                selectedCategory === category && styles.filterChipTextSelected
              ]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* RSS源列表 */}
      <View style={styles.sourcesSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>订阅源管理</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddRSSSource')}
          >
            <MaterialIcons name="add" size={20} color={theme?.colors?.primary} />
            <Text style={styles.addButtonText}>添加</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sourcesList}>
          {filteredSources.map((source) => (
            <View key={source.id} style={styles.sourceItem}>
              <View style={styles.sourceHeader}>
                <View style={styles.sourceInfo}>
                  <View style={styles.sourceTitleRow}>
                    <View style={styles.sourceNameContainer}>
                      <Text style={styles.sourceName}>{source.name}</Text>
                      <View style={styles.contentTypeBadge}>
                        <MaterialIcons 
                          name={source.contentType === 'text' ? 'text-fields' : 'image'} 
                          size={12} 
                          color={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')} 
                        />
                        <Text style={styles.contentTypeText}>
                          {source.contentType === 'text' ? '纯文本' : '图文'}
                        </Text>
                      </View>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      source.isActive ? styles.activeBadge : styles.inactiveBadge
                    ]}>
                      <Text style={[
                        styles.statusText,
                        source.isActive ? styles.activeText : styles.inactiveText
                      ]}>
                        {source.isActive ? '活跃' : '暂停'}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={styles.sourceUrl}>{source.url}</Text>
                  {source.description && (
                    <Text style={styles.sourceDescription}>{source.description}</Text>
                  )}
                  
                  {(source.error_count || 0) > 0 && (
                    <View style={styles.sourceMetaRow}>
                      <View style={styles.errorBadge}>
                        <MaterialIcons name="error" size={12} color={theme?.colors?.error} />
                        <Text style={styles.errorBadgeText}>{source.error_count} 错误</Text>
                      </View>
                    </View>
                  )}
                  
                  <View style={styles.sourceStats}>
                    <Text style={styles.sourceStatsText}>
                      {source.article_count || 0} 篇文章 • {source.unread_count || 0} 篇未读 • {formatLastUpdated(new Date(source.last_updated || Date.now()))}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.sourceActions}>
                <View style={styles.switchContainer}>
                  <Text style={styles.switchLabel}>启用</Text>
                  <Switch
                    value={source.isActive}
                    onValueChange={() => toggleSourceStatus(source.id)}
                    trackColor={{
                      false: theme?.colors?.outline || (isDark ? '#79747E' : '#79747E'),
                      true: theme?.colors?.primary || '#3B82F6'
                    }}
                    thumbColor={source.isActive ? theme?.colors?.onPrimary : theme?.colors?.onSurfaceVariant}
                  />
                </View>
                
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => editSource(source.id)}
                  >
                    <MaterialIcons 
                      name="edit" 
                      size={20} 
                      color={theme?.colors?.onSurfaceVariant} 
                    />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => deleteSource(source.id)}
                  >
                    <MaterialIcons 
                      name="delete" 
                      size={20} 
                      color={theme?.colors?.error || '#B3261E'} 
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>

        {filteredSources.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons 
              name="rss-feed" 
              size={48} 
              color={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')} 
            />
            <Text style={styles.emptyStateTitle}>暂无订阅源</Text>
            <Text style={styles.emptyStateText}>
              {selectedCategory === '全部' ? '还没有添加任何RSS源' : `${selectedCategory}分类下暂无订阅源`}
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => navigation.navigate('AddRSSSource')}
            >
              <Text style={styles.emptyStateButtonText}>添加第一个RSS源</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#FFFFFF'),
  },
  statsSection: {
    padding: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  statLabel: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginTop: 4,
    textAlign: 'center',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.errorContainer || (isDark ? '#601410' : '#F9DEDC'),
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: theme?.colors?.onErrorContainer || (isDark ? '#F2B8B5' : '#601410'),
    marginLeft: 8,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChip: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipSelected: {
    backgroundColor: theme?.colors?.primary || '#3B82F6',
  },
  filterChipText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  filterChipTextSelected: {
    color: theme?.colors?.onPrimary || '#FFFFFF',
    fontWeight: '500',
  },
  sourcesSection: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#004A77' : '#CCE7FF'),
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.primary || '#3B82F6',
  },
  sourcesList: {
    gap: 12,
  },
  sourceItem: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
  },
  sourceHeader: {
    marginBottom: 12,
  },
  sourceInfo: {
    flex: 1,
  },
  sourceTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sourceNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  activeBadge: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#004A77' : '#CCE7FF'),
  },
  inactiveBadge: {
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E7E0EC'),
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  activeText: {
    color: theme?.colors?.primary || '#3B82F6',
  },
  inactiveText: {
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  sourceUrl: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginBottom: 4,
  },
  sourceDescription: {
    fontSize: 14,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 8,
  },
  sourceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  contentTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  contentTypeText: {
    fontSize: 10,
    fontWeight: '500',
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  sourceStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceStatsText: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    flex: 1,
  },
  errorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.errorContainer || (isDark ? '#601410' : '#F9DEDC'),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  errorBadgeText: {
    fontSize: 10,
    color: theme?.colors?.onErrorContainer || (isDark ? '#F2B8B5' : '#601410'),
  },
  sourceActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#CAC4D0'),
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E7E0EC'),
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: theme?.colors?.primary || '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onPrimary || '#FFFFFF',
  },
});

export default ManageSubscriptionsScreen;