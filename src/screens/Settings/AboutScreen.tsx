import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';

const AboutScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  const handleLinkPress = (url: string) => {
    Linking.openURL(url);
  };

  const renderInfoItem = (icon: string, title: string, value: string, onPress?: () => void) => (
    <TouchableOpacity 
      style={styles.infoItem} 
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.infoLeft}>
        <MaterialIcons name={icon as any} size={24} color={theme?.colors?.primary} />
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>{title}</Text>
          <Text style={styles.infoValue}>{value}</Text>
        </View>
      </View>
      {onPress && (
        <MaterialIcons name="chevron-right" size={20} color={theme?.colors?.onSurfaceVariant} />
      )}
    </TouchableOpacity>
  );

  const renderLinkItem = (icon: string, title: string, description: string, url: string) => (
    <TouchableOpacity 
      style={styles.linkItem} 
      onPress={() => handleLinkPress(url)}
    >
      <View style={styles.linkLeft}>
        <MaterialIcons name={icon as any} size={24} color={theme?.colors?.primary} />
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle}>{title}</Text>
          <Text style={styles.linkDescription}>{description}</Text>
        </View>
      </View>
      <MaterialIcons name="open-in-new" size={20} color={theme?.colors?.onSurfaceVariant} />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 应用信息 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>应用信息</Text>
          <View style={styles.card}>
            {renderInfoItem('info', '应用名称', 'TechFlow Mobile')}
            {renderInfoItem('tag', '版本号', '1.0.0')}
            {renderInfoItem('build', '构建号', '100')}
            {renderInfoItem('update', '更新时间', '2024-01-15')}
          </View>
        </View>

        {/* 开发团队 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>开发团队</Text>
          <View style={styles.card}>
            {renderInfoItem('person', '开发者', 'TechFlow Team')}
            {renderInfoItem('email', '联系邮箱', 'contact@techflow.com', () => handleLinkPress('mailto:contact@techflow.com'))}
            {renderInfoItem('business', '公司', 'TechFlow Inc.')}
          </View>
        </View>

        {/* 相关链接 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>相关链接</Text>
          <View style={styles.card}>
            {renderLinkItem('language', '官方网站', '访问我们的官方网站', 'https://techflow.com')}
            {renderLinkItem('code', '开源代码', '查看项目源代码', 'https://github.com/techflow/mobile')}
            {renderLinkItem('bug-report', '问题反馈', '报告bug或提出建议', 'https://github.com/techflow/mobile/issues')}
            {renderLinkItem('help', '使用帮助', '查看详细使用说明', 'https://docs.techflow.com')}
          </View>
        </View>

        {/* 法律信息 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>法律信息</Text>
          <View style={styles.card}>
            {renderLinkItem('gavel', '用户协议', '查看用户服务协议', 'https://techflow.com/terms')}
            {renderLinkItem('privacy-tip', '隐私政策', '了解我们如何保护您的隐私', 'https://techflow.com/privacy')}
            {renderLinkItem('copyright', '开源许可', '查看开源许可证信息', 'https://techflow.com/licenses')}
          </View>
        </View>

        {/* 技术信息 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>技术信息</Text>
          <View style={styles.card}>
            {renderInfoItem('phone-android', '平台', 'React Native')}
            {renderInfoItem('code', '框架版本', '0.72.0')}
            {renderInfoItem('build', '构建工具', 'Expo SDK 49')}
            {renderInfoItem('storage', '数据存储', 'SQLite + AsyncStorage')}
          </View>
        </View>

        {/* 致谢 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>特别致谢</Text>
          <View style={styles.thankCard}>
            <MaterialIcons name="favorite" size={32} color={theme?.colors?.primary} />
            <Text style={styles.thankTitle}>感谢所有用户的支持</Text>
            <Text style={styles.thankDescription}>
              感谢每一位用户的使用和反馈，让TechFlow Mobile变得更好。
              同时感谢开源社区提供的优秀工具和库。
            </Text>
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
  card: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  linkContent: {
    marginLeft: 12,
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 2,
  },
  linkDescription: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  thankCard: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  thankTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  thankDescription: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default AboutScreen;