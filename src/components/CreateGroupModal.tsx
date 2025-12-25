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

interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, color?: string) => void;
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

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  visible,
  onClose,
  onCreate,
  theme,
  isDark = false,
}) => {
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
        
        <View
          style={[
            styles.modal,
            {
              backgroundColor: theme?.colors?.surface || (isDark ? '#1C1B1F' : '#FFFBFE'),
            },
          ]}
        >
          <Text
            style={[
              styles.title,
              { color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F') },
            ]}
          >
            创建分组
          </Text>

          <TextInput
            style={[
              styles.input,
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
              styles.label,
              { color: theme?.colors?.onSurfaceVariant || (isDark ? '#CAC4D0' : '#49454F') },
            ]}
          >
            选择颜色
          </Text>

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
                  <MaterialIcons name="check" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.button,
                {
                  backgroundColor: 'transparent',
                },
              ]}
              onPress={onClose}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: theme?.colors?.primary || '#6750A4' },
                ]}
              >
                取消
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                {
                  backgroundColor: theme?.colors?.primary || '#6750A4',
                },
                !name.trim() && styles.buttonDisabled,
              ]}
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: theme?.colors?.onPrimary || '#FFFFFF' },
                ]}
              >
                创建
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
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

export default CreateGroupModal;
