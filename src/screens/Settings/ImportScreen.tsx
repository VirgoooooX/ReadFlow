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

const ImportScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const [mergeData, setMergeData] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [createBackup, setCreateBackup] = useState(true);
  const [validateData, setValidateData] = useState(true);

  const styles = createStyles(isDark, theme);

  const handleImportFromFile = () => {
    Alert.alert(
      '选择导入文件',
      '请选择要导入的数据文件',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '选择文件',
          onPress: () => {
            // 这里实现文件选择逻辑
            Alert.alert('导入成功', '数据已成功导入');
          },
        },
      ]
    );
  };

  const handleImportFromCloud = (service: string) => {
    Alert.alert(
      `从${service}导入`,
      `确定要从${service}导入数据吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: () => {
            // 这里实现云服务导入逻辑
            Alert.alert('导入成功', `已从${service}成功导入数据`);
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

  const renderImportOption = (
    title: string,
    description: string,
    icon: string,
    onPress: () => void,
    color?: string
  ) => (
    <TouchableOpacity style={styles.importOption} onPress={onPress}>
      <View style={styles.importLeft}>
        <MaterialIcons 
          name={icon as any} 
          size={24} 
          color={color || theme?.colors?.primary} 
        />
        <View style={styles.importContent}>
          <Text style={styles.importTitle}>{title}</Text>
          <Text style={styles.importDescription}>{description}</Text>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={theme?.colors?.onSurfaceVariant} />
    </TouchableOpacity>
  );

  const renderCloudService = (name: string, icon: string, color: string) => (
    <TouchableOpacity
      key={name}
      style={styles.cloudService}
      onPress={() => handleImportFromCloud(name)}
    >
      <MaterialIcons name={icon as any} size={32} color={color} />
      <Text style={styles.cloudServiceName}>{name}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 导入选项 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>导入方式</Text>
          <View style={styles.card}>
            {renderImportOption(
              '从文件导入',
              '选择本地文件进行数据导入',
              'folder-open',
              handleImportFromFile
            )}
            {renderImportOption(
              '从剪贴板导入',
              '从剪贴板粘贴JSON数据',
              'content-paste',
              () => Alert.alert('功能开发中', '此功能正在开发中')
            )}
            {renderImportOption(
              '扫描二维码导入',
              '扫描包含数据的二维码',
              'qr-code-scanner',
              () => Alert.alert('功能开发中', '此功能正在开发中')
            )}
          </View>
        </View>

        {/* 云服务导入 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>云服务导入</Text>
          <View style={styles.cloudContainer}>
            {renderCloudService('Google Drive', 'cloud', '#4285F4')}
            {renderCloudService('iCloud', 'cloud', '#007AFF')}
            {renderCloudService('Dropbox', 'cloud', '#0061FF')}
            {renderCloudService('OneDrive', 'cloud', '#0078D4')}
          </View>
        </View>

        {/* 导入设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>导入设置</Text>
          <View style={styles.card}>
            {renderSwitchOption(
              '合并数据',
              '将导入数据与现有数据合并',
              mergeData,
              setMergeData,
              'merge'
            )}
            {renderSwitchOption(
              '覆盖现有数据',
              '用导入数据替换相同的现有数据',
              overwriteExisting,
              setOverwriteExisting,
              'swap-horiz'
            )}
            {renderSwitchOption(
              '创建备份',
              '导入前自动备份当前数据',
              createBackup,
              setCreateBackup,
              'backup'
            )}
            {renderSwitchOption(
              '数据验证',
              '导入前验证数据格式和完整性',
              validateData,
              setValidateData,
              'verified'
            )}
          </View>
        </View>

        {/* 支持的格式 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>支持的格式</Text>
          <View style={styles.formatGrid}>
            <View style={styles.formatItem}>
              <MaterialIcons name="code" size={32} color={theme?.colors?.primary} />
              <Text style={styles.formatName}>JSON</Text>
              <Text style={styles.formatDescription}>推荐格式</Text>
            </View>
            <View style={styles.formatItem}>
              <MaterialIcons name="table-chart" size={32} color={theme?.colors?.primary} />
              <Text style={styles.formatName}>CSV</Text>
              <Text style={styles.formatDescription}>表格数据</Text>
            </View>
            <View style={styles.formatItem}>
              <MaterialIcons name="description" size={32} color={theme?.colors?.primary} />
              <Text style={styles.formatName}>XML</Text>
              <Text style={styles.formatDescription}>标记语言</Text>
            </View>
            <View style={styles.formatItem}>
              <MaterialIcons name="archive" size={32} color={theme?.colors?.primary} />
              <Text style={styles.formatName}>ZIP</Text>
              <Text style={styles.formatDescription}>压缩包</Text>
            </View>
          </View>
        </View>

        {/* 导入说明 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>导入说明</Text>
          <View style={styles.infoCard}>
            <MaterialIcons name="info" size={24} color={theme?.colors?.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>注意事项</Text>
              <Text style={styles.infoText}>
                • 导入前建议先备份当前数据{"\n"}
                • 确保导入文件格式正确且完整{"\n"}
                • 大文件导入可能需要较长时间{"\n"}
                • 导入过程中请勿关闭应用{"\n"}
                • 如遇问题可尝试分批导入数据
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
  importOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  importLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  importContent: {
    marginLeft: 12,
    flex: 1,
  },
  importTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 2,
  },
  importDescription: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  cloudContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cloudService: {
    width: '48%',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  cloudServiceName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginTop: 8,
    textAlign: 'center',
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  formatItem: {
    width: '48%',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  formatName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginTop: 8,
    marginBottom: 4,
  },
  formatDescription: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    textAlign: 'center',
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

export default ImportScreen;