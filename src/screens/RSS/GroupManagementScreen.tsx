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
import { typography } from '../../theme/typography';
import { useNavigation } from '@react-navigation/native';
import { useRSSGroup } from '../../contexts/RSSGroupContext';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { RSSGroup } from '../../types';
import CreateGroupModal from '../../components/CreateGroupModal';

const GroupManagementScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation();
  const { groups, createGroup, updateGroup, deleteGroup, refreshGroups } = useRSSGroup();
  const { rssSources } = useRSSSource();
  
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
              Alert.alert('删除成功', '分组已删除，源已移至默认分组');
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

  // 计算默认分组统计
  const uncategorizedSources = rssSources.filter(s => !s.groupId);
  const uncategorizedCount = uncategorizedSources.length;

  // 分组标题组件
  const SectionTitle = ({ title }: { title: string }) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  // 分组菜单项组件
  const GroupMenuItem = ({ group, isLast }: { group: RSSGroup; isLast?: boolean }) => (
    <>
      <View style={styles.menuItem}>
        <View style={styles.menuLeft}>
          {/* 分组颜色图标 */}
          <View style={[styles.menuIconBox, { backgroundColor: group.color || theme?.colors?.primary }]}>
            <MaterialIcons name="folder" size={20} color="#FFFFFF" />
          </View>
          
          <View style={styles.groupInfo}>
            <Text style={styles.menuText}>{group.name}</Text>
            <View style={styles.groupStats}>
              <Text style={styles.statText}>
                {group.sourceCount || 0} 个源
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.menuRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleEditGroup(group)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons
              name="edit"
              size={18}
              color={theme?.colors?.onSurfaceVariant || '#666'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleDeleteGroup(group)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons
              name="delete"
              size={18}
              color={theme?.colors?.error || '#EF4444'}
            />
          </TouchableOpacity>
        </View>
      </View>
      {!isLast && <View style={styles.menuDivider} />}
    </>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* 分组列表 */}
        <View style={styles.menuGroupContainer}>
          <SectionTitle title={`我的分组 (${groups.length + 1})`} />
          <View style={styles.menuGroupCard}>
            {groups.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons
                  name="folder-open"
                  size={48}
                  color={theme?.colors?.onSurfaceVariant || '#999'}
                />
                <Text style={styles.emptyText}>暂无自定义分组</Text>
                <Text style={styles.emptyHint}>点击下方按钮创建您的第一个分组</Text>
              </View>
            ) : (
              groups.map((group, index) => (
                <GroupMenuItem
                  key={group.id}
                  group={group}
                  isLast={false}
                />
              ))
            )}

            <View style={styles.menuDivider} />

            {/* 默认分组 */}
            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBox, { backgroundColor: theme?.colors?.surfaceVariant }]}>
                  <MaterialIcons name="folder-open" size={20} color={theme?.colors?.onSurfaceVariant} />
                </View>
                
                <View style={styles.groupInfo}>
                  <Text style={styles.menuText}>默认</Text>
                  <View style={styles.groupStats}>
                    <Text style={styles.statText}>
                      {uncategorizedCount} 个源
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.menuRight}>
                 <Text style={[styles.statText, { fontSize: 12, color: theme?.colors?.outline, marginRight: 8 }]}>系统默认</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 提示信息 */}
        <View style={styles.menuGroupContainer}>
          <SectionTitle title="使用提示" />
          <View style={styles.tipsCard}>
            <View style={styles.tipItem}>
              <MaterialIcons name="edit" size={16} color={theme?.colors?.onSurfaceVariant || '#666'} />
              <Text style={styles.tipText}>点击编辑按钮可修改分组名称和颜色</Text>
            </View>
            <View style={styles.tipItem}>
              <MaterialIcons name="delete" size={16} color={theme?.colors?.onSurfaceVariant || '#666'} />
              <Text style={styles.tipText}>删除分组时可选择是否同时删除源</Text>
            </View>
            <View style={styles.tipItem}>
              <MaterialIcons name="add" size={16} color={theme?.colors?.onSurfaceVariant || '#666'} />
              <Text style={styles.tipText}>在添加RSS源时可选择所属分组</Text>
            </View>
          </View>
        </View>

        {/* 底部留白 */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 底部创建按钮 */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.8}
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
  '#00696C', // Teal
  '#3949AB', // Indigo
  '#7CB342', // Lime
  '#FFA000', // Amber
  '#F4511E', // Deep Orange
  '#6D4C41', // Brown
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
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // 菜单分组布局
  menuGroupContainer: {
    marginBottom: 20,
    marginTop: 12,
  },
  menuGroupCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    overflow: 'hidden',
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
    paddingVertical: 10,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  groupInfo: {
    flex: 1,
  },
  menuText: {
    ...typography.bodyLarge,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 2,
  },
  groupStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    ...typography.bodySmall,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
  },
  statDivider: {
    ...typography.bodySmall,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginHorizontal: 6,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    ...typography.titleMedium,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginBottom: 10,
    marginTop: -5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // 空状态
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyText: {
    ...typography.titleMedium,
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginTop: 16,
    marginBottom: 4,
  },
  emptyHint: {
    ...typography.bodySmall,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    textAlign: 'center',
  },

  // 提示卡片
  tipsCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tipText: {
    ...typography.bodySmall,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginLeft: 8,
    flex: 1,
  },

  // 底部按钮
  bottomActions: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme?.colors?.primary || '#6750A4',
    borderRadius: 24,
    paddingVertical: 14,
    gap: 8,
    shadowColor: theme?.colors?.primary || '#6750A4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonText: {
    ...typography.labelLarge,
    fontWeight: '600',
    color: theme?.colors?.onPrimary || '#FFFFFF',
  },
});

export default GroupManagementScreen;
