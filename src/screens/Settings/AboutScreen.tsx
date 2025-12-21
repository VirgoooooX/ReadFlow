import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { APP_VERSION, APP_INFO } from '../../constants/appVersion';

const AboutScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 应用头部 */}
        <View style={styles.headerSection}>
          <View style={styles.appIcon}>
            <MaterialIcons name="menu-book" size={48} color="#FFFFFF" />
          </View>
          <Text style={styles.appName}>{APP_INFO.name}</Text>
          <Text style={styles.appDesc}>{APP_INFO.description}</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v{APP_VERSION.version}</Text>
          </View>
        </View>

        {/* 版本信息 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>版本信息</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>版本号</Text>
              <Text style={styles.infoValue}>{APP_VERSION.version}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>构建号</Text>
              <Text style={styles.infoValue}>{APP_VERSION.buildNumber}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>更新时间</Text>
              <Text style={styles.infoValue}>{APP_VERSION.updateTime}</Text>
            </View>
          </View>
        </View>

        {/* 更新内容 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>更新内容</Text>
          <View style={styles.card}>
            {APP_VERSION.changelog.map((item, index) => (
              <View key={index} style={styles.changelogItem}>
                <MaterialIcons name="check-circle" size={18} color={theme?.colors?.primary} />
                <Text style={styles.changelogText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
    paddingHorizontal: 16,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerSection: {
    alignItems: 'center',
    paddingVertical: 28,
    marginBottom: 12,
  },
  appIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: theme?.colors?.primary || '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme?.colors?.onBackground || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 6,
  },
  appDesc: {
    fontSize: 13,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginBottom: 14,
  },
  versionBadge: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4A4458' : '#E8DEF8'),
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
  },
  versionText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme?.colors?.primary || '#3B82F6',
  },
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
  card: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    padding: 14,
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E8E8E8'),
  },
  infoLabel: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  changelogItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
    gap: 10,
  },
  changelogText: {
    flex: 1,
    fontSize: 13,
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    lineHeight: 18,
  },
});

export default AboutScreen;