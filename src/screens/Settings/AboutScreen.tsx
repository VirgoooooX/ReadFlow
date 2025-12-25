import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { APP_VERSION, APP_INFO } from '../../constants/appVersion';
import { 
  SettingItem, 
  SettingSection 
} from '../../components/ui';

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
        <SettingSection title="版本信息">
          <SettingItem
            label="版本号"
            valueText={APP_VERSION.version}
            showArrow={false}
          />
          <SettingItem
            label="构建号"
            valueText={APP_VERSION.buildNumber.toString()}
            showArrow={false}
          />
          <SettingItem
            label="更新时间"
            valueText={APP_VERSION.updateTime}
            showArrow={false}
            isLast
          />
        </SettingSection>

        {/* 更新内容 */}
        <SettingSection title="最近更新">
          {APP_VERSION.changelog.map((item, index) => (
            <SettingItem
              key={index}
              label={item}
              showArrow={false}
              isLast={index === APP_VERSION.changelog.length - 1}
              disabled
            />
          ))}
        </SettingSection>

        {/* 其他信息 */}
        <SettingSection title="更多">
          <SettingItem
            icon="public"
            label="官方网站"
            onPress={() => Linking.openURL('https://github.com/techflow')}
            color="#3B82F6"
          />
          <SettingItem
            icon="security"
            label="隐私政策"
            onPress={() => {}}
            color="#10B981"
          />
          <SettingItem
            icon="description"
            label="用户协议"
            onPress={() => {}}
            color="#F59E0B"
            isLast
          />
        </SettingSection>

        {/* 底部留白 */}
        <View style={{ height: 20 }} />
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
});

export default AboutScreen;