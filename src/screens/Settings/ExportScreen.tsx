import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';

const ExportScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const [includeReadHistory, setIncludeReadHistory] = useState(true);
  const [includeFavorites, setIncludeFavorites] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [includeRSSFeeds, setIncludeRSSFeeds] = useState(true);
  const [includeCategories, setIncludeCategories] = useState(true);
  const [exportFormat, setExportFormat] = useState('JSON');

  const styles = createStyles(isDark, theme);

  const formatOptions = ['JSON', 'CSV', 'XML'];

  const handleExport = (format: string) => {
    Alert.alert(
      '确认导出',
      `确定要导出为 ${format} 格式吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: () => {
            // 这里实现实际的导出逻辑
            Alert.alert('导出成功', `数据已导出为 ${format} 格式`);
          },
        },
      ]
    );
  };

  const renderSwitchOption = (
    title: string,
    description: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    icon: string
  ) => (
    <View style={styles.switchItem}>
      <View style={styles.switchLeft}>
        <MaterialIcons name={icon as any} size={24} color={theme?.colors?.primary} />
        <View style={styles.switchContent}>
          <Text style={styles.switchTitle}>{title}</Text>
          <Text style={styles.switchDescription}>{description}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'),
          true: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF'),
        }}
        thumbColor={value ? theme?.colors?.primary : theme?.colors?.onSurfaceVariant}
      />
    </View>
  );

  const renderFormatOption = (format: string) => (
    <TouchableOpacity
      key={format}
      style={[
        styles.formatItem,
        exportFormat === format && styles.selectedFormat,
      ]}
      onPress={() => setExportFormat(format)}
    >
      <View style={styles.formatLeft}>
        <MaterialIcons 
          name={format === 'JSON' ? 'code' : format === 'CSV' ? 'table-chart' : 'description'} 
          size={24} 
          color={exportFormat === format ? theme?.colors?.primary : theme?.colors?.onSurfaceVariant} 
        />
        <View style={styles.formatContent}>
          <Text style={[
            styles.formatTitle,
            exportFormat === format && styles.selectedFormatText,
          ]}>
            {format}
          </Text>
          <Text style={styles.formatDescription}>
            {format === 'JSON' && '结构化数据格式，便于程序处理'}
            {format === 'CSV' && '表格格式，可用Excel打开'}
            {format === 'XML' && '标记语言格式，通用性强'}
          </Text>
        </View>
      </View>
      {exportFormat === format && (
        <MaterialIcons name="check" size={20} color={theme?.colors?.primary} />
      )}
    </TouchableOpacity>
  );

  const renderExportButton = (format: string, description: string, icon: string) => (
    <TouchableOpacity
      style={styles.exportButton}
      onPress={() => handleExport(format)}
    >
      <MaterialIcons name={icon as any} size={24} color={theme?.colors?.primary} />
      <View style={styles.exportContent}>
        <Text style={styles.exportTitle}>导出为 {format}</Text>
        <Text style={styles.exportDescription}>{description}</Text>
      </View>
      <MaterialIcons name="download" size={20} color={theme?.colors?.onSurfaceVariant} />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 导出内容选择 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>选择导出内容</Text>
          <View style={styles.card}>
            {renderSwitchOption(
              '阅读历史',
              '包含所有已读文章记录',
              includeReadHistory,
              setIncludeReadHistory,
              'history'
            )}
            {renderSwitchOption(
              '收藏文章',
              '包含所有收藏的文章',
              includeFavorites,
              setIncludeFavorites,
              'favorite'
            )}
            {renderSwitchOption(
              'RSS订阅源',
              '包含所有RSS订阅配置',
              includeRSSFeeds,
              setIncludeRSSFeeds,
              'rss-feed'
            )}
            {renderSwitchOption(
              '分类标签',
              '包含自定义分类和标签',
              includeCategories,
              setIncludeCategories,
              'label'
            )}
            {renderSwitchOption(
              '应用设置',
              '包含所有应用配置信息',
              includeSettings,
              setIncludeSettings,
              'settings'
            )}
          </View>
        </View>

        {/* 导出格式选择 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>选择导出格式</Text>
          <View style={styles.card}>
            {formatOptions.map(renderFormatOption)}
          </View>
        </View>

        {/* 快速导出 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>快速导出</Text>
          <View style={styles.card}>
            {renderExportButton('JSON', '完整数据备份，推荐格式', 'backup')}
            {renderExportButton('CSV', '表格格式，便于分析', 'table-view')}
            {renderExportButton('XML', '通用格式，兼容性好', 'code')}
          </View>
        </View>

        {/* 导出说明 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>导出说明</Text>
          <View style={styles.infoCard}>
            <MaterialIcons name="info" size={24} color={theme?.colors?.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>注意事项</Text>
              <Text style={styles.infoText}>
                • 导出的数据将保存到设备的下载文件夹{"\n"}
                • 敏感信息（如API密钥）不会被导出{"\n"}
                • 建议定期备份重要数据{"\n"}
                • 导出文件可用于数据迁移或备份恢复
              </Text>
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
  card: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    overflow: 'hidden',
  },
  switchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  switchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  switchContent: {
    marginLeft: 12,
    flex: 1,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 2,
  },
  switchDescription: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  formatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  selectedFormat: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF'),
  },
  formatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  formatContent: {
    marginLeft: 12,
    flex: 1,
  },
  formatTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 2,
  },
  selectedFormatText: {
    color: theme?.colors?.primary || '#6750A4',
  },
  formatDescription: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  exportContent: {
    marginLeft: 12,
    flex: 1,
  },
  exportTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 2,
  },
  exportDescription: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  infoCard: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    lineHeight: 20,
  },
});

export default ExportScreen;