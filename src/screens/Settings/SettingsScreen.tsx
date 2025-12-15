import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { imageCacheService, DatabaseService } from '../../services';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../../navigation/AppNavigator';

type SettingsScreenNavigationProp = NativeStackNavigationProp<SettingsStackParamList>;

const SettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const [cacheSize, setCacheSize] = useState<string>('计算中...');
  const styles = createStyles(isDark, theme);

  // 初始化时获取缓存大小
  useEffect(() => {
    updateCacheSize();
  }, []);

  const updateCacheSize = async () => {
    try {
      const size = await imageCacheService.getCacheSize();
      const sizeInMB = (size / (1024 * 1024)).toFixed(2);
      setCacheSize(`${sizeInMB} MB`);
    } catch (error) {
      setCacheSize('未知');
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      '清除缓存',
      `确定要清除所有文章数据和图片缓存吗？

当前图片缓存: ${cacheSize}

清除后需要重新刷新RSS源来获取文章。`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '清除',
          onPress: async () => {
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
              
              await updateCacheSize();
              
              Alert.alert(
                '成功',
                '所有文章数据和图片缓存已清除\n\n请到首页下拉刷新RSS源来获取文章。',
                [
                  {
                    text: '好的',
                    onPress: () => {
                      // 跳转到首页
                      navigation.navigate('Articles' as any);
                    },
                  },
                ]
              );
            } catch (error) {
              console.error('清除缓存失败:', error);
              Alert.alert('失败', '清除缓存时出错');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleAbout = () => {
    navigation.navigate('About');
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 阅读设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>阅读设置</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => navigation.navigate('ReadingSettings')}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="chrome-reader-mode" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemText}>阅读偏好</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>
        </View>

        {/* RSS设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RSS设置</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => navigation.navigate('ManageSubscriptions')}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="rss-feed" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemText}>RSS源管理</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>
        </View>

        {/* LLM设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI设置</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => navigation.navigate('LLMSettings')}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="psychology" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemText}>AI助手配置</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>
        </View>

        {/* 通用设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>通用设置</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => navigation.navigate('ThemeSettings')}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="palette" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemText}>主题自定义</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>
        </View>

        {/* 存储管理 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>存储管理</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleClearCache}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="delete" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemText}>清除所有数据</Text>
                <Text style={styles.settingItemDesc}>图片: {cacheSize}</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>
        </View>

        {/* 应用信息 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>应用信息</Text>
                  <TouchableOpacity
            style={styles.settingItem}
            onPress={handleAbout}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="info" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemText}>关于应用</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 12,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    marginBottom: 8,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingItemContent: {
    marginLeft: 16,
    flex: 1,
  },
  settingItemText: {
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  settingItemDesc: {
    fontSize: 13,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginTop: 4,
  },
});

export default SettingsScreen;