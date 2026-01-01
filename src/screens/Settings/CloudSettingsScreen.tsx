import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { useThemeContext } from '../../theme';
import { CleanText, SettingItem, SettingSection } from '../../components/ui';
import { SettingsService } from '../../services/SettingsService';
import { AppSettings } from '../../types';
import AuthService from '../../services/AuthService';
import { CloudConfig, cloudConfigService } from '../../services/CloudConfigService';

const CloudSettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const settingsService = SettingsService.getInstance();
  
  const [loading, setLoading] = useState(false);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null);
  const [syncSettings, setSyncSettings] = useState<AppSettings['sync']>({
    enabled: false,
    autoSync: false,
    syncInterval: 3600,
    wifiOnly: true,
    mode: 'local',
    serverUrl: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [appSettings, cc] = await Promise.all([settingsService.getAppSettings(), cloudConfigService.getConfig()]);
      setCloudConfig(cc);
      setSyncSettings(appSettings.sync);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSyncSettings = async (newSyncSettings: Partial<AppSettings['sync']>) => {
    try {
      const updatedSync = { ...syncSettings, ...newSyncSettings };
      setSyncSettings(updatedSync);
      await settingsService.updateAppSetting('sync', updatedSync);
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const handleToggleCloudMode = async (val: boolean) => {
    const cc = cloudConfig || (await cloudConfigService.getConfig());
    if (!val) {
      const next = await cloudConfigService.setMode('local');
      setCloudConfig(next);
      return;
    }

    if (!cc.serverUrl) {
      Alert.alert('提示', '请先配置服务器地址并测试连接');
      return;
    }

    if (!AuthService.isAuthenticated()) {
      Alert.alert('需要登录', '请先登录云端账号后再开启云端模式');
      return;
    }

    const next = await cloudConfigService.setMode('cloud');
    setCloudConfig(next);
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      <SettingSection title="云端同步模式">
        <SettingItem
          label="启用云端加速模式"
          icon="cloud-queue"
          rightElement={
            <Switch
              value={cloudConfig?.mode === 'cloud'}
              onValueChange={handleToggleCloudMode}
              trackColor={{ false: isDark ? '#4a4a4a' : '#e0e0e0', true: theme.colors.primaryContainer }}
              thumbColor={cloudConfig?.mode === 'cloud' ? theme.colors.primary : '#f4f3f4'}
            />
          }
          showArrow={false}
          isLast
        />
      </SettingSection>
      
      <CleanText style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        使用 ReadFlow Server 进行云端抓取和解析，提升性能并节省流量
      </CleanText>

      {cloudConfig?.mode === 'cloud' && (
        <>
          <SettingSection title="图片处理">
            <SettingItem
              label="启用图片压缩"
              icon="image"
              rightElement={
                <Switch
                  value={syncSettings.imageCompression ?? false}
                  onValueChange={(val: boolean) => saveSyncSettings({ imageCompression: val })}
                  trackColor={{ false: isDark ? '#4a4a4a' : '#e0e0e0', true: theme.colors.primaryContainer }}
                  thumbColor={syncSettings.imageCompression ?? false ? theme.colors.primary : '#f4f3f4'}
                />
              }
              showArrow={false}
              isLast
            />
          </SettingSection>
          
          <CleanText style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
            启用后，图片将通过服务器进行智能压缩，节省流量并提升加载速度。
            压缩质量由服务器统一管理。
          </CleanText>
        </>
      )}

      <SettingSection title="服务器">
        <SettingItem
          label={cloudConfig?.serverUrl ? '已连接' : '未连接'}
          icon={cloudConfig?.serverUrl ? 'cloud-done' : 'cloud-off'}
          showArrow={false}
        />
        {!!cloudConfig?.serverUrl && (
          <View style={styles.kvRow}>
            <CleanText style={[styles.kvKey, { color: theme.colors.onSurfaceVariant }]}>Server URL</CleanText>
            <CleanText style={[styles.kvValue, { color: theme.colors.onSurface }]}>{cloudConfig.serverUrl}</CleanText>
          </View>
        )}
      </SettingSection>

      <View style={styles.infoContainer}>
        <CleanText style={[styles.infoText, { color: theme.colors.outline }]}>
          注意：切换到云端模式后，所有 RSS 抓取请求将通过您的私有服务器进行。请确保服务器已正确部署并可访问。
        </CleanText>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  description: {
    paddingHorizontal: 16,
    marginBottom: 24,
    marginTop: -8,
    fontSize: 12,
    lineHeight: 18,
  },
  kvRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  kvKey: {
    fontSize: 12,
    marginBottom: 4,
  },
  kvValue: {
    fontSize: 14,
  },
  infoContainer: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
  },
});

export default CloudSettingsScreen;
