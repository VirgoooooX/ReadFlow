import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator, Switch } from 'react-native';
import { useThemeContext } from '../../theme';
import { CleanText, CleanInput, SettingItem, SettingSection } from '../../components/ui';
import { SettingsService } from '../../services/SettingsService';
import { AppSettings } from '../../types';

const CloudSettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const settingsService = SettingsService.getInstance();
  
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<AppSettings['sync']>({
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
      const appSettings = await settingsService.getAppSettings();
      setSettings(appSettings.sync);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSyncSettings: Partial<AppSettings['sync']>) => {
    try {
      const updatedSync = { ...settings, ...newSyncSettings };
      setSettings(updatedSync);
      await settingsService.updateAppSetting('sync', updatedSync);
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const handleTestConnection = async () => {
    if (!settings.serverUrl) {
      Alert.alert('Error', 'Please enter a server URL');
      return;
    }

    try {
      setTesting(true);
      // Use the dedicated health check endpoint
      const response = await fetch(`${settings.serverUrl}/health`);
      
      if (response.ok) {
        Alert.alert('Success', 'Connection successful!');
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message || 'Could not connect to server');
    } finally {
      setTesting(false);
    }
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
              value={settings.mode === 'cloud'}
              onValueChange={(val: boolean) => saveSettings({ mode: val ? 'cloud' : 'local' })}
              trackColor={{ false: isDark ? '#4a4a4a' : '#e0e0e0', true: theme.colors.primaryContainer }}
              thumbColor={settings.mode === 'cloud' ? theme.colors.primary : '#f4f3f4'}
            />
          }
          showArrow={false}
          isLast
        />
      </SettingSection>
      
      <CleanText style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        使用 TechFlow Server 进行云端抓取和解析，提升性能并节省流量
      </CleanText>

      {settings.mode === 'cloud' && (
        <>
          <SettingSection title="图片处理">
            <SettingItem
              label="启用图片压缩"
              icon="image"
              rightElement={
                <Switch
                  value={settings.imageCompression ?? false}
                  onValueChange={(val: boolean) => saveSettings({ imageCompression: val })}
                  trackColor={{ false: isDark ? '#4a4a4a' : '#e0e0e0', true: theme.colors.primaryContainer }}
                  thumbColor={settings.imageCompression ?? false ? theme.colors.primary : '#f4f3f4'}
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

      <SettingSection title="服务器配置">
        <View style={styles.inputContainer}>
          <CleanInput
            label="Server URL"
            value={settings.serverUrl}
            onChangeText={(text) => saveSettings({ serverUrl: text })}
            placeholder="http://192.168.1.x:3000"
            autoCapitalize="none"
            autoCorrect={false}
            variant="outlined"
            containerStyle={{ marginBottom: 0 }}
          />
        </View>

        <SettingItem
          label={testing ? "正在连接..." : "测试连接"}
          icon="network-check"
          onPress={handleTestConnection}
          disabled={testing || !settings.serverUrl}
          isLast
          rightElement={testing ? <ActivityIndicator size="small" color={theme.colors.primary} /> : undefined}
          color={!settings.serverUrl ? theme.colors.outline : theme.colors.primary}
        />
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
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
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
