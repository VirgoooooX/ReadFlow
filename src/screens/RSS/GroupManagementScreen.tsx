import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { useRSSGroup } from '../../contexts/RSSGroupContext';
import { RSSGroup } from '../../types';
import CreateGroupModal from '../../components/CreateGroupModal';

const GroupManagementScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation();
  const { groups, createGroup, updateGroup, deleteGroup, refreshGroups } = useRSSGroup();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<RSSGroup | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleCreateGroup = async (name: string, color?: string) => {
    try {
      await createGroup({
        name,
        color,
        sortOrder: groups.length,
      });
    } catch (error) {
      console.error('Failed to create group:', error);
      Alert.alert('创建失败', '创建分组时发生错误');
    }
  };

  const handleEditGroup = (group: RSSGroup) => {
    setEditingGroup(group);
    setShowEditModal(true);
  };

  const handleUpdateGroup = async (name: string, color?: string) => {
    if (!editingGroup) return;
    
    try {
      await updateGroup(editingGroup.id, { name, color });
      setShowEditModal(false);
      setEditingGroup(null);
    } catch (error) {
      console.error('Failed to update group:', error);
      Alert.alert('更新失败', '更新分组时发生错误');
    }
  };

  const handleDeleteGroup = (group: RSSGroup) => {
    Alert.alert(
      `删除 "${group.name}" 分组？`,
      `此分组包含 ${group.sourceCount || 0} 个源`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '仅删除分组',
          onPress: async () => {
            try {
              await deleteGroup(group.id, false);
              Alert.alert('删除成功', '分组已删除，源已移至未分组');
            } catch (error) {
              console.error('Failed to delete group:', error);
              Alert.alert('删除失败', '删除分组时发生错误');
            }
          },
        },
        {
          text: '删除分组及源',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGroup(group.id, true);
              Alert.alert('删除成功', '分组及所有源已删除');
            } catch (error) {
              console.error('Failed to delete group:', error);
              Alert.alert('删除失败', '删除分组时发生错误');
            }
          },
        },
      ]
    );
  };

  const styles = createStyles(isDark, theme);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <MaterialIcons
            name="folder"
            size={48}
            color={theme?.colors?.primary || '#6750A4'}
          />
          <Text style={styles.title}>分组管理</Text>
          <Text style={styles.subtitle}>管理您的RSS订阅分组</Text>
        </View>

        <View style={styles.content}>
          {/* 分组列表 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>我的分组 ({groups.length}个)</Text>
            
            {groups.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons
                  name="folder-open"
                  size={48}
                  color={theme?.colors?.onSurfaceVariant || '#938F99'}
                />
                <Text style={styles.emptyText}>暂无分组</Text>
                <Text style={styles.emptyHint}>点击下方按钮创建您的第一个分组</Text>
              </View>
            ) : (
              <View style={styles.groupList}>
                {groups.map((group) => (
                  <View key={group.id} style={styles.groupCard}>
                    {/* 分组颜色条 */}
                    {group.color && (
                      <View
                        style={[
                          styles.colorBar,
                          { backgroundColor: group.color },
                        ]}
                      />
                    )}
                    
                    <View style={styles.groupContent}>
                      <View style={styles.groupHeader}>
                        <Text style={styles.groupName}>{group.name}</Text>
                        <View style={styles.groupActions}>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleEditGroup(group)}
                          >
                            <MaterialIcons
                              name="edit"
                              size={20}
                              color={theme?.colors?.primary || '#6750A4'}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleDeleteGroup(group)}
                          >
                            <MaterialIcons
                              name="delete"
                              size={20}
                              color={theme?.colors?.error || '#BA1A1A'}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                      
                      <View style={styles.groupStats}>
                        <View style={styles.statItem}>
                          <MaterialIcons
                            name="rss-feed"
                            size={16}
                            color={theme?.colors?.onSurfaceVariant || '#938F99'}
                          />
                          <Text style={styles.statText}>
                            {group.sourceCount || 0} 个源
                          </Text>
                        </View>
                        {(group.unreadCount || 0) > 0 && (
                          <View style={styles.statItem}>
                            <MaterialIcons
                              name="fiber-manual-record"
                              size={16}
                              color={theme?.colors?.error || '#BA1A1A'}
                            />
                            <Text style={styles.statText}>
                              {group.unreadCount} 篇未读
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 提示信息 */}
          <View style={styles.tipsSection}>
            <Text style={styles.tipsTitle}>💡 使用提示</Text>
            <Text style={styles.tipsText}>• 点击编辑按钮可修改分组名称和颜色</Text>
            <Text style={styles.tipsText}>• 删除分组时可选择是否同时删除源</Text>
            <Text style={styles.tipsText}>• 在添加RSS源时可选择所属分组</Text>
          </View>
        </View>
      </ScrollView>

      {/* 底部创建按钮 */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <MaterialIcons
            name="add"
            size={24}
            color={theme?.colors?.onPrimary || '#FFFFFF'}
          />
          <Text style={styles.createButtonText}>创建新分组</Text>
        </TouchableOpacity>
      </View>

      {/* 创建分组弹窗 */}
      <CreateGroupModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateGroup}
        theme={theme}
        isDark={isDark}
      />

      {/* 编辑分组弹窗 */}
      {editingGroup && (
        <EditGroupModal
          visible={showEditModal}
          group={editingGroup}
          onClose={() => {
            setShowEditModal(false);
            setEditingGroup(null);
          }}
          onUpdate={handleUpdateGroup}
          theme={theme}
          isDark={isDark}
        />
      )}
    </View>
  );
};

