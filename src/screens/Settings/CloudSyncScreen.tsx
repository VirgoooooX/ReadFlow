import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { useThemeContext } from '../../theme';
import { CleanText, SettingItem, SettingSection, CleanInput } from '../../components/ui';
import AuthService from '../../services/AuthService';
import { CloudConfig, cloudConfigService } from '../../services/CloudConfigService';
import { configSyncService } from '../../services/ConfigSyncService';
import { SettingsService } from '../../services/SettingsService';
import { AppSettings, ProxyServer } from '../../types';
import { MaterialIcons as Icon } from '@expo/vector-icons';

type RunningMode = 'direct' | 'proxy' | 'cloud';

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
  const [runningMode, setRunningMode] = useState<RunningMode>('direct');
  
  // Proxy Mode State
  const [activeProxyServer, setActiveProxyServer] = useState<ProxyServer | null>(null);

  // Cloud Mode State
  const [cloudServerUrl, setCloudServerUrl] = useState('');
  const [cloudAccessKey, setCloudAccessKey] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);

  const load = async () => {
    try {
      const [c, appSettings, proxyConfig, proxyServersConfig] = await Promise.all([
        cloudConfigService.getConfig(),
        settingsService.getAppSettings(),
        settingsService.getProxyModeConfig(),
        settingsService.getProxyServersConfig()
      ]);
      setConfig(c);
      setSyncSettings(appSettings.sync);

      // Cloud Mode Initial State
      setCloudServerUrl(c.serverUrl || '');
      setCloudAccessKey(c.serverAccessKey || '');

      // Proxy Mode Initial State
      const activeServer = proxyServersConfig.servers.find(s => s.id === proxyServersConfig.activeServerId);
      setActiveProxyServer(activeServer || null);

      // Determine running mode
      if (c.mode === 'cloud') {
        setRunningMode('cloud');
      } else if (proxyConfig.enabled) {
        setRunningMode('proxy');
      } else {
        setRunningMode('direct');
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => {
      load().catch(() => {});
    });
    load().catch(() => {});
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

  const handleModeChange = async (newMode: RunningMode) => {
    if (newMode === runningMode) return;

    // 前置检查：切换到 Proxy 或 Cloud 模式时，如果不符合条件，先不切换逻辑状态，但允许 UI 切换以便用户去配置
    // 为了体验更好，我们允许用户先切过去，然后显示“未配置”的状态
    
    setSyncing(true);
    try {
      if (newMode === 'cloud') {
        // 切换到云端模式
        await cloudConfigService.setMode('cloud');
        // 禁用轻量代理
        await settingsService.setActiveProxyServer(null);
        
        // 尝试拉取配置（如果已连接）
        if (isConnected && isAuthed) {
           try {
             await configSyncService.syncConfig('pull');
             Alert.alert('切换成功', '已切换到云端模式并拉取最新配置');
           } catch (e) {
             // 忽略同步错误
           }
        }
        
      } else if (newMode === 'proxy') {
        // 切换到轻量代理
        await cloudConfigService.setMode('local');
        
        // 尝试自动激活一个代理服务器
        const proxyServers = await settingsService.getProxyServersConfig();
        if (proxyServers.servers.length > 0) {
          const targetId = proxyServers.activeServerId || proxyServers.servers[0].id;
          await settingsService.setActiveProxyServer(targetId);
        } else {
          // 无服务器，保持 null
          await settingsService.setActiveProxyServer(null);
        }
        
      } else {
        // 切换到直连模式
        await cloudConfigService.setMode('local');
        await settingsService.setActiveProxyServer(null);
      }

      await load();
      
      // Force update UI to reflect the user's choice, 
      // even if load() logic (based on config.enabled) reverted it to direct
      setRunningMode(newMode);
    } catch (error) {
      console.error('Failed to switch mode:', error);
      Alert.alert('切换失败', '模式切换过程中发生错误');
    } finally {
      setSyncing(false);
    }
  };

  const handleManualSync = async (mode: 'push' | 'pull') => {
    if (runningMode !== 'cloud') {
      Alert.alert('提示', '请先启用云端模式');
      return;
    }
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
      } catch {}

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

  const renderModeSelector = () => {
    const modes = [
      { mode: 'direct', title: '纯直连模式', desc: '直连 RSS 源，被墙图片走公共代理', icon: 'phonelink-off' },
      { mode: 'proxy', title: '轻量代理模式', desc: '通过自建 Server-Go 代理 RSS 和图片', icon: 'dns' },
      { mode: 'cloud', title: '云端模式', desc: '全托管云端同步 (需 Node.js 服务端)', icon: 'cloud-queue' }
    ];

    return (
      <SettingSection title="运行模式">
        {syncing && (
          <View style={styles.syncingOverlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <CleanText style={{ marginTop: 10, color: theme.colors.onSurface }}>正在切换模式...</CleanText>
          </View>
        )}
        <View style={styles.card}>
            {modes.map((item, index) => {
                const isSelected = runningMode === item.mode;
                const isLast = index === modes.length - 1;
                return (
                    <React.Fragment key={item.mode}>
                        <TouchableOpacity
                            style={[styles.optionItem, isSelected && styles.selectedOption]}
                            onPress={() => handleModeChange(item.mode as RunningMode)}
                            disabled={syncing}
                        >
                            <View style={styles.optionLeft}>
                                <Icon name={item.icon as any} size={24} color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                                <View style={styles.optionTextContainer}>
                                    <CleanText style={[styles.optionTitle, isSelected && styles.selectedText]}>{item.title}</CleanText>
                                    <CleanText style={styles.optionDesc}>{item.desc}</CleanText>
                                </View>
                            </View>
                            {isSelected && (
                                <Icon name="check" size={24} color={theme.colors.primary} />
                            )}
                        </TouchableOpacity>
                        {!isLast && <View style={styles.optionDivider} />}
                    </React.Fragment>
                );
            })}
        </View>
      </SettingSection>
    );
  };

  const renderProxyModeContent = () => (
    <SettingSection title="代理服务器配置">
      <View style={styles.card}>
        {activeProxyServer ? (
          <>
            <View style={styles.cardInternalRow}>
                <Icon name="dns" size={24} color={theme.colors.primary} />
                <View style={styles.cardInfo}>
                    <CleanText style={styles.cardTitle}>{activeProxyServer.name}</CleanText>
                    <CleanText style={styles.cardSubtitle}>{activeProxyServer.serverUrl}</CleanText>
                </View>
                <Icon name="check-circle" size={20} color={theme.semantic.success} />
            </View>
            <View style={styles.optionDivider} />
            <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => navigation.navigate('ProxyServerSettings')}
            >
                <CleanText style={styles.actionButtonText}>管理 / 切换服务器</CleanText>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.emptyStateContainer}>
            <Icon name="cloud-off" size={40} color={theme.colors.outline} />
            <CleanText style={styles.emptyStateText}>未选择代理服务器</CleanText>
            <TouchableOpacity 
              style={[styles.primaryButton, { width: '100%' }]}
              onPress={() => navigation.navigate('ProxyServerSettings')}
            >
               <CleanText style={styles.primaryButtonText}>去添加/选择服务器</CleanText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SettingSection>
  );

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
                    <CleanText style={{color: theme.colors.error, fontSize: 13, lineHeight: 20, includeFontPadding: false }}>断开</CleanText>
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
                            <CleanText style={[styles.actionButtonText, !cloudServerUrl.trim() && {color: theme.colors.outline}]}>连接服务器</CleanText>
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
                            <CleanText style={{fontSize: 12, color: theme.semantic.success, lineHeight: 18, includeFontPadding: false }}>已登录</CleanText>
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
            </View>
        </SettingSection>
      )}
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
      
      {renderModeSelector()}

      {runningMode === 'proxy' && renderProxyModeContent()}
      {runningMode === 'cloud' && renderCloudModeContent()}
      
      {runningMode === 'direct' && (
         <CleanText style={[styles.hint, { color: theme.colors.onSurfaceVariant, marginTop: 0 }]}>
           当前模式下，APP 将直接请求 RSS 源。对于被墙的图片（如 BBC, Twitter），会自动尝试使用公共代理加载。
         </CleanText>
      )}

      <CleanText style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
        直连模式适合无服务器用户；轻量代理适合仅需解决网络问题的用户；云端模式适合需要多端同步的高级用户。
      </CleanText>
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
