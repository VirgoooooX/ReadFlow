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
import type { ProxyModeConfig } from '../../types';

export const ProxyServerSettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  const [serverUrl, setServerUrl] = useState('');
  const [serverToken, setServerToken] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const savedConfig = await SettingsService.getInstance().getProxyModeConfig();
      setServerUrl(savedConfig.serverUrl || '');
      setServerToken(savedConfig.token || '');
    } catch (error) {
      console.error('加载配置失败:', error);
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
      // 测试连接：调用 /api/rss 接口检查服务器是否可达
      const testUrl = `${serverUrl.replace(/\/$/, '')}/api/rss?url=${encodeURIComponent('https://example.com')}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const headers: any = {};
      if (serverToken.trim()) {
        headers['Authorization'] = `Bearer ${serverToken.trim()}`;
      }
      
      console.log('[TestConnection] 正在测试:', { testUrl, hasToken: !!serverToken.trim() });
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log('[TestConnection] 响应状例:', response.status);
      
      // 401 未认证错误
      if (response.status === 401) {
        setTestResult('fail');
        Alert.alert('认证失败', '服务器需要 Token 或 Token 不正确\n\n请检查：\n• Token 是否与服务器配置一致\n• 服务器是否启用了 AUTH_TOKEN');
        return;
      }
      
      // 只要服务器有响应就认为连接成功（即使返回错误，因为 example.com 不是有效的 RSS 源）
      setTestResult('success');
      Alert.alert('连接成功', '代理服务器连接正常！');
    } catch (error: any) {
      console.error('连接测试失败:', error);
      setTestResult('fail');
      
      if (error.name === 'AbortError') {
        Alert.alert('连接超时', '无法连接到服务器\n\n请检查：\n• 服务器地址是否正确\n• 服务器是否正常运行\n• 网络是否下\n\nURL: ' + serverUrl);
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Alert.alert('连接失败', '错误：' + errorMsg);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!serverUrl.trim()) {
      Alert.alert('提示', '请输入服务器地址');
      return;
    }
    
    setIsSaving(true);
    try {
      const config: ProxyModeConfig = {
        enabled: true,
        serverUrl: serverUrl.trim().replace(/\/$/, ''), // 移除末尾斜杠
        serverPassword: '',
        token: serverToken.trim(),
      };
      
      await SettingsService.getInstance().saveProxyModeConfig(config);
      Alert.alert('保存成功', '代理服务器配置已保存');
    } catch (error) {
      console.error('保存失败:', error);
      Alert.alert('保存失败', '请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 服务器配置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>服务器地址</Text>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                testResult === 'success' && styles.inputSuccess,
                testResult === 'fail' && styles.inputError,
              ]}
              placeholder="如 https://proxy.yourdomain.com"
              placeholderTextColor={theme?.colors?.onSurfaceVariant || '#999'}
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
                color="#10B981" 
                style={styles.inputIcon}
              />
            )}
          </View>
          
          <Text style={styles.helpText}>
            代理服务器用于获取需要翻墙的 RSS 源和图片
          </Text>
        </View>

        {/* Token / 密码 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>认证 Token（可选）</Text>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="如果服务器配置了 Token，请在此输入"
              placeholderTextColor={theme?.colors?.onSurfaceVariant || '#999'}
              value={serverToken}
              onChangeText={setServerToken}
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
                <Text style={styles.buttonText}>保存</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 说明文档 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>使用说明</Text>
          <View style={styles.infoBox}>
            <View style={styles.infoItem}>
              <MaterialIcons name="cloud" size={20} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.infoText}>
                代理服务器用于获取被墙的国外 RSS 源
              </Text>
            </View>
            <View style={styles.infoItem}>
              <MaterialIcons name="image" size={20} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.infoText}>
                自动代理加载被墙的图片（如 Twitter、Instagram）
              </Text>
            </View>
            <View style={styles.infoItem}>
              <MaterialIcons name="security" size={20} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.infoText}>
                Token 保护公网服务器安全，防止被滥用
              </Text>
            </View>
            <View style={styles.infoItem}>
              <MaterialIcons name="speed" size={20} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.infoText}>
                国内源请关闭代理以获得更快速度
              </Text>
            </View>
          </View>
        </View>

        {/* 如何使用 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>如何使用</Text>
          <View style={styles.stepsBox}>
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <Text style={styles.stepText}>
                输入代理服务器地址和 Token（如果有的话）
              </Text>
            </View>
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <Text style={styles.stepText}>
                添加 RSS 源时，对于需要翻墙的源开启「通过代理获取」开关
              </Text>
            </View>
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <Text style={styles.stepText}>
                国内源保持关闭，直接抽取更快
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
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 12,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#1E1E1E' : '#FFFFFF'),
    borderWidth: 2,
    borderColor: theme?.colors?.outline || (isDark ? '#333' : '#E0E0E0'),
    borderRadius: 12,
    padding: 16,
    paddingRight: 48,
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  inputSuccess: {
    borderColor: '#10B981',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  inputIcon: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
  helpText: {
    fontSize: 13,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
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
    backgroundColor: theme?.colors?.primary || '#3B82F6',
  },
  buttonTest: {
    backgroundColor: theme?.colors?.secondary || '#8B5CF6',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#1E1E1E' : '#FFFFFF'),
    padding: 16,
    borderRadius: 12,
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    lineHeight: 20,
  },
  stepsBox: {
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#1E1E1E' : '#FFFFFF'),
    padding: 16,
    borderRadius: 12,
    gap: 16,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme?.colors?.primary || '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    lineHeight: 20,
  },
});
