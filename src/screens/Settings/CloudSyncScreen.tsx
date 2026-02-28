import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { useThemeContext } from '../../theme';
import { CleanText, SettingItem, SettingSection, CleanInput } from '../../components/ui';
import AuthService from '../../services/AuthService';
import { CloudConfig, cloudConfigService } from '../../services/CloudConfigService';
import { configSyncService } from '../../services/ConfigSyncService';
import { AppSettings } from '../../types';
import { SettingsService } from '../../services/SettingsService';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { cloudSyncService } from '../../services/rss/CloudSyncService';


type MetaResponse = {
  ok?: boolean;
  requiresServerAccessKey?: boolean;
  accessKeyValid?: boolean;
  version?: string;
};

function normalizeServerUrl(input: string): string {
  let url = (input || '').trim().replace(/\/$/, '');
  if (url && !url.startsWith('http')) {
    url = `http://${url}`;
  }
  return url;
}

export const CloudSyncScreen: React.FC<any> = ({ navigation }) => {
  const { theme } = useThemeContext();
  const styles = createStyles(theme);

  const settingsService = SettingsService.getInstance();
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [syncSettings, setSyncSettings] = useState<AppSettings['sync']>({
    enabled: false,
    autoSync: false,
    syncInterval: 3600,
    wifiOnly: true,
    mode: 'local',
    serverUrl: '',
  });
  const [syncing, setSyncing] = useState(false);
  // Cloud Mode State
  const [cloudServerUrl, setCloudServerUrl] = useState('');
  const [cloudAccessKey, setCloudAccessKey] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);

  const load = async () => {
    try {
      const [c, appSettings] = await Promise.all([
        cloudConfigService.getConfig(),
        settingsService.getAppSettings(),
      ]);
      setConfig(c);
      setSyncSettings(appSettings.sync);

      // Cloud Mode Initial State
      setCloudServerUrl(c.serverUrl || '');
      setCloudAccessKey(c.serverAccessKey || '');
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => {
      load().catch(() => { });
    });
    load().catch(() => { });
    return unsubscribe;
  }, [navigation]);

  const saveSyncSettings = async (newSyncSettings: Partial<AppSettings['sync']>) => {
    try {
      const updatedSync = { ...syncSettings, ...newSyncSettings };
      setSyncSettings(updatedSync);
      await settingsService.updateAppSetting('sync', updatedSync);
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const isConnected = !!config?.serverUrl;
  const isAuthed = !!config?.auth?.accessToken && !!config?.auth?.user;

  const openAuth = () => {
    const parent = navigation.getParent?.();
    if (parent?.navigate) {
      parent.navigate('Auth');
      return;
    }
    navigation.navigate?.('Auth');
  };

  const handleManualSync = async (mode: 'push' | 'pull') => {

    setSyncing(true);
    try {
      await configSyncService.syncConfig(mode);
      Alert.alert('成功', mode === 'push' ? '已推送到云端' : '已从云端拉取');
    } catch (error) {
      Alert.alert('失败', '同步发生错误');
    } finally {
      setSyncing(false);
    }
  };

  const handleManualStateSync = async () => {
    setSyncing(true);
    try {
      const ok = await cloudSyncService.syncUserArticleStates('both');
      if (ok) {
        Alert.alert('成功', '已同步阅读状态');
      } else {
        Alert.alert('失败', '同步阅读状态失败');
      }
    } catch {
      Alert.alert('失败', '同步阅读状态失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleRerunBootstrap = async () => {
    setSyncing(true);
    try {
      await configSyncService.resetBootstrapForCurrentUser();
      await configSyncService.bootstrapConfigAfterAuth();
      Alert.alert('成功', '已重新执行配置迁移');
    } catch {
      Alert.alert('失败', '重新执行配置迁移失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleLogoutCloud = async () => {
    Alert.alert(
      '退出登录',
      '确定要退出当前账号吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            await AuthService.logout();
            await load();
          }
        }
      ]
    );
  };

  const handleDisconnectCloud = async () => {
    await cloudConfigService.clearServer();
    await saveSyncSettings({ mode: 'local', serverUrl: '' });
    setCloudServerUrl('');
    setCloudAccessKey('');
    await load();
  };

  const handleTestCloudConnection = async () => {
    const url = normalizeServerUrl(cloudServerUrl);
    if (!url) {
      Alert.alert('提示', '请输入服务器地址');
      return;
    }

    setTestingConnection(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const headers: Record<string, string> = {};
      if (cloudAccessKey.trim()) {
        headers['x-server-token'] = cloudAccessKey.trim();
        headers['x-server-access-key'] = cloudAccessKey.trim();
      }

      const metaUrl = `${url}/api/meta`;
      let res = await fetch(metaUrl, {
        method: 'GET',
        headers,
        signal: controller.signal as any,
      });
      clearTimeout(timeoutId);

      let data: MetaResponse = {};
      try {
        data = (await res.json()) as MetaResponse;
      } catch { }

      if (!res.ok && res.status === 404) {
        const fallbackRes = await fetch(`${url}/health`, {
          method: 'GET',
          headers,
          signal: controller.signal as any,
        });
        res = fallbackRes;
        data = { ok: fallbackRes.ok };
      }

      const requiresKey = data.requiresServerAccessKey === true;
      if (requiresKey && !cloudAccessKey.trim()) {
        Alert.alert('需要访问码', '该服务器开启了访问控制，请填写服务器访问码后再测试');
        return;
      }
      if (requiresKey && data.accessKeyValid === false) {
        Alert.alert('访问码错误', '服务器访问码不正确，请检查后重试');
        return;
      }

      if (!res.ok) {
        if ((res.status === 401 || res.status === 403)) {
          Alert.alert('访问受限', '服务器访问码不正确，或服务器拒绝访问');
          return;
        }
        Alert.alert('连接失败', `服务器返回状态码: ${res.status}`);
        return;
      }

      await cloudConfigService.setServer(url, cloudAccessKey.trim() || undefined);
      await cloudConfigService.setMode('cloud');
      await saveSyncSettings({ mode: 'cloud', serverUrl: url });
      await load(); // Reload config
      Alert.alert('连接成功', '服务器连接已保存，请继续登录');
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        Alert.alert('连接超时', '无法连接到服务器，请检查地址或网络');
      } else {
        Alert.alert('连接失败', '无法连接到服务器，请检查地址是否正确');
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const renderCloudModeContent = () => (
    <View>
      {/* 1. 连接配置 */}
      <SettingSection title="云端服务器连接">
        <View style={styles.card}>
          {isConnected ? (
            <View style={styles.cardInternalRow}>
              <Icon name="cloud-done" size={24} color={theme.semantic.success} />
              <View style={styles.cardInfo}>
                <CleanText style={styles.cardTitle}>已连接到服务器</CleanText>
                <CleanText style={styles.cardSubtitle}>{config?.serverUrl}</CleanText>
              </View>
              <TouchableOpacity onPress={handleDisconnectCloud} style={styles.disconnectButton}>
                <CleanText style={{ color: theme.colors.error, fontSize: 13, lineHeight: 20, includeFontPadding: false }}>断开</CleanText>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.inputContainer}>
                <View style={styles.inputHeader}>
                  <Icon name="link" size={24} color={theme.colors.primary} />
                  <CleanText style={styles.inputLabel}>服务器地址</CleanText>
                </View>
                <TextInput
                  style={styles.textInput}
                  value={cloudServerUrl}
                  onChangeText={setCloudServerUrl}
                  placeholder="http://your-server.com"
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <CleanText style={styles.inputHint}>请输入部署了 ReadFlow Server 的地址</CleanText>
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputHeader}>
                  <Icon name="vpn-key" size={24} color={theme.colors.primary} />
                  <CleanText style={styles.inputLabel}>访问码 (可选)</CleanText>
                </View>
                <TextInput
                  style={styles.textInput}
                  value={cloudAccessKey}
                  onChangeText={setCloudAccessKey}
                  placeholder="Server Access Key"
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <CleanText style={styles.inputHint}>如果服务器开启了访问验证，请在此输入</CleanText>
              </View>

              <TouchableOpacity
                style={[styles.actionButton, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.outlineVariant }]}
                onPress={handleTestCloudConnection}
                disabled={testingConnection || !cloudServerUrl.trim()}
              >
                {testingConnection ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <>
                    <Icon name="login" size={20} color={!cloudServerUrl.trim() ? theme.colors.outline : theme.colors.primary} />
                    <CleanText style={[styles.actionButtonText, !cloudServerUrl.trim() && { color: theme.colors.outline }]}>连接服务器</CleanText>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </SettingSection>

      {/* 2. 认证状态 (仅在连接后显示) */}
      {isConnected && (
        <SettingSection title="账号认证">
          <View style={styles.card}>
            {isAuthed ? (
              <View style={styles.cardInternalRow}>
                <Icon name="account-circle" size={36} color={theme.colors.primary} />
                <View style={styles.cardInfo}>
                  <CleanText style={styles.cardTitle}>{config?.auth?.user?.email}</CleanText>
                  <CleanText style={{ fontSize: 12, color: theme.semantic.success, lineHeight: 18, includeFontPadding: false }}>已登录</CleanText>
                </View>
                <TouchableOpacity onPress={handleLogoutCloud} style={styles.logoutButton}>
                  <Icon name="logout" size={20} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={openAuth}
              >
                <Icon name="login" size={20} color={theme.colors.primary} />
                <CleanText style={styles.actionButtonText}>去登录 / 注册</CleanText>
              </TouchableOpacity>
            )}
          </View>
        </SettingSection>
      )}

      {/* 3. 云端功能开关 (仅在登录后显示) */}
      {isAuthed && (
        <SettingSection title="云端功能">
          <View style={styles.card}>
            <View style={styles.optionItem}>
              <View style={styles.optionLeft}>
                <Icon name="image" size={24} color={theme.colors.primary} />
                <View style={styles.optionTextContainer}>
                  <CleanText style={styles.optionTitle}>云端图片压缩</CleanText>
                  <CleanText style={styles.optionDesc}>节省流量与存储空间</CleanText>
                </View>
              </View>
              <Switch
                value={syncSettings.imageCompression ?? false}
                onValueChange={(val: boolean) => saveSyncSettings({ imageCompression: val })}
                disabled={syncing}
                trackColor={{ false: theme.colors.surfaceVariant, true: theme.colors.primary }}
                thumbColor={syncSettings.imageCompression ?? false ? theme.colors.onPrimary : theme.colors.outline}
              />
            </View>
            <View style={styles.optionDivider} />

            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => handleManualSync('push')}
              disabled={syncing}
            >
              <View style={styles.optionLeft}>
                <Icon name="cloud-upload" size={24} color={theme.colors.primary} />
                <View style={styles.optionTextContainer}>
                  <CleanText style={styles.optionTitle}>立即推送到云端</CleanText>
                </View>
              </View>
              <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
            <View style={styles.optionDivider} />

            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => handleManualSync('pull')}
              disabled={syncing}
            >
              <View style={styles.optionLeft}>
                <Icon name="cloud-download" size={24} color={theme.colors.primary} />
                <View style={styles.optionTextContainer}>
                  <CleanText style={styles.optionTitle}>立即从云端拉取</CleanText>
                </View>
              </View>
              <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
            <View style={styles.optionDivider} />

            <TouchableOpacity
              style={styles.optionItem}
              onPress={handleManualStateSync}
              disabled={syncing}
            >
              <View style={styles.optionLeft}>
                <Icon name="sync" size={24} color={theme.colors.primary} />
                <View style={styles.optionTextContainer}>
                  <CleanText style={styles.optionTitle}>同步阅读状态</CleanText>
                </View>
              </View>
              <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
            <View style={styles.optionDivider} />

            <TouchableOpacity
              style={styles.optionItem}
              onPress={handleRerunBootstrap}
              disabled={syncing}
            >
              <View style={styles.optionLeft}>
                <Icon name="restart-alt" size={24} color={theme.colors.primary} />
                <View style={styles.optionTextContainer}>
                  <CleanText style={styles.optionTitle}>重新执行配置迁移</CleanText>
                </View>
              </View>
              <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </SettingSection>
      )}
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
      {renderCloudModeContent()}
    </ScrollView>
  );
};

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    hint: {
      paddingHorizontal: 4,
      marginTop: 8,
      fontSize: 12,
      includeFontPadding: false,
      lineHeight: 18,
      marginBottom: 20,
    },
    syncingOverlay: {
      padding: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // New Card Styles
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
      marginBottom: 0, // Controlled by section
    },
    // Option Selector Styles
    optionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    optionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.outlineVariant,
      marginHorizontal: 14,
    },
    optionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    selectedOption: {
      backgroundColor: theme.colors.primaryContainer,
    },
    optionTextContainer: {
      marginLeft: 12,
      flex: 1,
      marginRight: 8,
    },
    optionTitle: {
      fontSize: 15,
      lineHeight: 22,
      includeFontPadding: false,
      fontWeight: '500',
      color: theme.colors.onSurface,
      marginBottom: 2,
    },
    optionDesc: {
      fontSize: 12,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
      lineHeight: 16,
    },
    selectedText: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    // Input Styles
    inputContainer: {
      padding: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    },
    inputHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    inputLabel: {
      fontSize: 15,
      lineHeight: 22,
      includeFontPadding: false,
      fontWeight: '500',
      color: theme.colors.onSurface,
      marginLeft: 12,
      flex: 1,
    },
    textInput: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      lineHeight: 22,
      includeFontPadding: false,
      color: theme.colors.onSurface,
      marginBottom: 8,
    },
    inputHint: {
      fontSize: 13,
      lineHeight: 20,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
    },
    // Button Styles
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    actionButtonText: {
      fontSize: 15,
      lineHeight: 22,
      includeFontPadding: false,
      fontWeight: '500',
      marginLeft: 8,
      color: theme.colors.primary,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      marginTop: 8,
    },
    primaryButtonText: {
      color: theme.colors.onPrimary,
      fontWeight: '600',
      fontSize: 15,
      lineHeight: 22,
      includeFontPadding: false,
    },
    // Proxy & Connected Card Internal Styles (Adapted)
    cardInternalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
    },
    cardInfo: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 15,
      lineHeight: 22,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginBottom: 2,
    },
    cardSubtitle: {
      fontSize: 12,
      lineHeight: 18,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
    },
    emptyStateContainer: {
      alignItems: 'center',
      padding: 24,
      justifyContent: 'center',
    },
    emptyStateText: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 8,
      marginBottom: 12,
    },
    disconnectButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.errorContainer,
    },
    logoutButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceVariant,
    },
  });
