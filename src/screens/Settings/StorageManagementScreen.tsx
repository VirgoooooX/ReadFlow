import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { imageCacheService, DatabaseService } from '../../services';
import cacheEventEmitter from '../../services/CacheEventEmitter';

const StorageManagementScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation();
  const styles = createStyles(isDark, theme);

  const [imageCacheSize, setImageCacheSize] = useState<string>('计算中...');
  const [articleDataSize, setArticleDataSize] = useState<string>('计算中...');
  const [totalCacheSize, setTotalCacheSize] = useState<string>('计算中...');
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    updateCacheSize();
  }, []);

  const updateCacheSize = async () => {
    try {
      // 获取图片缓存大小
      const imageSize = await imageCacheService.getCacheSize();
      const imageSizeInMB = (imageSize / (1024 * 1024)).toFixed(2);
      setImageCacheSize(`${imageSizeInMB} MB`);

      // 获取文章数据大小（估算）
      const db = DatabaseService.getInstance();
      const articlesResult = await db.executeQuery(
        'SELECT SUM(LENGTH(content) + LENGTH(title) + LENGTH(summary)) as total_size FROM articles'
      );
      const articleSize = articlesResult[0]?.total_size || 0;
      const articleSizeInMB = (articleSize / (1024 * 1024)).toFixed(2);
      setArticleDataSize(`${articleSizeInMB} MB`);

      // 计算总大小
      const totalSize = imageSize + articleSize;
      const totalSizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
      setTotalCacheSize(`${totalSizeInMB} MB`);
    } catch (error) {
      console.error('更新缓存大小失败:', error);
      setImageCacheSize('未知');
      setArticleDataSize('未知');
      setTotalCacheSize('未知');
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      '清除所有数据',
      `确定要清除所有文章数据和图片缓存吗？

当前文章数据: ${articleDataSize}
当前图片缓存: ${imageCacheSize}
总计: ${totalCacheSize}

清除后需要重新刷新RSS源来获取文章。`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            await performClearCache();
          },
        },
      ]
    );
  };

  const performClearCache = async () => {
    setIsClearing(true);
    try {
      const db = DatabaseService.getInstance();

      // 1. 清除所有文章数据
      await db.executeStatement('DELETE FROM articles');
      console.log('✅ 文章数据已清除');

      // 2. 清除图片缓存
      await imageCacheService.cleanCache(0);
      console.log('✅ 图片缓存已清除');

      // 3. 重置 RSS 源的文章计数
      await db.executeStatement('UPDATE rss_sources SET article_count = 0, unread_count = 0');
      console.log('✅ RSS源计数已重置');

      // 4. 【新增】触发全局清除缓存事件，通知 HomeScreen 清除 tabDataMap
      cacheEventEmitter.clearAll();
      console.log('✅ 缓存清除事件已触发');

      // 5. 【修复】触发 RSS 统计更新事件，通知订阅源页面刷新
      cacheEventEmitter.updateRSSStats();
      console.log('✅ RSS统计更新事件已触发');

      await updateCacheSize();

      Alert.alert(
        '清除成功',
        `已成功清除：

• 文章数据
• 图片缓存
• RSS源计数

请到首页下拉刷新RSS源来获取文章。`,
        [
          {
            text: '好的',
            onPress: () => {
              // 返回上一页
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error) {
      console.error('清除缓存失败:', error);
      Alert.alert('失败', '清除缓存时出错：' + (error as any).message);
    } finally {
      setIsClearing(false);
    }
  };

  const StorageItem = ({ icon, label, size, onPress }: any) => (
    <TouchableOpacity style={styles.storageItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.storageItemLeft}>
        <View style={[styles.storageIcon, { backgroundColor: `${theme?.colors?.primary || '#3B82F6'}15` }]}>
          <MaterialIcons name={icon} size={24} color={theme?.colors?.primary || '#3B82F6'} />
        </View>
        <View>
          <Text style={styles.storageLabel}>{label}</Text>
          <Text style={styles.storageSize}>{size}</Text>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#999'} />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 总览卡片 */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewIconBox}>
            <MaterialIcons name="storage" size={40} color={theme?.colors?.primary || '#3B82F6'} />
          </View>
          <View style={styles.overviewContent}>
            <Text style={styles.overviewTitle}>总存储占用</Text>
            <Text style={styles.overviewSize}>{totalCacheSize}</Text>
          </View>
        </View>

        {/* 存储详情 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>存储详情</Text>

          <StorageItem
            icon="image"
            label="图片缓存"
            size={imageCacheSize}
            onPress={() => {}}
          />
          <StorageItem
            icon="article"
            label="文章数据"
            size={articleDataSize}
            onPress={() => {}}
          />
        </View>

        {/* 说明 */}
        <View style={styles.infoSection}>
          <View style={styles.infoBox}>
            <MaterialIcons name="info" size={20} color={theme?.colors?.primary || '#3B82F6'} />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>缓存说明</Text>
              <Text style={styles.infoDesc}>
                应用会自动缓存已读文章和图片以加快显示速度。清除缓存后，需要重新刷新RSS源来获取数据。
              </Text>
            </View>
          </View>
        </View>

        {/* 操作按钮 */}
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={[styles.clearButton, isClearing && styles.clearButtonDisabled]}
            onPress={handleClearCache}
            disabled={isClearing}
          >
            {isClearing ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.clearButtonText}>清除中...</Text>
              </>
            ) : (
              <>
                <MaterialIcons name="delete-sweep" size={20} color="#fff" />
                <Text style={styles.clearButtonText}>清除所有数据</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.warningText}>
            ⚠️ 清除后无法恢复，请谨慎操作
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
      paddingHorizontal: 16,
    },
    content: {
      paddingTop: 12,
      paddingBottom: 20,
    },

    // 总览卡片
    overviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
      padding: 16,
      borderRadius: 12,
      marginBottom: 20,
      // 投影效果
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    overviewIconBox: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: `${theme?.colors?.primary || '#3B82F6'}15`,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    overviewContent: {
      flex: 1,
    },
    overviewTitle: {
      fontSize: 12,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      marginBottom: 4,
    },
    overviewSize: {
      fontSize: 26,
      fontWeight: '700',
      color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    },

    // 分组
    section: {
      marginBottom: 20,
    },
  sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      marginBottom: 10,
      marginTop: -5,  // 👈 增加与上方容器的距离
      textTransform: 'uppercase',
      letterSpacing: 0.3,
  },

    // 存储项
    storageItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
      padding: 14,
      borderRadius: 12,
      marginBottom: 10,
      // 投影效果
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    storageItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    storageIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    storageLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
      marginBottom: 3,
    },
    storageSize: {
      fontSize: 12,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    },

    // 信息区
    infoSection: {
      marginBottom: 20,
    },
    infoBox: {
      flexDirection: 'row',
      backgroundColor: `${theme?.colors?.primary || '#3B82F6'}08`,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${theme?.colors?.primary || '#3B82F6'}15`,
    },
    infoText: {
      flex: 1,
      marginLeft: 12,
    },
    infoTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme?.colors?.primary || '#3B82F6',
      marginBottom: 4,
    },
    infoDesc: {
      fontSize: 12,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      lineHeight: 18,
    },

    // 操作
    actionSection: {
      marginBottom: 40,
    },
    clearButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#EF4444',
      padding: 14,
      borderRadius: 12,
      gap: 8,
      // 投影效果
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    clearButtonDisabled: {
      opacity: 0.6,
    },
    clearButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
    },
    warningText: {
      fontSize: 12,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      textAlign: 'center',
      marginTop: 12,
    },
  });

export default StorageManagementScreen;
