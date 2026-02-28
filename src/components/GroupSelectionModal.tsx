import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RSSGroup } from '../types';
import { useThemeContext } from '../theme';

interface GroupSelectionModalProps {
  visible: boolean;
  groups: RSSGroup[];
  onClose: () => void;
  onSelect: (groupId: number | null) => void;
}

const GroupSelectionModal: React.FC<GroupSelectionModalProps> = ({
  visible,
  groups,
  onClose,
  onSelect,
}) => {
  const { theme } = useThemeContext();
  const styles = createStyles(theme);

  const openedAtRef = useRef(0);
  useEffect(() => {
    if (visible) {
      openedAtRef.current = Date.now();
    }
  }, [visible]);

  const handleBackdropPress = useCallback(() => {
    if (Date.now() - openedAtRef.current < 250) return;
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />
      <View style={styles.modalContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>选择目标分组</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            style={styles.item}
            onPress={() => onSelect(null)}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceVariant }]}>
              <MaterialIcons name="folder-open" size={24} color={theme.colors.onSurfaceVariant} />
            </View>
            <Text style={styles.itemText}>默认</Text>
          </TouchableOpacity>

          {groups.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={styles.item}
              onPress={() => onSelect(group.id)}
            >
              <View style={[styles.iconBox, { backgroundColor: group.color || theme.colors.primary }]}>
                <MaterialIcons name="folder" size={24} color={theme.colors.onPrimary} />
              </View>
              <Text style={styles.itemText}>{group.name}</Text>
              <Text style={styles.countText}>{group.sourceCount || 0} 个源</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const createStyles = (theme: any) =>
  StyleSheet.create({
    overlay: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      padding: 20,
      zIndex: 1000,
      elevation: 1000,
    },
    modalContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      maxHeight: '70%',
      elevation: 5,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
    },
    title: {
      fontSize: 18,
      lineHeight: 26,
      includeFontPadding: false,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    list: {
      padding: 8,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 8,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    itemText: {
      flex: 1,
      fontSize: 16,
      lineHeight: 24,
      includeFontPadding: false,
      color: theme.colors.onSurface,
    },
    countText: {
      fontSize: 14,
      lineHeight: 20,
      includeFontPadding: false,
      color: theme.colors.onSurfaceVariant,
    },
  });

export default GroupSelectionModal;
