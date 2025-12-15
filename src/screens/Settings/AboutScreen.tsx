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
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
  },
  content: {
    padding: 16,
  },
  headerSection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 16,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: theme?.colors?.primary || '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 8,
  },
  appDesc: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginBottom: 16,
  },
  versionBadge: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4A4458' : '#E8DEF8'),
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme?.colors?.primary || '#3B82F6',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 12,
  },
  card: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 15,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  changelogItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    gap: 10,
  },
  changelogText: {
    flex: 1,
    fontSize: 14,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    lineHeight: 20,
  },
});

export default AboutScreen;