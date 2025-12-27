import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useThemeContext } from '../../theme';
import { 
  SettingItem, 
  SettingSection 
} from '../../components/ui';
import { typography } from '../../theme/typography';
import { useUser } from '../../contexts/UserContext';
import { SettingsService } from '../../services';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UserStackParamList } from '../../navigation/types';

type MineScreenNavigationProp = NativeStackNavigationProp<UserStackParamList>;

const MineScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<MineScreenNavigationProp>();
  const { state, logout } = useUser();
  const { user } = state;
  const styles = createStyles(isDark, theme);

  // 状态管理
  const [proxyStatus, setProxyStatus] = useState<{ enabled: boolean; connected: boolean }>({
    enabled: false,
    connected: false,
  });

  // 获取焦点时刷新数据
  useFocusEffect(
    useCallback(() => {
      checkProxyStatus();
    }, [])
  );

  const checkProxyStatus = async () => {
    try {
      const config = await SettingsService.getInstance().getProxyServersConfig();
      setProxyStatus({
        enabled: !!config.activeServerId,
        connected: config.servers.length > 0,
      });
    } catch (error) {
      console.error('检查代理状态失败:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定', style: 'destructive', onPress: logout },
    ]);
  };

  // 统计卡片组件
  // };
  // 已删除 StatCard 组件（不再使用）

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* --- 头部用户信息区域 --- */}
      <View style={styles.headerCard}>
        <View style={styles.userInfoRow}>
          <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <MaterialIcons name="person" size={40} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.userInfoText}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.username || '未登录用户'}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user?.email || '点击头像编辑资料'}
            </Text>
          </View>

          {/* 右侧编辑按钮 */}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <MaterialIcons name="edit" size={20} color={theme?.colors?.onSurfaceVariant || '#666'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* --- 用户头部信息区域结束 --- */}

      {/* 第1组: 阅读与内容 */}
      <SettingSection title="阅读与内容">
        <SettingItem
          icon="chrome-reader-mode"
          label="阅读偏好"
          onPress={() => navigation.navigate('ReadingSettings')}
          color={theme?.colors?.primary || '#3B82F6'}
        />
        <SettingItem
          icon="folder"
          label="分组管理"
          onPress={() => navigation.navigate('GroupManagement')}
          color="#8B5CF6"
        />
        <SettingItem
          icon="filter-list"
          label="过滤规则"
          onPress={() => navigation.navigate('FilterManagement')}
          color="#F59E0B"
          isLast
        />
      </SettingSection>

      {/* 第2组: 工具与服务 */}
      <SettingSection title="工具与服务">
        <SettingItem
          icon="psychology"
          label="AI 助手配置"
          onPress={() => navigation.navigate('LLMSettings')}
          color="#8B5CF6"
        />
        <SettingItem
          icon="autorenew"
          label="启动自动刷新"
          onPress={() => navigation.navigate('RSSStartupSettings')}
          color="#10B981"
        />
        <SettingItem
          icon="cloud-queue"
          label="代理服务器"
          onPress={() => navigation.navigate('ProxyServerSettings')}
          color={proxyStatus.enabled ? '#10B981' : '#6B7280'}
          valueText={proxyStatus.enabled ? '已启用' : '未启用'}
        />
        <SettingItem
          icon="palette"
          label="主题设置"
          onPress={() => navigation.navigate('ThemeSettings')}
          color="#EC4899"
          valueText={isDark ? '深色' : '浅色'}
          isLast
        />
      </SettingSection>

      {/* 第3组: 系统与数据 */}
      <SettingSection title="系统与数据">
        <SettingItem
          icon="storage"
          label="存储空间管理"
          onPress={() => navigation.navigate('StorageManagement')}
          color="#64748B"
        />
        <SettingItem
          icon="info"
          label="关于应用"
          onPress={() => navigation.navigate('About')}
          color="#64748B"
        />
        <SettingItem
          icon="logout"
          label="退出登录"
          isDestructive
          onPress={handleLogout}
          isLast
        />
      </SettingSection>

      {/* 底部留白 */}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
      paddingHorizontal: 16,
    },

    // Header
    headerCard: {
      marginTop: 12,
      marginBottom: 16,
      paddingVertical: 8,
    },
    userInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatar: {
      width: 90,
      height: 90,
      borderRadius: 30,
      borderWidth: 2,
      borderColor: theme?.colors?.surface || '#FFF',
    },
    avatarPlaceholder: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme?.colors?.primary || '#3B82F6',
      justifyContent: 'center',
      alignItems: 'center',
    },
    userInfoText: {
      flex: 1,
      marginLeft: 16,
    },
    userName: {
      fontSize: 25,
      fontWeight: '700',
      color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
      marginBottom: 10,
    },
    userEmail: {
      ...typography.bodySmall,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      marginBottom: 6,
    },
    iconButton: {
      padding: 8,
      backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 20,
    },
  });

export default MineScreen;
