import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { SettingsService } from '../../services/SettingsService';
import type { ProxyServer, ProxyServersConfig } from '../../types';
import { useFocusEffect } from '@react-navigation/native';

interface Props {
  navigation?: any;
}

export const ProxyServerSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const styles = createStyles(isDark, theme);

  const [config, setConfig] = useState<ProxyServersConfig>({ servers: [], activeServerId: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);

  // 使用 useFocusEffect 在页面获得焦点时刷新数据
  useFocusEffect(
    useCallback(() => {
      loadConfig();
    }, [])
  );

  const loadConfig = async () => {
    try {
      const savedConfig = await SettingsService.getInstance().getProxyServersConfig();
      setConfig(savedConfig);
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadConfig();
  };

  const handleAddServer = () => {
    navigation?.navigate('AddEditProxyServer', {});
  };

  const handleEditServer = (serverId: string) => {
    navigation?.navigate('AddEditProxyServer', { serverId });
  };

  const handleDeleteServer = (server: ProxyServer) => {
    Alert.alert(
      '删除确认',
      `确定要删除服务器「${server.name}」吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await SettingsService.getInstance().deleteProxyServer(server.id);
              await loadConfig();
              Alert.alert('成功', '服务器已删除');
            } catch (error) {
              console.error('删除失败:', error);
              Alert.alert('删除失败', '请稍后重试');
            }
          },
        },
      ]
    );
  };

  const handleSetActive = async (serverId: string | null) => {
    try {
      await SettingsService.getInstance().setActiveProxyServer(serverId);
      await loadConfig();
      if (serverId) {
        const server = config.servers.find(s => s.id === serverId);
        Alert.alert('已切换', `当前使用：${server?.name || '未知'}`);
      } else {
        Alert.alert('已关闭', '代理服务器已禁用');
      }
    } catch (error) {
      console.error('切换失败:', error);
      Alert.alert('切换失败', '请稍后重试');
    }
  };

  const handleTestConnection = async (server: ProxyServer) => {
    setTestingServerId(server.id);
    
    try {
      const testUrl = `${server.serverUrl.replace(/\/$/, '')}/api/rss?url=${encodeURIComponent('https://example.com')}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const headers: any = {};
      if (server.token) {
        headers['Authorization'] = `Bearer ${server.token}`;
      }
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.status === 401) {
        await SettingsService.getInstance().updateServerTestResult(server.id, 'fail');
        await loadConfig();
        Alert.alert('认证失败', '服务器需要 Token 或 Token 不正确');
        return;
      }
      
      await SettingsService.getInstance().updateServerTestResult(server.id, 'success');
      await loadConfig();
      Alert.alert('连接成功', `服务器「${server.name}」连接正常！`);
    } catch (error: any) {
      console.error('连接测试失败:', error);
      await SettingsService.getInstance().updateServerTestResult(server.id, 'fail');
      await loadConfig();
      
      if (error.name === 'AbortError') {
        Alert.alert('连接超时', '无法连接到服务器');
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Alert.alert('连接失败', '错误：' + errorMsg);
      }
    } finally {
      setTestingServerId(null);
    }
  };

  const renderServerItem = (server: ProxyServer) => {
    const isActive = config.activeServerId === server.id;
    const isTesting = testingServerId === server.id;

    return (
      <View key={server.id} style={[styles.serverCard, isActive && styles.serverCardActive]}>
        <TouchableOpacity 
          style={styles.serverMain}
          onPress={() => handleSetActive(isActive ? null : server.id)}
          activeOpacity={0.7}
        >
          <View style={styles.serverInfo}>
            <View style={styles.serverHeader}>
              <MaterialIcons 
                name={isActive ? 'check-circle' : 'radio-button-unchecked'} 
                size={24} 
                color={isActive ? '#10B981' : (theme?.colors?.onSurfaceVariant || '#999')} 
              />
              <Text style={[styles.serverName, isActive && styles.serverNameActive]}>
                {server.name}
              </Text>
              {isActive && (
                <View style={styles.activeTag}>
                  <Text style={styles.activeTagText}>使用中</Text>
                </View>
              )}
            </View>
            <Text style={styles.serverUrl} numberOfLines={1}>
              {server.serverUrl}
            </Text>
            {server.lastTestResult && (
              <View style={styles.testResultRow}>
                <MaterialIcons 
                  name={server.lastTestResult === 'success' ? 'check-circle' : 'error'} 
                  size={14} 
                  color={server.lastTestResult === 'success' ? '#10B981' : '#EF4444'} 
                />
                <Text style={[
                  styles.testResultText,
                  { color: server.lastTestResult === 'success' ? '#10B981' : '#EF4444' }
                ]}>
                  {server.lastTestResult === 'success' ? '连接正常' : '连接失败'}
                </Text>
                {server.lastTestTime && (
                  <Text style={styles.testTimeText}>
                    {formatTime(server.lastTestTime)}
                  </Text>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.serverActions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleTestConnection(server)}
            disabled={isTesting}
          >
            {isTesting ? (
              <ActivityIndicator size="small" color={theme?.colors?.primary || '#3B82F6'} />
            ) : (
              <MaterialIcons name="wifi-tethering" size={20} color={theme?.colors?.primary || '#3B82F6'} />
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleEditServer(server.id)}
          >
            <MaterialIcons name="edit" size={20} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleDeleteServer(server)}
          >
            <MaterialIcons name="delete" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
      return `${Math.floor(diff / 86400000)}天前`;
    } catch {
      return '';
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme?.colors?.primary || '#3B82F6'} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.content}>
        {/* 服务器列表 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>代理服务器列表</Text>
            <TouchableOpacity style={styles.addButton} onPress={handleAddServer}>
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>添加</Text>
            </TouchableOpacity>
          </View>
          
          {config.servers.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="cloud-off" size={48} color={theme?.colors?.onSurfaceVariant || '#999'} />
              <Text style={styles.emptyTitle}>暂无代理服务器</Text>
              <Text style={styles.emptySubtitle}>点击「添加」按钮添加代理服务器</Text>
            </View>
          ) : (
            <View style={styles.serverList}>
              {config.servers.map(renderServerItem)}
            </View>
          )}
        </View>

        {/* 当前状态 */}
        {config.activeServerId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>当前状态</Text>
            <View style={styles.statusCard}>
              <MaterialIcons name="cloud-done" size={24} color="#10B981" />
              <View style={styles.statusInfo}>
                <Text style={styles.statusTitle}>代理已启用</Text>
                <Text style={styles.statusSubtitle}>
                  正在使用：{config.servers.find(s => s.id === config.activeServerId)?.name || '未知'}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.disableButton}
                onPress={() => handleSetActive(null)}
              >
                <Text style={styles.disableButtonText}>禁用</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 使用说明 */}
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
              <MaterialIcons name="swap-horiz" size={20} color={theme?.colors?.primary || '#3B82F6'} />
              <Text style={styles.infoText}>
                支持添加多个服务器，点击即可快速切换
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
    paddingHorizontal: 16,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: -5,
    marginBottom: 10,    
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.primary || '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  serverList: {
    gap: 12,
  },
  serverCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    padding: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  serverCardActive: {
    borderColor: '#10B981',
  },
  serverMain: {
    flex: 1,
  },
  serverInfo: {
    gap: 6,
  },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serverName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    flex: 1,
  },
  serverNameActive: {
    color: '#10B981',
  },
  activeTag: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeTagText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },
  serverUrl: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginLeft: 32,
  },
  testResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 32,
    marginTop: 4,
  },
  testResultText: {
    fontSize: 11,
  },
  testTimeText: {
    fontSize: 11,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginLeft: 8,
  },
  serverActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E8E8E8'),
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    padding: 10,
    borderRadius: 12,
    gap: 12,
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  statusSubtitle: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginTop: 2,
  },
  disableButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EF4444',
  },
  disableButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  infoBox: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    padding: 10,
    borderRadius: 12,
    gap: 14,
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    lineHeight: 20,
  },
});
