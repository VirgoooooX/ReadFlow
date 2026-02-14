import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../theme';

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, color?: string) => void;
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

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  visible,
  onClose,
  onCreate,
}) => {
  const { theme } = useThemeContext();
  const styles = createStyles(theme);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), selectedColor);
      setName('');
      setSelectedColor(PRESET_COLORS[0]);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <View style={styles.modal}>
          <Text style={styles.title}>创建分组</Text>

          <TextInput
            style={styles.input}
            placeholder="分组名称"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={styles.label}>选择颜色</Text>

          <View style={styles.colorGrid}>
            {PRESET_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorButton,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorButtonSelected,
                ]}
                onPress={() => setSelectedColor(color)}
              >
                {selectedColor === color && (
                  <MaterialIcons name="check" size={20} color={theme.colors.onPrimary} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: 'transparent' }]}
              onPress={onClose}
            >
              <Text style={[styles.buttonText, { color: theme.colors.primary }]}>
                取消
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: theme.colors.primary },
                !name.trim() && styles.buttonDisabled,
              ]}
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>
                创建
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
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
    backgroundColor: theme.colors.surface,
  },
  title: {
    fontSize: 22,
    lineHeight: 30,
    includeFontPadding: false,
    fontWeight: '600',
    marginBottom: 20,
    color: theme.colors.onSurface,
  },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    borderWidth: 1,
    marginBottom: 20,
    backgroundColor: theme.colors.surfaceContainer,
    color: theme.colors.onSurface,
    borderColor: theme.colors.outline,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    marginBottom: 12,
    color: theme.colors.onSurfaceVariant,
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
    borderColor: theme.colors.onPrimary,
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
    lineHeight: 20,
    includeFontPadding: false,
    fontWeight: '600',
  },
});

export default CreateGroupModal;
