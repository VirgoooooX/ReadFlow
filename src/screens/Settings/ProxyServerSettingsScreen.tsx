import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { SettingsService } from '../../services/SettingsService';
import { RSSService } from '../../services/rss';
import { VocabularyService } from '../../services/VocabularyService';
import { useUser } from '../../contexts/UserContext';  // 导入 UserContext
import type { ProxyModeConfig } from '../../types';

export const ProxyServerSettingsScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const { state } = useUser();  // 获取当前登录用户
  const styles = createStyles(isDark, theme);

  const [config, setConfig] = useState<ProxyModeConfig>({
    enabled: false,
    serverUrl: '',
    serverPassword: '',
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncingUserInfo, setIsSyncingUserInfo] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('从未同步');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const savedConfig = await SettingsService.getInstance().getProxyModeConfig();
      setConfig(savedConfig);
      setIsConnected(!!savedConfig.token);
      
      if (savedConfig.lastSyncTime) {
        const syncDate = new Date(savedConfig.lastSyncTime);
        setLastSyncTime(formatSyncTime(syncDate));
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  };

  const formatSyncTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
  };

  const handleToggleEnabled = async (value: boolean) => {
    if (value && !isConnected) {
      Alert.alert('提示', '请先连接到代理服务器');
      return;
    }

    if (value) {
      // 首次启用代理模式，需要同步所有已有的订阅源到服务端
      Alert.alert(
        '确认',
        '启用代理模式后，将同步所有现有订阅源到服务端。\n\n这是一次性操作，请耐心等待。',
        [
          {
            text: '取消',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: '确认启用',
            onPress: async () => {
              await syncSourcesAndEnable();
            },
          },
        ]
      );
    } else {
      // 禁用代理模式
      const newConfig = { ...config, enabled: false };
      setConfig(newConfig);
      
      try {
        await SettingsService.getInstance().saveProxyModeConfig(newConfig);
        Alert.alert('成功', '代理模式已关闭，客户端将使用本地直连模式');
      } catch (error) {
        console.error('保存配置失败:', error);
        Alert.alert('失败', '保存配置时出错');
      }
    }
  };

  const syncSourcesAndEnable = async () => {
    try {
      Alert.alert('提示', '正在同步订阅源到服务端...\n请稍候');
      
      // 同步所有源到服务端
      await RSSService.getInstance().syncAllSourcesWithProxyServer(config);
      
      // 启用代理模式
      const newConfig = { ...config, enabled: true };
      setConfig(newConfig);
      await SettingsService.getInstance().saveProxyModeConfig(newConfig);
      
      Alert.alert(
        '成功',
        '代理模式已启用！\n\n所有订阅源已同步到服务端。\n系统将通过代理服务器获取最新文章。'
      );
    } catch (error) {
      console.error('启用代理模式失败:', error);
      Alert.alert('失败', '启用代理模式时出错，请检查服务器连接');
    }
  };

  const handleTestConnection = async () => {
    if (!config.serverUrl.trim()) {
      Alert.alert('提示', '请输入服务器地址');
      return;
    }

    setIsTesting(true);
    try {
      const settingsService = SettingsService.getInstance();
      const isReachable = await settingsService.testProxyServerConnection(config.serverUrl);
      
      if (isReachable) {
        Alert.alert('成功', '服务器连接正常');
      } else {
        Alert.alert('失败', '无法连接到服务器，请检查地址是否正确');
      }
    } catch (error) {
      Alert.alert('失败', '连接测试失败');
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async () => {
    if (!config.serverUrl.trim()) {
      Alert.alert('提示', '请输入服务器地址');
      return;
    }

    if (!config.serverPassword.trim()) {
      Alert.alert('提示', '请输入部署密码');
      return;
    }

    // 检查用户是否登录
    if (!state.user || !state.user.username) {
      Alert.alert('提示', '请先登录您的账户');
      return;
    }

    setIsConnecting(true);
    try {
      console.log('[ProxyConnect] 开始连接代理服务器...');
      console.log('[ProxyConnect] 当前用户:', state.user.username, state.user.email);

      const settingsService = SettingsService.getInstance();
      
      // 步骤 1: 登录代理服务器
      const result = await settingsService.loginToProxyServer(
        config.serverUrl,
        config.serverPassword,
        state.user.username  // 使用真实用户名
      );

      if (result.success) {
        setIsConnected(true);
        await loadConfig(); // 重新加载配置以获取 token
        console.log('[ProxyConnect] 登录成功！');

        // 步骤 2: 自动同步订阅源到代理服务器
        try {
          console.log('[ProxyConnect] 开始同步订阅源...');
          const rssService = RSSService.getInstance();
          const sources = await rssService.getAllRSSSources();
          
          if (sources.length > 0) {
            const updatedConfig = await settingsService.getProxyModeConfig();
            const syncResult = await settingsService.syncSubscriptionsToProxy(sources, updatedConfig);
            
            Alert.alert('连接成功', `已成功连接到代理服务器！

用户: ${state.user.username}
订阅源同步: ${syncResult.success}/${sources.length} 个成功

您现在可以启用代理模式。`);
          } else {
            Alert.alert('连接成功', `已成功连接到代理服务器！

用户: ${state.user.username}
本地没有订阅源需要同步

您现在可以启用代理模式。`);
          }
        } catch (syncError) {
          console.error('[ProxyConnect] 订阅源同步失败:', syncError);
          Alert.alert('连接成功', `已成功连接到代理服务器！

用户: ${state.user.username}
但订阅源同步失败，请稍后重试

您现在可以启用代理模式。`);
        }
      } else {
        // 详细的错误提示
        let errorMsg = result.message || '请检查服务器地址和密码是否正确';
        console.error('[ProxyConnect] 登录失败详情:', {
          serverUrl: config.serverUrl,
          username: state.user.username,
          email: state.user.email,
          error: result.message,
        });
        Alert.alert('连接失败', `错误: ${errorMsg}

请检查:
• 服务器地址是否正确
• 部署密码是否正确
• 服务器是否在线`);
      }
    } catch (error) {
      console.error('连接失败:', error);
      Alert.alert('连接失败', '连接服务器时出错，请稍后重试');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSyncNow = async () => {
    if (!config.enabled || !config.token) {
      Alert.alert('提示', '请先启用代理模式');
      return;
    }

    try {
      Alert.alert('同步中', '正在同步单词本数据...');
      const vocabService = VocabularyService.getInstance();
      await vocabService.syncToProxyServer();
      
      await loadConfig();
      Alert.alert('成功', '单词本同步完成！');
    } catch (error) {
      console.error('同步失败:', error);
      Alert.alert('失败', '同步时出错，请稍后重试');
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      '断开连接',
      '确定要断开与代理服务器的连接吗？\n\n这将关闭代理模式，已保存的订阅源不会丢失。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '断开',
          style: 'destructive',
          onPress: async () => {
            try {
              await SettingsService.getInstance().saveProxyModeConfig({
                enabled: false,
                serverUrl: '',
                serverPassword: '',
              });
              setConfig({ enabled: false, serverUrl: '', serverPassword: '' });
              setIsConnected(false);
              Alert.alert('成功', '已断开连接');
            } catch (error) {
              console.error('断开连接失败:', error);
              Alert.alert('失败', '断开连接时出错');
            }
          },
        },
      ]
    );
  };

  /**
   * 同步用户信息到服务端
   */
  const handleSyncUserInfo = async () => {
    if (!config.enabled || !config.token) {
      Alert.alert('提示', '请先启用代理模式');
      return;
    }

    setIsSyncingUserInfo(true);
    try {
      console.log('\n' + '='.repeat(60));
      console.log('[Sync User Info] 🚀 开始同步用户信息到服务端');
      console.log('='.repeat(60));

      // 1. 同步订阅源
      console.log('[Sync User Info] 📡 步骤1: 同步订阅源...');
      await RSSService.getInstance().syncAllSourcesWithProxyServer(config);

      // 2. 同步生词本
      console.log('[Sync User Info] 📚 步骤2: 同步生词本...');
      await VocabularyService.getInstance().syncToProxyServer();

      // 3. 更新最后同步时间
      const newConfig = { ...config, lastSyncTime: new Date().toISOString() };
      await SettingsService.getInstance().saveProxyModeConfig(newConfig);
      setConfig(newConfig);
      setLastSyncTime('刚刚');

      console.log('[Sync User Info] ✅ 所有用户信息同步完成');
      console.log('='.repeat(60) + '\n');

      Alert.alert('同步完成', '所有用户信息已同步到服务端\n\n包括：\n• 订阅源列表\n• 生词本数据');
    } catch (error) {
      console.error('[Sync User Info] 💥 同步失败:', error);
      Alert.alert('同步失败', '同步用户信息时出错，请稍后重试');
    } finally {
      setIsSyncingUserInfo(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 状态卡片 */}
        <View style={[styles.statusCard, isConnected && styles.statusCardConnected]}>
          <View style={styles.statusHeader}>
            <MaterialIcons 
              name={isConnected ? "cloud-done" : "cloud-off"} 
              size={32} 
              color={isConnected ? '#10B981' : theme?.colors?.onSurfaceVariant || '#666'} 
            />
            <Text style={styles.statusTitle}>
              {isConnected ? '已连接' : '未连接'}
            </Text>
          </View>
          {isConnected && (
            <View style={styles.statusInfo}>
              <Text style={styles.statusInfoText}>
                服务器: {config.serverUrl}
              </Text>
              <Text style={styles.statusInfoText}>
                最后同步: {lastSyncTime}
              </Text>
            </View>
          )}
        </View>

        {/* 启用代理模式开关 */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <MaterialIcons name="swap-horiz" size={24} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.switchText}>启用代理模式</Text>
            </View>
            <Switch
              value={config.enabled}
              onValueChange={handleToggleEnabled}
              trackColor={{ false: '#767577', true: theme?.colors?.primary || '#3B82F6' }}
              thumbColor={config.enabled ? '#fff' : '#f4f3f4'}
            />
          </View>
          <Text style={styles.helpText}>
            启用后，新添加的订阅源将通过代理服务器获取，图片已压缩优化
          </Text>
        </View>

        {/* 服务器配置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>服务器配置</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>服务器地址</Text>
            <TextInput
              style={styles.input}
              placeholder="如 http://192.168.1.100:8080"
              placeholderTextColor={theme?.colors?.onSurfaceVariant || '#999'}
              value={config.serverUrl}
              onChangeText={(text) => setConfig({ ...config, serverUrl: text })}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isConnected}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>部署密码</Text>
            <TextInput
              style={styles.input}
              placeholder="服务器部署时设置的密码"
              placeholderTextColor={theme?.colors?.onSurfaceVariant || '#999'}
              value={config.serverPassword}
              onChangeText={(text) => setConfig({ ...config, serverPassword: text })}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isConnected}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>用户信息（当前登录）</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={state.user ? `${state.user.username} (${state.user.email})` : '未登录'}
              editable={false}
            />
            <Text style={styles.helpText}>
              {state.user 
                ? '将使用当前用户信息连接代理服务器' 
                : '请先登录您的账户才能连接代理服务器'
              }
            </Text>
          </View>
        </View>

        {/* 操作按钮 */}
        <View style={styles.section}>
          {!isConnected ? (
            <>
              <TouchableOpacity
                style={[styles.button, styles.buttonTest]}
                onPress={handleTestConnection}
                disabled={isTesting}
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
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="cloud-upload" size={20} color="#fff" />
                    <Text style={styles.buttonText}>连接服务器</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleSyncNow}
              >
                <MaterialIcons name="sync" size={20} color="#fff" />
                <Text style={styles.buttonText}>立即同步单词本</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.buttonSync]}
                onPress={handleSyncUserInfo}
                disabled={isSyncingUserInfo}
              >
                {isSyncingUserInfo ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="cloud-upload" size={20} color="#fff" />
                    <Text style={styles.buttonText}>同步所有用户信息到服务端</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.buttonDanger]}
                onPress={handleDisconnect}
              >
                <MaterialIcons name="cloud-off" size={20} color="#fff" />
                <Text style={styles.buttonText}>断开连接</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 说明文档 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>功能说明</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>• RSS 加速：</Text>
              {'\n'}通过代理服务器抓取和压缩RSS文章，节省流量和存储空间
            </Text>
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>• 单词本同步：</Text>
              {'\n'}自动在多设备间同步生词本数据，学习进度不丢失
            </Text>
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>• 离线优先：</Text>
              {'\n'}数据本地存储，弱网环境也能流畅使用
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.surface || (isDark ? '#121212' : '#F5F5F5'),
  },
  content: {
    padding: 16,
  },
  statusCard: {
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#1E1E1E' : '#FFFFFF'),
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme?.colors?.outline || (isDark ? '#333' : '#E0E0E0'),
  },
  statusCardConnected: {
    borderColor: '#10B981',
    backgroundColor: isDark ? '#0F3A2E' : '#D1FAE5',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  statusInfo: {
    marginTop: 12,
    gap: 6,
  },
  statusInfoText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#1E1E1E' : '#FFFFFF'),
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  switchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#1E1E1E' : '#FFFFFF'),
    borderWidth: 1,
    borderColor: theme?.colors?.outline || (isDark ? '#333' : '#E0E0E0'),
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  inputDisabled: {
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#2A2A2A' : '#F5F5F5'),
    opacity: 0.6,
  },
  helpText: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginTop: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  buttonPrimary: {
    backgroundColor: theme?.colors?.primary || '#3B82F6',
  },
  buttonSync: {
    backgroundColor: '#10B981', // 绿色，表示同步
  },
  buttonTest: {
    backgroundColor: theme?.colors?.secondary || '#8B5CF6',
  },
  buttonDanger: {
    backgroundColor: '#EF4444',
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
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    lineHeight: 20,
  },
  infoBold: {
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
});
