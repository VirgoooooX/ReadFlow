import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Platform, // 新增 Platform 用于阴影处理
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useThemeContext } from '../../theme';
import { useUser } from '../../contexts/UserContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UserStackParamList } from '../../navigation/AppNavigator';
import { userStatsService, UserStats } from '../../services/UserStatsService';

type UserProfileScreenNavigationProp = NativeStackNavigationProp<UserStackParamList>;

interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  joinDate: Date;
  level: string;
  experience: number;
  nextLevelExp: number;
}

const UserProfileScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<UserProfileScreenNavigationProp>();
  const { state, logout } = useUser();
  const { user } = state;
  const styles = createStyles(isDark, theme);

  // 用户基本信息
  const [userProfile] = useState<UserProfile>({
    name: 'TechFlow用户',
    email: 'user@techflow.com',
    joinDate: new Date('2024-01-15'),
    level: 'Lv.3', // 示例等级
    experience: 2350,
    nextLevelExp: 3000,
  });

  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserStats();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadUserStats();
    }, [])
  );

  const loadUserStats = async () => {
    try {
      setLoading(true);
      const stats = await userStatsService.getUserStats();
      setUserStats(stats);
    } catch (error) {
      console.error('Failed to load user stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      '退出登录',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', style: 'destructive', onPress: logout },
      ]
    );
  };

  // 【重新设计】统计卡片组件
  // 采用横向布局：左侧图标，右侧数据
  const StatCard = ({ icon, value, label, onPress, color }: any) => {
    // 获取对应的背景淡色
    // 如果是深色模式，背景色稍微深一点；浅色模式则非常淡
    const backgroundColor = isDark 
      ? `${color}15` // 15% 透明度
      : `${color}10`; // 10% 透明度
  
    return (
      <TouchableOpacity 
        style={[styles.statCard, { backgroundColor }]} 
        onPress={onPress} 
        activeOpacity={0.7}
      >
        <View style={[styles.statIconContainer, { backgroundColor: theme?.colors?.surface || '#FFF' }]}>  
          <MaterialIcons name={icon} size={20} color={color} />
        </View>
        <View style={styles.statContent}>
          <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
          <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // 渲染操作列表项组件
  const ActionItem = ({ icon, label, onPress, isDestructive = false }: any) => (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.actionLeft}>
        <View style={[
          styles.actionIconContainer,
          isDestructive && styles.actionIconContainerDestructive
        ]}>
          <MaterialIcons
            name={icon}
            size={22}
            color={isDestructive ? theme?.colors?.error : (theme?.colors?.primary || '#6750A4')}
          />
        </View>
        <Text style={[
          styles.actionText,
          isDestructive && { color: theme?.colors?.error }
        ]}>
          {label}
        </Text>
      </View>
      <MaterialIcons
        name="chevron-right"
        size={24}
        color={theme?.colors?.outline || '#999'}
      />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      
      {/* 头部卡片 */}
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <View style={styles.avatarContainer}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <MaterialIcons name="person" size={40} color="#FFF" />
              </View>
            )}
            <TouchableOpacity style={styles.editAvatarButton} onPress={() => navigation.navigate('EditProfile')}>
              <MaterialIcons name="edit" size={14} color="#FFF" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{user?.username || userProfile.name}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{user?.email || userProfile.email}</Text>
            {/* 等级徽章 */}
            <View style={styles.levelBadge}>
              <MaterialIcons name="stars" size={14} color={theme?.colors?.primary} />
              <Text style={styles.levelText}>{userProfile.level} 会员</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Settings')}>
            <MaterialIcons name="settings" size={24} color={theme?.colors?.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 数据概览 */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>学习数据</Text>
          <TouchableOpacity onPress={() => loadUserStats()} disabled={loading}>
            <MaterialIcons
              name="refresh"
              size={20}
              color={loading ? theme?.colors?.outline : theme?.colors?.primary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            icon="book"
            value={userStats?.vocabularyWords || 0}
            label="单词积累"
            color={theme?.colors?.primary || '#6750A4'}
            onPress={() => navigation.navigate('Vocabulary' as any)}
          />
          <StatCard
            icon="rss-feed"
            value={userStats?.rssSources || 0}
            label="订阅源"
            color={theme?.colors?.tertiary || '#7D5260'}
            onPress={() => navigation.navigate('ManageSubscriptions' as any)}
          />
          <StatCard
            icon="article"
            value={userStats?.totalArticles || 0}
            label="已读文章"
            color={theme?.colors?.secondary || '#625B71'}
            onPress={() => navigation.navigate('Articles' as any)}
          />
          <StatCard
            icon="favorite"
            value={userStats?.favoriteArticles || 0}
            label="收藏夹"
            color="#E91E63" // 专门给收藏用个醒目的颜色
            onPress={() => navigation.navigate('Articles' as any)} // 实际应跳到收藏Tab
          />
        </View>
      </View>

      {/* 快捷操作 */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>常用功能</Text>
        
        <ActionItem
          icon="edit"
          label="编辑个人资料"
          onPress={() => navigation.navigate('EditProfile')}
        />
        
        <ActionItem
          icon="logout"
          label="退出登录"
          isDestructive
          onPress={handleLogout}
        />
      </View>

      {/* 底部留白 */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    paddingHorizontal: 16,
  },
  
  // --- 头部卡片 ---
  headerCard: {
    marginTop: 16,
    marginBottom: 24,
    padding: 20,
    borderRadius: 20,
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    // 阴影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 12,
    elevation: isDark ? 0 : 4,
    borderWidth: isDark ? 1 : 0,
    borderColor: theme?.colors?.outlineVariant || 'rgba(255,255,255,0.1)',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme?.colors?.surfaceVariant,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme?.colors?.primary || '#6750A4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme?.colors?.secondary || '#625B71',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme?.colors?.surface || '#FFF',
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
    marginBottom: 8,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: (theme?.colors?.primary || '#6750A4') + '15', // 15% opacity
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme?.colors?.primary || '#6750A4',
    marginLeft: 4,
  },
  settingsButton: {
    padding: 8,
    marginTop: -20, // 稍微上移对齐右上角
  },

  // --- 通用分节 ---
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 12, // 如果没有 header row，这个 margin 会生效
  },

  // --- 统计数据网格 (新设计) ---
  statsGrid: {
    flexDirection: 'row' as any,
    flexWrap: 'wrap' as any,
    justifyContent: 'space-between',
    gap: 12, // 行间距
  },
  statCard: {
    width: '48%', // 两列布局
    flexDirection: 'row' as any, // 【关键】改为横向布局
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    // 移除边框，改用背景色区分
    // 移除阴影，让它看起来更扁平、现代
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12, // 圆角矩形图标背景
    justifyContent: 'center' as any,
    alignItems: 'center' as any,
    marginRight: 12,
    // 给图标加一点微弱的阴影，增加层次感
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statContent: {
    flex: 1,
    justifyContent: 'center' as any,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700' as any, // 粗体数字
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    lineHeight: 22,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    opacity: 0.8,
  },

  // --- 操作卡片列表 ---
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    // 阴影
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.2 : 0.04,
    shadowRadius: 4,
    elevation: isDark ? 0 : 1,
    borderWidth: isDark ? 1 : 0,
    borderColor: theme?.colors?.outlineVariant || 'rgba(255,255,255,0.05)',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#F0F0F0'),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionIconContainerDestructive: {
    backgroundColor: (theme?.colors?.error || '#FFEBEE') + '20',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
});

export default UserProfileScreen;
