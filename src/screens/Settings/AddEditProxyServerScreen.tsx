import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { SettingsService } from '../../services/SettingsService';
import type { ProxyServer } from '../../types';

interface Props {
  route?: {
    params?: {
      serverId?: string;
    };
  };
  navigation?: any;
}

export const AddEditProxyServerScreen: React.FC<Props> = ({ route, navigation }) => {
  const { theme } = useThemeContext();
  const styles = createStyles(theme);

  const serverId = route?.params?.serverId;
  const isEditing = !!serverId;

  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

  useEffect(() => {
    if (isEditing && serverId) {
      loadServer();
    }
  }, [serverId]);

  const loadServer = async () => {
    try {
      setIsLoading(true);
      const config = await SettingsService.getInstance().getProxyServersConfig();
      const server = config.servers.find(s => s.id === serverId);
      if (server) {
        setName(server.name);
        setServerUrl(server.serverUrl);
        setToken(server.token || '');
      }
    } catch (error) {
      console.error('加载服务器失败:', error);
      Alert.alert('错误', '加载服务器信息失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!serverUrl.trim()) {
      Alert.alert('提示', '请输入服务器地址');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    
    try {
      const testUrl = `${serverUrl.replace(/\/$/, '')}/api/rss?url=${encodeURIComponent('https://example.com')}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const headers: any = {};
      if (token.trim()) {
        headers['Authorization'] = `Bearer ${token.trim()}`;
      }
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.status === 401) {
        setTestResult('fail');
        Alert.alert('认证失败', '服务器需要 Token 或 Token 不正确');
        return;
      }
      
      setTestResult('success');
      Alert.alert('连接成功', '代理服务器连接正常！');
    } catch (error: any) {
      console.error('连接测试失败:', error);
      setTestResult('fail');
      
      if (error.name === 'AbortError') {
        Alert.alert('连接超时', '无法连接到服务器，请检查地址是否正确');
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Alert.alert('连接失败', '错误：' + errorMsg);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入服务器名称');
      return;
    }
    if (!serverUrl.trim()) {
      Alert.alert('提示', '请输入服务器地址');
      return;
    }
    
    setIsSaving(true);
    try {
      const settingsService = SettingsService.getInstance();
      const serverData = {
        name: name.trim(),
        serverUrl: serverUrl.trim().replace(/\/$/, ''),
        token: token.trim() || undefined,
        lastTestResult: testResult || undefined,
        lastTestTime: testResult ? new Date().toISOString() : undefined,
      };

      if (isEditing && serverId) {
        await settingsService.updateProxyServer(serverId, serverData);
        Alert.alert('保存成功', '服务器配置已更新', [
          { text: '确定', onPress: () => navigation?.goBack() }
        ]);
      } else {
        await settingsService.addProxyServer(serverData as any);
        Alert.alert('添加成功', '新服务器已添加', [
          { text: '确定', onPress: () => navigation?.goBack() }
        ]);
      }
    } catch (error) {
      console.error('保存失败:', error);
      Alert.alert('保存失败', '请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 服务器名称 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>服务器名称 *</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="如：家里代理、公司代理"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={name}
              onChangeText={setName}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={styles.helpText}>
            给服务器起个容易识别的名字
          </Text>
        </View>

        {/* 服务器地址 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>服务器地址 *</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                testResult === 'success' && styles.inputSuccess,
                testResult === 'fail' && styles.inputError,
              ]}
              placeholder="如 https://proxy.yourdomain.com"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={serverUrl}
              onChangeText={(text) => {
                setServerUrl(text);
                setTestResult(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {testResult === 'success' && (
              <MaterialIcons 
                name="check-circle" 
                size={24} 
                color={theme.colors.primary} 
                style={styles.inputIcon}
              />
            )}
            {testResult === 'fail' && (
              <MaterialIcons 
                name="error" 
                size={24} 
                color={theme.colors.error} 
                style={styles.inputIcon}
              />
            )}
          </View>
        </View>

        {/* Token */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>认证 Token（可选）</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="如果服务器配置了 Token，请在此输入"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={true}
            />
          </View>
          <Text style={styles.helpText}>
            用于安全认证，保护公网服务器不被滥用
          </Text>
        </View>

        {/* 操作按钮 */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.button, styles.buttonTest]}
            onPress={handleTestConnection}
            disabled={isTesting || !serverUrl.trim()}
          >
            {isTesting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="wifi-tethering" size={20} color="#fff" />
                <Text style={styles.buttonText}>测试连接</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button, 
              styles.buttonPrimary,
              isSaving && styles.buttonDisabled
            ]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="save" size={20} color="#fff" />
                <Text style={styles.buttonText}>{isEditing ? '保存修改' : '添加服务器'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
sectionTitle: {
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
      marginBottom: 10,
      marginTop: -5,  // 👈 增加与上方容器的距离
      textTransform: 'uppercase',
      letterSpacing: 0.3,
},
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: theme.colors.surfaceVariant,
    borderWidth: 2,
    borderColor: theme.colors.outline,
    borderRadius: 12,
    padding: 16,
    paddingRight: 48,
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    color: theme.colors.onSurface,
  },
  inputSuccess: {
    borderColor: theme.semantic.success,
  },
  inputError: {
    borderColor: theme.semantic.error,
  },
  inputIcon: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
    marginTop: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
  },
  buttonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  buttonTest: {
    backgroundColor: theme.colors.secondary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: theme.colors.onPrimary,
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    fontWeight: '600',
  },
});

export default AddEditProxyServerScreen;
