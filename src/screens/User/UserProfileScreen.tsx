import React, { useState, useEffect } from 'react';
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
import { useThemeContext } from '../../theme';
import { useUser } from '../../contexts/UserContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UserStackParamList } from '../../navigation/AppNavigator';
import { userStatsService, UserStats } from '../../services/UserStatsService';

type UserProfileScreenNavigationProp = NativeStackNavigationProp<UserStackParamList>;

// UserStats interface moved to UserStatsService

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
    level: '中级学习者',
    experience: 2350,
    nextLevelExp: 3000,
  });

  // 真实用户统计数据
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  // 加载用户统计数据
  useEffect(() => {
    loadUserStats();
  }, []);

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

  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };

  const handleSettings = () => {
    navigation.navigate('Settings');
  };

  const handleAchievements = () => {
    Alert.alert('成就系统', '成就系统功能开发中...');
  };

  const handleLogout = () => {
    Alert.alert(
      '退出登录',
      '确定要退出登录吗？',
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '确定',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const handleBackup = () => {
    Alert.alert('数据备份', '数据备份功能开发中...');
  };

  // 添加调试信息处理函数
  const handleDebugInfo = () => {
    navigation.navigate('Debug');
  };

  const formatReadingTime = (minutes: number | undefined): string => {
    if (!minutes) return '0h';
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) {
      return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
    }
    return `${remainingMinutes}m`;
  };



  const getDaysJoined = (): number => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - userProfile.joinDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* 用户头像和基本信息 */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          {user?.avatar ? (
            <Image 
              source={{ uri: user.avatar }}
              style={styles.avatar}
              defaultSource={{ uri: 'https://via.placeholder.com/80x80/6750A4/FFFFFF?text=TF' }}
            />
          ) : (
            <View style={styles.avatar}>
              <MaterialIcons 
                name="person" 
                size={48} 
                color={theme?.colors?.onPrimary || '#FFFFFF'} 
              />
            </View>
          )}
          <TouchableOpacity style={styles.editAvatarButton} onPress={handleEditProfile}>
            <MaterialIcons 
              name="edit" 
              size={16} 
              color={theme?.colors?.onPrimary || '#FFFFFF'} 
            />
          </TouchableOpacity>
        </View>
        
        <View style={styles.profileInfo}>
          <Text style={styles.userName}>{user?.username || userProfile.name}</Text>
          <Text style={styles.userEmail}>{user?.email || userProfile.email}</Text>
          <Text style={styles.userLevel}>{userProfile.level}</Text>
          <Text style={styles.joinDate}>加入 {getDaysJoined()} 天</Text>
        </View>
        
        <TouchableOpacity style={styles.settingsButton} onPress={handleSettings}>
          <MaterialIcons 
            name="settings" 
            size={24} 
            color={theme?.colors?.onSurface || '#1C1B1F'} 
          />
        </TouchableOpacity>
      </View>



      {/* 统计数据网格 */}
      <View style={styles.statsSection}>
        <Text style={styles.sectionTitle}>学习统计</Text>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <MaterialIcons 
                name="article" 
                size={32} 
                color={theme?.colors?.primary || '#6750A4'} 
              />
              <Text style={styles.statValue}>{userStats?.articlesRead || 0}</Text>
              <Text style={styles.statLabel}>已读文章</Text>
            </View>
            
            <View style={styles.statCard}>
              <MaterialIcons 
                name="book" 
                size={32} 
                color={theme?.colors?.secondary || '#625B71'} 
              />
              <Text style={styles.statValue}>{userStats?.vocabularyWords || 0}</Text>
              <Text style={styles.statLabel}>收藏单词</Text>
            </View>
            
            <View style={styles.statCard}>
              <MaterialIcons 
                name="rss-feed" 
                size={32} 
                color={theme?.colors?.tertiary || '#7D5260'} 
              />
              <Text style={styles.statValue}>{userStats?.rssSources || 0}</Text>
              <Text style={styles.statLabel}>RSS源</Text>
            </View>
            
            <View style={styles.statCard}>
              <MaterialIcons 
                name="schedule" 
                size={32} 
                color={theme?.colors?.primary || '#6750A4'} 
              />
              <Text style={styles.statValue}>{userStats ? formatReadingTime(userStats.readingTime) : '0h'}</Text>
              <Text style={styles.statLabel}>阅读时长</Text>
            </View>
            
            <View style={styles.statCard}>
              <MaterialIcons 
                name="folder" 
                size={32} 
                color={theme?.colors?.secondary || '#625B71'} 
              />
              <Text style={styles.statValue}>{userStats?.totalArticles || 0}</Text>
              <Text style={styles.statLabel}>总文章数</Text>
            </View>
            
            <View style={styles.statCard}>
              <MaterialIcons 
                name="favorite" 
                size={32} 
                color={theme?.colors?.tertiary || '#7D5260'} 
              />
              <Text style={styles.statValue}>{userStats?.favoriteArticles || 0}</Text>
              <Text style={styles.statLabel}>收藏文章</Text>
            </View>
          </View>
        )}
      </View>



      {/* 快捷操作 */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>快捷操作</Text>
        
        <TouchableOpacity style={styles.actionItem} onPress={handleEditProfile}>
          <View style={styles.actionLeft}>
            <MaterialIcons 
              name="edit" 
              size={24} 
              color={theme?.colors?.primary || '#6750A4'} 
            />
            <Text style={styles.actionText}>编辑个人资料</Text>
          </View>
          <MaterialIcons 
            name="chevron-right" 
            size={24} 
            color={theme?.colors?.onSurfaceVariant || '#79747E'} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionItem} onPress={handleAchievements}>
          <View style={styles.actionLeft}>
            <MaterialIcons 
              name="emoji-events" 
              size={24} 
              color={theme?.colors?.primary || '#6750A4'} 
            />
            <Text style={styles.actionText}>成就与徽章</Text>
          </View>
          <MaterialIcons 
            name="chevron-right" 
            size={24} 
            color={theme?.colors?.onSurfaceVariant || '#79747E'} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionItem} onPress={handleBackup}>
          <View style={styles.actionLeft}>
            <MaterialIcons 
              name="backup" 
              size={24} 
              color={theme?.colors?.primary || '#6750A4'} 
            />
            <Text style={styles.actionText}>数据备份</Text>
          </View>
          <MaterialIcons 
            name="chevron-right" 
            size={24} 
            color={theme?.colors?.onSurfaceVariant || '#79747E'} 
          />
        </TouchableOpacity>
        
        {/* 添加调试信息选项 */}
        <TouchableOpacity style={styles.actionItem} onPress={handleDebugInfo}>
          <View style={styles.actionLeft}>
            <MaterialIcons 
              name="bug-report" 
              size={24} 
              color={theme?.colors?.primary || '#6750A4'} 
            />
            <Text style={styles.actionText}>调试信息</Text>
          </View>
          <MaterialIcons 
            name="chevron-right" 
            size={24} 
            color={theme?.colors?.onSurfaceVariant || '#79747E'} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
          <View style={styles.actionLeft}>
            <MaterialIcons 
              name="logout" 
              size={24} 
              color={theme?.colors?.error || '#BA1A1A'} 
            />
            <Text style={[styles.actionText, { color: theme?.colors?.error || '#BA1A1A' }]}>退出登录</Text>
          </View>
          <MaterialIcons 
            name="chevron-right" 
            size={24} 
            color={theme?.colors?.onSurfaceVariant || '#79747E'} 
          />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme?.colors?.primary || '#6750A4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme?.colors?.secondary || '#625B71',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme?.colors?.surface || (isDark ? '#1C1B1F' : '#FFFBFE'),
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginBottom: 4,
  },
  userLevel: {
    fontSize: 14,
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '500',
    marginBottom: 2,
  },
  joinDate: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  settingsButton: {
    padding: 8,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  statsSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    textAlign: 'center',
  },

  actionsSection: {
    marginHorizontal: 16,
    marginBottom: 32,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    marginBottom: 8,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionText: {
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginLeft: 12,
  },
});

export default UserProfileScreen;