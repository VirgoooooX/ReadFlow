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
import { useThemeContext } from '../theme';
import { withAlpha } from '../utils/colorUtils';

interface GroupTabBarProps {
  groups: RSSGroup[];
  activeGroupId: number;
  onGroupChange: (groupId: number) => void;
  onCreateGroup: () => void;
  onManageGroups?: () => void;  // 进入管理页面
}

const GroupTabBar: React.FC<GroupTabBarProps> = ({
  groups,
  activeGroupId,
  onGroupChange,
  onCreateGroup,
  onManageGroups,
}) => {
  const { theme } = useThemeContext();
  const styles = createStyles(theme);

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
                isActive && styles.activeTab,
              ]}
              onPress={() => onGroupChange(tab.id)}
            >
              <Text
                style={[
                  styles.tabText,
                  isActive && styles.activeTabText,
                ]}
              >
                {tab.name}
              </Text>
              
              {/* 显示源数量 */}
              {tab.id > 0 && (tab as RSSGroup).sourceCount !== undefined && (
                <Text
                  style={[
                    styles.count,
                    isActive && styles.activeCountText,
                  ]}
                >
                  ({(tab as RSSGroup).sourceCount})
                </Text>
              )}
              
              {/* 未读红点 */}
              {hasUnread && (
                <View style={styles.badge} />
              )}
            </TouchableOpacity>
          );
        })}

        {/* 添加分组按钮 */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={onCreateGroup}
        >
          <MaterialIcons
            name="add"
            size={20}
            color={theme.colors.primary}
          />
        </TouchableOpacity>

        {/* 管理分组按钮 */}
        {onManageGroups && (
          <TouchableOpacity
            style={styles.manageButton}
            onPress={onManageGroups}
          >
            <MaterialIcons
              name="settings"
              size={18}
              color={theme.colors.onSecondaryContainer}
            />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(theme.colors.outlineVariant, 0.4),
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
    backgroundColor: theme.colors.primaryContainer,
  },
  tabText: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
  },
  activeTabText: {
    color: theme.colors.onPrimaryContainer,
    fontWeight: '600',
  },
  count: {
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
  },
  activeCountText: {
    color: theme.colors.onPrimaryContainer,
  },
  badge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 4,
    backgroundColor: theme.colors.error,
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
    borderColor: theme.colors.outline,
  },
  manageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.secondaryContainer,
  },
});

export default GroupTabBar;
