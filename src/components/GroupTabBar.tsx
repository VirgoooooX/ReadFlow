import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RSSGroup, VIRTUAL_GROUPS } from '../types';

interface GroupTabBarProps {
  groups: RSSGroup[];
  activeGroupId: number;
  onGroupChange: (groupId: number) => void;
  onCreateGroup: () => void;
  onManageGroups?: () => void;  // 进入管理页面
  theme?: any;
  isDark?: boolean;
}

const GroupTabBar: React.FC<GroupTabBarProps> = ({
  groups,
  activeGroupId,
  onGroupChange,
  onCreateGroup,
  onManageGroups,
  theme,
  isDark = false,
}) => {
  // 构建完整的 Tab 列表（虚拟分组 + 实际分组）
  const allTabs = [
    { id: VIRTUAL_GROUPS.ALL.id, name: VIRTUAL_GROUPS.ALL.name, unreadCount: 0 },
    ...groups,
    { id: VIRTUAL_GROUPS.UNCATEGORIZED.id, name: VIRTUAL_GROUPS.UNCATEGORIZED.name, unreadCount: 0 },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {allTabs.map((tab) => {
          const isActive = tab.id === activeGroupId;
          const hasUnread = (tab.unreadCount || 0) > 0;

          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                isActive && {
                  ...styles.activeTab,
                  backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4A4458' : '#E8DEF8'),
                },
              ]}
              onPress={() => onGroupChange(tab.id)}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
                  },
                  isActive && {
                    color: theme?.colors?.onPrimaryContainer || (isDark ? '#E8DEF8' : '#21005D'),
                    fontWeight: '600',
                  },
                ]}
              >
                {tab.name}
              </Text>
              
              {/* 显示源数量 */}
              {tab.id > 0 && (tab as RSSGroup).sourceCount !== undefined && (
                <Text
                  style={[
                    styles.count,
                    {
                      color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
                    },
                    isActive && {
                      color: theme?.colors?.onPrimaryContainer || (isDark ? '#E8DEF8' : '#21005D'),
                    },
                  ]}
                >
                  ({(tab as RSSGroup).sourceCount})
                </Text>
              )}
              
              {/* 未读红点 */}
              {hasUnread && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme?.colors?.error || '#BA1A1A' },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}

        {/* 添加分组按钮 */}
        <TouchableOpacity
          style={[
            styles.addButton,
            {
              borderColor: theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'),
            },
          ]}
          onPress={onCreateGroup}
        >
          <MaterialIcons
            name="add"
            size={20}
            color={theme?.colors?.primary || '#6750A4'}
          />
        </TouchableOpacity>

        {/* 管理分组按钮 */}
        {onManageGroups && (
          <TouchableOpacity
            style={[
              styles.manageButton,
              {
                backgroundColor: theme?.colors?.secondaryContainer || (isDark ? '#4A4458' : '#E8DEF8'),
              },
            ]}
            onPress={onManageGroups}
          >
            <MaterialIcons
              name="settings"
              size={18}
              color={theme?.colors?.onSecondaryContainer || (isDark ? '#E8DEF8' : '#1D192B')}
            />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  scrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  activeTab: {
    // backgroundColor 在组件中动态设置
  },
  tabText: {
    fontSize: 14,
  },
  count: {
    fontSize: 12,
  },
  badge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 4,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  manageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
});

export default GroupTabBar;
