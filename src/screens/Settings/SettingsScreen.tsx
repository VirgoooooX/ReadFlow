import React, { useState } from 'react';
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../../navigation/AppNavigator';
import { ArticleService } from '../../services/ArticleService';

type SettingsScreenNavigationProp = NativeStackNavigationProp<SettingsStackParamList>;

const SettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const styles = createStyles(isDark, theme);

  const handleStorageManagement = () => {
    Alert.alert('存储管理', '清理缓存功能开发中...');
  };

  const handleExport = () => {
    Alert.alert('导出数据', '数据导出功能开发中...');
  };

  const handleImport = () => {
    Alert.alert('导入数据', '数据导入功能开发中...');
  };

  const handleReprocessArticles = async () => {
    Alert.alert(
      '重新处理文章',
      '这将使用新的RSS清理程序重新处理数据库中的所有文章内容，可能需要一些时间。是否继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            try {
              const articleService = ArticleService.getInstance();
              const result = await articleService.reprocessAllArticles();
              Alert.alert(
                '处理完成',
                `成功重新处理了 ${result.updated} 篇文章（共检查 ${result.processed} 篇）`
              );
            } catch (error) {
              console.error('重新处理文章失败:', error);
              Alert.alert('处理失败', '重新处理文章时发生错误，请稍后重试');
            }
          }
        }
      ]
    );
  };

  const handleAbout = () => {
    Alert.alert('关于应用', 'TechFlow Mobile v1.0.0\n\n一个专注于技术文章阅读的RSS应用');
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
              <Text style={styles.settingItemText}>阅读偏好</Text>
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
              <Text style={styles.settingItemText}>RSS源管理</Text>
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
              <Text style={styles.settingItemText}>AI助手配置</Text>
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
              <Text style={styles.settingItemText}>主题自定义</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleStorageManagement}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="storage" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.settingItemText}>存储管理</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>
        </View>

        {/* 数据管理 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>数据管理</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleExport}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="file-upload" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.settingItemText}>导出数据</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleImport}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="file-download" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.settingItemText}>导入数据</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleReprocessArticles}
          >
            <View style={styles.settingItemLeft}>
              <MaterialIcons name="refresh" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.settingItemText}>重新处理文章</Text>
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
              <Text style={styles.settingItemText}>关于应用</Text>
            </View>
            <Text style={styles.versionText}>v1.0.0</Text>
          </TouchableOpacity>
        </View>

        {/* 使用统计 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>使用统计</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>128</Text>
              <Text style={styles.statLabel}>已读文章</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>45</Text>
              <Text style={styles.statLabel}>收藏单词</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>12</Text>
              <Text style={styles.statLabel}>RSS源</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>30</Text>
              <Text style={styles.statLabel}>学习天数</Text>
            </View>
          </View>
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
  settingItemText: {
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginLeft: 12,
  },
  versionText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    paddingVertical: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme?.colors?.primary || '#3B82F6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    textAlign: 'center',
  },
});

export default SettingsScreen;