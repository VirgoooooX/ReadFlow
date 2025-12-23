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
import { useUser } from '../../contexts/UserContext';
import { userStatsService, UserStats } from '../../services/UserStatsService';
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
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<{ enabled: boolean; connected: boolean }>({
    enabled: false,
    connected: false,
  });

  // 获取焦点时刷新数据
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    // 并行加载数据
    await Promise.all([
      loadUserStats(),
      checkProxyStatus(),
    ]);
  };

  const loadUserStats = async () => {
    try {
      setLoading(true);
      const stats = await userStatsService.getUserStats();
      setUserStats(stats);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

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
  const StatCard = ({ icon, value, label, onPress, color, isLast }: any) => {
    return (
      <TouchableOpacity
        style={[
          styles.statCard,
          !isLast && styles.statCardBorder,
        ]}
        onPress={onPress}
        activeOpacity={0.6}
      >
        <View style={[styles.statIconCircle, { backgroundColor: `${color}15` }]}>
          <MaterialIcons name={icon} size={18} color={color} />
        </View>
        <Text style={styles.statValue} numberOfLines={1}>
          {value || 0}
        </Text>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // 菜单项组件
  const MenuItem = ({
    icon,
    label,
    onPress,
    color,
    valueText,
    showArrow = true,
    isDestructive = false,
    isLast = false,
  }: any) => (
    <>
      <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.6}>
        <View style={styles.menuLeft}>
          <View style={styles.menuIconBox}>
            <MaterialIcons
              name={icon}
              size={20}
              color={
                isDestructive
                  ? theme?.colors?.error || '#EF4444'
                  : color || theme?.colors?.onSurfaceVariant || '#666'
              }
            />
          </View>
          <Text
            style={[
              styles.menuText,
              isDestructive && { color: theme?.colors?.error || '#EF4444' },
            ]}
          >
            {label}
          </Text>
        </View>

        <View style={styles.menuRight}>
          {valueText && <Text style={styles.menuValueText}>{valueText}</Text>}
          {showArrow && (
            <MaterialIcons
              name="chevron-right"
              size={20}
              color={theme?.colors?.outline || '#999'}
            />
          )}
        </View>
      </TouchableOpacity>
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );

  // 分组标题
  const SectionTitle = ({ title }: { title: string }) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

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

      {/* --- 统计数据区域 --- */}
      <View style={styles.statsContainer}>
        <View style={styles.statsRow}>
          <StatCard
            icon="book"
            value={userStats?.vocabularyWords}
            label="单词积累"
            color={theme?.colors?.primary || '#3B82F6'}
            onPress={() => navigation.navigate('Vocabulary' as any)}
          />
          <StatCard
            icon="rss-feed"
            value={userStats?.rssSources}
            label="订阅源"
            color={theme?.colors?.tertiary || '#7D5260'}
            onPress={() => navigation.navigate('ManageSubscriptions' as any)}
          />
          <StatCard
            icon="article"
            value={userStats?.totalArticles}
            label="已读文章"
            color={theme?.colors?.secondary || '#625B71'}
            onPress={() => navigation.navigate('Articles' as any)}
          />
          <StatCard
            icon="favorite"
            value={userStats?.favoriteArticles}
            label="收藏夹"
            color="#E91E63"
            onPress={() => navigation.navigate('Articles' as any)}
            isLast
          />
        </View>
      </View>

      {/* 第1组: 阅读与内容 */}
      <View style={styles.menuGroupContainer}>
        <SectionTitle title="阅读与内容" />
        <View style={styles.menuGroupCard}>
          <MenuItem
            icon="chrome-reader-mode"
            label="阅读偏好"
            onPress={() => navigation.navigate('ReadingSettings')}
            color={theme?.colors?.primary || '#3B82F6'}
            isLast
          />
        </View>
      </View>

      {/* 第2组: 工具与服务 */}
      <View style={styles.menuGroupContainer}>
        <SectionTitle title="工具与服务" />
        <View style={styles.menuGroupCard}>
          <MenuItem
            icon="psychology"
            label="AI 助手配置"
            onPress={() => navigation.navigate('LLMSettings')}
            color="#8B5CF6"
          />
          <MenuItem
            icon="cloud-queue"
            label="代理服务器"
            onPress={() => navigation.navigate('ProxyServerSettings')}
            color={proxyStatus.enabled ? '#10B981' : '#6B7280'}
            valueText={proxyStatus.enabled ? '已启用' : '未启用'}
          />
          <MenuItem
            icon="palette"
            label="主题设置"
            onPress={() => navigation.navigate('ThemeSettings')}
            color="#EC4899"
            valueText={isDark ? '深色' : '浅色'}
            isLast
          />
        </View>
      </View>

      {/* 第3组: 系统与数据 */}
      <View style={styles.menuGroupContainer}>
        <SectionTitle title="系统与数据" />
        <View style={styles.menuGroupCard}>
          <MenuItem
            icon="storage"
            label="存储空间管理"
            onPress={() => navigation.navigate('StorageManagement')}
            color="#64748B"
          />
          <MenuItem
            icon="info"
            label="关于应用"
            onPress={() => navigation.navigate('About')}
            color="#64748B"
          />
          <MenuItem
            icon="logout"
            label="退出登录"
            isDestructive
            onPress={handleLogout}
            isLast
          />
        </View>
      </View>

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
      width: 64,
      height: 64,
      borderRadius: 32,
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
      fontSize: 20,
      fontWeight: '700',
      color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
      marginBottom: 4,
    },
    userEmail: {
      fontSize: 13,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      marginBottom: 6,
    },
    levelBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${theme?.colors?.primary || '#3B82F6'}15`,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    levelText: {
      fontSize: 10,
      fontWeight: '600',
      color: theme?.colors?.primary || '#3B82F6',
      marginLeft: 4,
    },
    iconButton: {
      padding: 8,
      backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#1E1E1E' : '#FFFFFF'),
      borderRadius: 20,
    },

    // Stats - 整体卡片容器
    statsContainer: {
      backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
      borderRadius: 16,
      marginBottom: 20,
      paddingVertical: 8,
      // 投影效果
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    statsRow: {
      flexDirection: 'row',
    },
    statCard: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    statCardBorder: {
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E0E0E0'),
    },
    statIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    statValue: {
      fontSize: 18,
      fontWeight: '700',
      color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
      marginBottom: 2,
    },
    statLabel: {
      fontSize: 11,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    },

    // Menu - 新的分组布局
    menuGroupContainer: {
      marginBottom: 20,
    },
    menuGroupCard: {
      backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
      borderRadius: 12,
      overflow: 'hidden',
      // 投影效果
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    menuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E8E8E8'),
      marginHorizontal: 14,
    },
    menuLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    menuIconBox: {
      width: 36,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    menuText: {
      fontSize: 15,
      fontWeight: '500',
      color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    },
    menuRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    menuValueText: {
      fontSize: 13,
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      fontWeight: '500',
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      marginBottom: 10,
      marginTop: -5,  // 👈 增加与上方容器的距离
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
  });

export default MineScreen;
