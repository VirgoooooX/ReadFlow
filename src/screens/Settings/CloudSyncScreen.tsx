import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View, ActivityIndicator } from 'react-native';
import { useThemeContext } from '../../theme';
import { CleanText, SettingItem, SettingSection } from '../../components/ui';
import AuthService from '../../services/AuthService';
import { CloudConfig, cloudConfigService } from '../../services/CloudConfigService';
import { configSyncService } from '../../services/ConfigSyncService';

export const CloudSyncScreen: React.FC<any> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    const c = await cloudConfigService.getConfig();
    setConfig(c);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => {
      load().catch(() => {
      });
    });
    load().catch(() => {
    });
    return unsubscribe;
  }, [navigation]);

  const isConnected = !!config?.serverUrl;
  const isAuthed = !!config?.auth?.accessToken && !!config?.auth?.user;
  const isCloudMode = config?.mode === 'cloud';
  const pageState: 'disconnected' | 'connected' | 'authed' | 'enabled' =
    !isConnected ? 'disconnected' : !isAuthed ? 'connected' : isCloudMode ? 'enabled' : 'authed';

  const openAuth = () => {
    const parent = navigation.getParent?.();
    if (parent?.navigate) {
      parent.navigate('Auth');
      return;
    }
    navigation.navigate?.('Auth');
  };

  const handleToggleMode = async (next: boolean) => {
    const current = await cloudConfigService.getConfig();
    if (!next) {
      await cloudConfigService.setMode('local');
      setConfig({ ...current, mode: 'local' });
      return;
    }

    if (!current.serverUrl) {
      Alert.alert('未连接服务器', '请先连接云端服务器', [
        { text: '取消', style: 'cancel' },
        { text: '去连接', onPress: () => navigation.navigate('CloudConnect') },
      ]);
      return;
    }
    if (!current.auth.accessToken) {
      Alert.alert('未登录', '请先登录云端账号', [
        { text: '取消', style: 'cancel' },
        { text: '去登录/注册', onPress: openAuth },
      ]);
      return;
    }

    setSyncing(true);
    try {
      // Enable cloud mode first
      await cloudConfigService.setMode('cloud');
      setConfig({ ...current, mode: 'cloud' });
      
      // Pull config from cloud
      await configSyncService.syncConfig('pull');
      Alert.alert('同步成功', '已从云端拉取最新配置');
    } catch (error) {
      console.error('Failed to enable cloud mode:', error);
      Alert.alert('同步失败', '虽然开启了云端模式，但初始同步失败，请手动重试');
    } finally {
      setSyncing(false);
    }
  };

  const handleManualSync = async (mode: 'push' | 'pull') => {
    if (!isCloudMode) {
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
    await AuthService.logout();
    await load();
  };

  const handleDisconnect = async () => {
    await cloudConfigService.clearServer();
    await load();
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
      <SettingSection title="云端同步状态">
        <SettingItem
          label="云端模式"
          icon="cloud-queue"
          rightElement={
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {syncing && <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginRight: 8 }} />}
              <Switch
                value={isCloudMode}
                onValueChange={handleToggleMode}
                disabled={syncing}
                trackColor={{ false: isDark ? '#4a4a4a' : '#e0e0e0', true: theme.colors.primaryContainer }}
                thumbColor={isCloudMode ? theme.colors.primary : '#f4f3f4'}
              />
            </View>
          }
          showArrow={false}
        />
        {isCloudMode && (
          <>
            <SettingItem
              label="立即推送到云端"
              icon="cloud-upload"
              onPress={() => handleManualSync('push')}
              disabled={syncing}
            />
            <SettingItem
              label="立即从云端拉取"
              icon="cloud-download"
              onPress={() => handleManualSync('pull')}
              disabled={syncing}
            />
          </>
        )}
        <SettingItem
          label={
            pageState === 'disconnected'
              ? '未连接'
              : pageState === 'connected'
                ? '已连接，未登录'
                : pageState === 'authed'
                  ? '已登录，未启用云端模式'
                  : '已启用'
          }
          icon={
            pageState === 'enabled'
              ? 'cloud-done'
              : pageState === 'authed'
                ? 'verified-user'
                : pageState === 'connected'
                  ? 'cloud-queue'
                  : 'cloud-off'
          }
          showArrow={false}
          isLast
        />
      </SettingSection>

      <SettingSection title="连接">
        <SettingItem
          label={isConnected ? '已连接' : '未连接'}
          icon={isConnected ? 'cloud-done' : 'cloud-off'}
          showArrow={false}
          isLast={!isConnected}
        />
        {isConnected && (
          <>
            <View style={styles.kvRow}>
              <CleanText style={[styles.kvKey, { color: theme.colors.onSurfaceVariant }]}>Server URL</CleanText>
              <CleanText style={[styles.kvValue, { color: theme.colors.onSurface }]}>{config?.serverUrl}</CleanText>
            </View>
            <SettingItem
              label="修改连接"
              icon="settings-ethernet"
              onPress={() => navigation.navigate('CloudConnect')}
              isLast
            />
          </>
        )}
        {!isConnected && (
          <SettingItem
            label="连接云端服务器"
            icon="settings-ethernet"
            onPress={() => navigation.navigate('CloudConnect')}
            isLast
          />
        )}
      </SettingSection>

      <SettingSection title="认证">
        <SettingItem
          label={isAuthed ? '已登录' : '未登录'}
          icon={isAuthed ? 'verified-user' : 'person-outline'}
          showArrow={false}
          isLast={!isAuthed}
        />
        {isAuthed && (
          <>
            <View style={styles.kvRow}>
              <CleanText style={[styles.kvKey, { color: theme.colors.onSurfaceVariant }]}>账号</CleanText>
              <CleanText style={[styles.kvValue, { color: theme.colors.onSurface }]}>{config?.auth?.user?.email}</CleanText>
            </View>
            <SettingItem label="退出登录" icon="logout" onPress={handleLogoutCloud} />
            <SettingItem label="断开服务器" icon="link-off" onPress={handleDisconnect} isLast />
          </>
        )}
        {!isAuthed && (
          <SettingItem
            label="登录/注册"
            icon="login"
            onPress={openAuth}
            isLast
            disabled={!isConnected}
            color={!isConnected ? theme.colors.outline : theme.colors.primary}
          />
        )}
      </SettingSection>

      <CleanText style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
        连接用于配置服务器地址与访问码；认证用于账号登录。两者独立管理。
      </CleanText>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: 16,
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
    hint: {
      paddingHorizontal: 16,
      marginTop: 12,
      fontSize: 12,
      lineHeight: 18,
    },
  });