// 编辑分组弹窗组件
interface EditGroupModalProps {
  visible: boolean;
  group: RSSGroup;
  onClose: () => void;
  onUpdate: (name: string, color?: string) => void;
  theme?: any;
  isDark?: boolean;
}

const PRESET_COLORS = [
  '#6750A4', // Purple
  '#0061A4', // Blue
  '#006E1C', // Green
  '#C77700', // Orange
  '#BA1A1A', // Red
  '#8E4585', // Pink
];

const EditGroupModal: React.FC<EditGroupModalProps> = ({
  visible,
  group,
  onClose,
  onUpdate,
  theme,
  isDark = false,
}) => {
  const [name, setName] = useState(group.name);
  const [selectedColor, setSelectedColor] = useState(group.color || PRESET_COLORS[0]);

  React.useEffect(() => {
    if (visible) {
      setName(group.name);
      setSelectedColor(group.color || PRESET_COLORS[0]);
    }
  }, [visible, group]);

  const handleUpdate = () => {
    if (name.trim()) {
      onUpdate(name.trim(), selectedColor);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={editModalStyles.overlay}>
        <TouchableOpacity
          style={editModalStyles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <View
          style={[
            editModalStyles.modal,
            {
              backgroundColor: theme?.colors?.surface || (isDark ? '#1C1B1F' : '#FFFBFE'),
            },
          ]}
        >
          <Text
            style={[
              editModalStyles.title,
              { color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F') },
            ]}
          >
            编辑分组
          </Text>

          <TextInput
            style={[
              editModalStyles.input,
              {
                backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
                color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
                borderColor: theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'),
              },
            ]}
            placeholder="分组名称"
            placeholderTextColor={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text
            style={[
              editModalStyles.label,
              { color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F') },
            ]}
          >
            选择颜色
          </Text>

          <View style={editModalStyles.colorGrid}>
            {PRESET_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  editModalStyles.colorButton,
                  { backgroundColor: color },
                  selectedColor === color && editModalStyles.colorButtonSelected,
                ]}
                onPress={() => setSelectedColor(color)}
              >
                {selectedColor === color && (
                  <MaterialIcons name="check" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={editModalStyles.actions}>
            <TouchableOpacity
              style={editModalStyles.button}
              onPress={onClose}
            >
              <Text
                style={[
                  editModalStyles.buttonText,
                  { color: theme?.colors?.primary || '#6750A4' },
                ]}
              >
                取消
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                editModalStyles.button,
                {
                  backgroundColor: theme?.colors?.primary || '#6750A4',
                },
                !name.trim() && editModalStyles.buttonDisabled,
              ]}
              onPress={handleUpdate}
              disabled={!name.trim()}
            >
              <Text
                style={[
                  editModalStyles.buttonText,
                  { color: theme?.colors?.onPrimary || '#FFFFFF' },
                ]}
              >
                保存
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const editModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 20,
  },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    marginBottom: 12,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  colorButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorButtonSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
  },
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginTop: 16,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F'),
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onBackground || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 16,
  },
  groupList: {
    gap: 12,
  },
  groupCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#1C1B1F' : '#FFFFFF'),
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  colorBar: {
    height: 4,
    width: '100%',
  },
  groupContent: {
    padding: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    flex: 1,
  },
  groupActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
  },
  groupStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginTop: 16,
  },
  emptyHint: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginTop: 8,
    textAlign: 'center',
  },
  tipsSection: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 12,
  },
  tipsText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    lineHeight: 20,
    marginBottom: 4,
  },
  bottomActions: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
    borderTopWidth: 1,
    borderTopColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#CAC4D0'),
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme?.colors?.primary || '#6750A4',
    borderRadius: 24,
    paddingVertical: 16,
    gap: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onPrimary || '#FFFFFF',
  },
});

export default GroupManagementScreen;
