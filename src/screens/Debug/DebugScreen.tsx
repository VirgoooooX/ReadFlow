import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { DatabaseService } from '../../database/DatabaseService';

const DebugScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const [articles, setArticles] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const styles = createStyles(isDark, theme);

  const loadData = async () => {
    try {
      setLoading(true);
      const db = DatabaseService.getInstance();
      
      // 获取最新的10篇文章
      const articlesResult = await db.executeQuery(
        'SELECT id, title, image_url, source_name FROM articles ORDER BY id DESC LIMIT 10'
      );
      setArticles(articlesResult);
      
      // 获取RSS源
      const sourcesResult = await db.executeQuery(
        'SELECT id, title, content_type, article_count FROM rss_sources ORDER BY id'
      );
      setSources(sourcesResult);
      
    } catch (error) {
      console.error('DebugScreen - 加载数据失败:', error);
      Alert.alert('错误', '加载数据失败: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[theme?.colors?.primary || '#3B82F6']}
        />
      }
    >
      <View style={styles.header}>
        <MaterialIcons 
          name="bug-report" 
          size={32} 
          color={theme?.colors?.primary || '#3B82F6'} 
        />
        <Text style={styles.title}>调试信息</Text>
        <Text style={styles.subtitle}>数据库内容查看</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RSS源信息</Text>
          <TouchableOpacity onPress={loadData}>
            <MaterialIcons 
              name="refresh" 
              size={24} 
              color={theme?.colors?.primary || '#3B82F6'} 
            />
          </TouchableOpacity>
        </View>
        
        {sources.map((source) => (
          <View key={source.id} style={styles.card}>
            <Text style={styles.sourceName}>{source.title}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>内容类型:</Text>
              <Text style={styles.value}>{source.content_type}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>文章数量:</Text>
              <Text style={styles.value}>{source.article_count}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>最新文章</Text>
          <TouchableOpacity onPress={loadData}>
            <MaterialIcons 
              name="refresh" 
              size={24} 
              color={theme?.colors?.primary || '#3B82F6'} 
            />
          </TouchableOpacity>
        </View>
        
        {articles.map((article) => (
          <View key={article.id} style={styles.card}>
            <Text style={styles.articleTitle} numberOfLines={2}>
              {article.title}
            </Text>
            <View style={styles.row}>
              <Text style={styles.label}>来源:</Text>
              <Text style={styles.value}>{article.source_name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>有图片:</Text>
              <Text style={[styles.value, { color: article.image_url ? 'green' : 'red' }]}>
                {article.image_url ? '是' : '否'}
              </Text>
            </View>
            {article.image_url ? (
              <View style={styles.row}>
                <Text style={styles.label}>图片URL:</Text>
                <Text style={[styles.value, styles.imageUrl]} numberOfLines={2}>
                  {article.image_url}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>统计信息</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>文章总数:</Text>
            <Text style={styles.value}>{articles.length}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>有图片文章:</Text>
            <Text style={styles.value}>
              {articles.filter(a => a.image_url).length}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>无图片文章:</Text>
            <Text style={styles.value}>
              {articles.filter(a => !a.image_url).length}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>图片比例:</Text>
            <Text style={styles.value}>
              {articles.length > 0 
                ? `${((articles.filter(a => a.image_url).length / articles.length) * 100).toFixed(1)}%` 
                : '0%'}
            </Text>
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
      padding: 24,
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginTop: 12,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 16,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    },
    section: {
      padding: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    },
    card: {
      backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    sourceName: {
      fontSize: 18,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 8,
    },
    articleTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    label: {
      fontSize: 14,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
      width: 80,
    },
    value: {
      fontSize: 14,
      color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
      flex: 1,
    },
    imageUrl: {
      fontSize: 12,
    },
  });

export default DebugScreen;