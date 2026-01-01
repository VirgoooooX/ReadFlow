import React, { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useThemeContext } from '../../theme';
import { CleanInput, CleanText, SettingItem, SettingSection } from '../../components/ui';
import { cloudConfigService } from '../../services/CloudConfigService';

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

export const CloudConnectScreen: React.FC<any> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  const [serverUrl, setServerUrl] = useState('');
  const [serverAccessKey, setServerAccessKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testedOk, setTestedOk] = useState<{ url: string; version?: string } | null>(null);

  useEffect(() => {
    (async () => {
      const config = await cloudConfigService.getConfig();
      setServerUrl(config.serverUrl || '');
      setServerAccessKey(config.serverAccessKey || '');
      setTestedOk(null);
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', async () => {
      const config = await cloudConfigService.getConfig();
      const authed = !!config.auth?.accessToken && !!config.auth?.user;
      if (authed && testedOk) {
        Alert.alert('已完成认证', '已登录云端账号');
        if (navigation.canGoBack?.()) {
          navigation.goBack();
          return;
        }
        navigation.navigate?.('CloudSettings');
      }
    });
    return unsubscribe;
  }, [navigation, testedOk]);

  const openAuth = () => {
    const parent = navigation.getParent?.();
    if (parent?.navigate) {
      parent.navigate('Auth');
      return;
    }
    navigation.navigate?.('Auth');
  };

  const handleTest = async () => {
    const url = normalizeServerUrl(serverUrl);
    if (!url) {
      Alert.alert('提示', '请输入服务器地址');
      return;
    }

    setTesting(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const headers: Record<string, string> = {};
      if (serverAccessKey.trim()) {
        headers['x-server-token'] = serverAccessKey.trim();
        headers['x-server-access-key'] = serverAccessKey.trim();
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
      } catch {
      }

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
      if (requiresKey && !serverAccessKey.trim()) {
        Alert.alert('需要访问码', '该服务器开启了访问控制，请填写服务器访问码后再测试');
        return;
      }
      if (requiresKey && data.accessKeyValid === false) {
        Alert.alert('访问码错误', '服务器访问码不正确，请检查后重试');
        return;
      }

      if (!res.ok) {
        if ((res.status === 401 || res.status === 403) && !serverAccessKey.trim()) {
          Alert.alert('需要访问码', '该服务器需要服务器访问码（Server Access Key）才能访问');
          return;
        }
        if (res.status === 401 || res.status === 403) {
          Alert.alert('访问受限', '服务器访问码不正确，或服务器拒绝访问');
          return;
        }
        Alert.alert('连接失败', `服务器返回状态码: ${res.status}`);
        return;
      }

      await cloudConfigService.setServer(url, serverAccessKey.trim() || undefined);
      setTestedOk({ url, version: data.version });
      Alert.alert('连接成功', '下一步请进行登录/注册以完成认证');
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        Alert.alert('连接超时', '无法连接到服务器，请检查地址或网络');
      } else {
        Alert.alert('连接失败', '无法连接到服务器，请检查地址是否正确');
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={styles.content}>
      <SettingSection title="连接云端服务器">
        <View style={styles.inputBlock}>
          <CleanInput
            label="Server URL"
            value={serverUrl}
            onChangeText={(v) => {
              setServerUrl(v);
              setTestedOk(null);
            }}
            placeholder="http://192.168.1.x:3000"
            autoCapitalize="none"
            autoCorrect={false}
            variant="outlined"
            containerStyle={{ marginBottom: 0 }}
          />
          <CleanInput
            label="服务器访问码（可选）"
            value={serverAccessKey}
            onChangeText={(v) => {
              setServerAccessKey(v);
              setTestedOk(null);
            }}
            placeholder="如果服务器开启访问控制则必填"
            autoCapitalize="none"
            autoCorrect={false}
            variant="outlined"
            containerStyle={{ marginBottom: 0, marginTop: 12 }}
          />
        </View>
        <SettingItem
          label={testing ? '正在测试...' : '测试连接'}
          icon="network-check"
          onPress={handleTest}
          disabled={testing || !serverUrl.trim()}
          isLast
          rightElement={testing ? <ActivityIndicator size="small" color={theme.colors.primary} /> : undefined}
          color={!serverUrl.trim() ? theme.colors.outline : theme.colors.primary}
        />
      </SettingSection>

      {testedOk && (
        <SettingSection title="下一步">
          <SettingItem label="去登录/注册" icon="login" onPress={openAuth} isLast />
        </SettingSection>
      )}

      <CleanText style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
        连接仅用于配置服务器地址与访问码。账号登录请在下一步完成。
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
    inputBlock: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    hint: {
      paddingHorizontal: 16,
      marginTop: 12,
      fontSize: 12,
      lineHeight: 18,
    },
  });
