import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { useRSSGroup } from '../../contexts/RSSGroupContext';
import { rssService } from '../../services/rss';
import type { RSSSource } from '../../types';

type RootStackParamList = {
  EditRSSSource: { sourceId: number };
};

type EditRSSSourceRouteProp = RouteProp<RootStackParamList, 'EditRSSSource'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface FormData {
  name: string;
  url: string;
}

interface FormErrors {
  name?: string;
  url?: string;
}

const EditRSSSourceScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EditRSSSourceRouteProp>();
  const { sourceId } = route.params;
  const { theme } = useThemeContext();
  const { refreshRSSSources } = useRSSSource();
  const { groups, moveSourcesToGroup } = useRSSGroup();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [originalData, setOriginalData] = useState<RSSSource | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    url: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  useEffect(() => {
    loadRSSSource();
  }, [sourceId]);

  const loadRSSSource = async () => {
    try {
      setLoading(true);
      const source = await rssService.getSourceById(sourceId);

      if (!source) {
        Alert.alert('错误', 'RSS源不存在', [
          { text: '确定', onPress: () => navigation.goBack() }
        ]);
        return;
      }

      setOriginalData(source);
      setFormData({
        name: source.name || '',
        url: source.url,
      });
      setSelectedGroupId(source.groupId ?? null);
    } catch (error) {
      console.error('Error loading RSS source:', error);
      Alert.alert('错误', '加载RSS源失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field as keyof FormErrors]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'RSS源名称不能为空';
    }

    if (!formData.url.trim()) {
      newErrors.url = 'RSS源URL不能为空';
    } else if (!isValidURL(formData.url)) {
      newErrors.url = '请输入有效的URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidURL = (url: string): boolean => {
    try {
      // 支持RSSHUB协议
      if (url.startsWith('rsshub://')) {
        return url.length > 9; // rsshub://至少要有路径
      }
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateRSSUrl = async (url: string): Promise<boolean> => {
    if (!url.trim()) {
      setErrors(prev => ({ ...prev, url: '请输入RSS源URL' }));
      return false;
    }

    if (!isValidURL(url)) {
      setErrors(prev => ({ ...prev, url: '请输入有效的URL格式' }));
      return false;
    }

    try {
      setValidating(true);
      await rssService.validateRSSFeed(url);

      // 清除错误信息
      setErrors(prev => ({ ...prev, url: undefined }));

      // 显示成功提示
      Alert.alert('验证成功', 'RSS源验证通过，可以正常使用');

      return true;
    } catch (error) {
      console.error('Error validating RSS URL:', error);
      setErrors(prev => ({ ...prev, url: 'RSS源验证失败，请检查URL是否正确或网络连接' }));
      return false;
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);

      // 如果URL发生变化，验证新的RSS源
      if (formData.url !== originalData?.url) {
        const isValidRSS = await validateRSSUrl(formData.url);
        if (!isValidRSS) {
          return;
        }
      }

      const updatedSource: Partial<RSSSource> = {
        id: sourceId,
        name: formData.name,
        url: formData.url,
      };

      await rssService.updateRSSSource(sourceId, updatedSource);

      if (selectedGroupId !== (originalData?.groupId ?? null)) {
        await moveSourcesToGroup([sourceId], selectedGroupId);
      }

      // 刷新RSS源列表
      await refreshRSSSources();

      Alert.alert('成功', 'RSS源已更新', [
        { text: '确定', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Error updating RSS source:', error);
      Alert.alert('错误', '更新RSS源失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const styles = createStyles(theme);

  if (loading) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 16, fontSize: 16, color: theme.colors.onSurface , lineHeight: 24, includeFontPadding: false }}>\u52a0载\u4e2d...</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* 页面标题 */}
          <View style={styles.header}>
            <MaterialIcons
              name="rss-feed"
              size={32}
              color={theme.colors.primary}
            />
            <Text style={styles.title}>编辑RSS源</Text>
            <Text style={styles.subtitle}>修改RSS订阅源设置</Text>
          </View>

          {/* RSS源信息表单 */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>RSS源地址 *</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, errors.url && styles.inputError]}
                  value={formData.url}
                  onChangeText={(text) => updateFormData('url', text)}
                  placeholder="https://example.com/feed.xml"
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {validating && (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                    style={styles.validatingIcon}
                  />
                )}
              </View>
              {errors.url && <Text style={styles.errorText}>{errors.url}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>源名称 *</Text>
              <TextInput
                style={[styles.input, errors.name && styles.inputError]}
                value={formData.name}
                onChangeText={(text) => updateFormData('name', text)}
                placeholder="为RSS源起个名字"
                placeholderTextColor={theme.colors.onSurfaceVariant}
              />
              {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
            </View>

            {groups.length > 0 && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>所属分组（可选）</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                  <TouchableOpacity
                    style={[
                      styles.categoryChip,
                      selectedGroupId === null && styles.categoryChipSelected
                    ]}
                    onPress={() => setSelectedGroupId(null)}
                  >
                    <Text style={[
                      styles.categoryChipText,
                      selectedGroupId === null && styles.categoryChipTextSelected
                    ]}>
                      默认
                    </Text>
                  </TouchableOpacity>

                  {groups.map((group) => (
                    <TouchableOpacity
                      key={group.id}
                      style={[
                        styles.categoryChip,
                        selectedGroupId === group.id && styles.categoryChipSelected
                      ]}
                      onPress={() => setSelectedGroupId(group.id)}
                    >
                      <Text style={[
                        styles.categoryChipText,
                        selectedGroupId === group.id && styles.categoryChipTextSelected
                      ]}>
                        {group.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* 底部操作按钮 */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={saving}
        >
          <Text style={styles.cancelButtonText}>取消</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.addButton,
            (!formData.url.trim() || !formData.name.trim() || saving) && styles.addButtonDisabled
          ]}
          onPress={handleSave}
          disabled={!formData.url.trim() || !formData.name.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color={theme.colors.onPrimary} />
              <Text style={styles.addButtonText}>保存更改</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    includeFontPadding: false,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  form: {
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    fontWeight: '500',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    color: theme.colors.onSurface,
    minHeight: 48,
  },
  inputError: {
    borderColor: theme.colors.error,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  validatingIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    color: theme.colors.error,
    marginTop: 4,
  },
  categoryScroll: {
    marginTop: 4,
  },
  categoryChip: {
    backgroundColor: theme.colors.surfaceContainer,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipSelected: {
    backgroundColor: theme.colors.primary,
  },
  categoryChipText: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
  },
  categoryChipTextSelected: {
    color: theme.colors.onPrimary,
    fontWeight: '500',
  },
  bottomActions: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineVariant,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center' as any,
    justifyContent: 'center' as any,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceContainer,
  },
  cancelButtonText: {
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    fontWeight: '500',
    color: theme.colors.onSurface,
  },
  addButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    gap: 8,
  },
  addButtonDisabled: {
    backgroundColor: theme.colors.surfaceVariant,
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    fontWeight: '500',
    color: theme.colors.onPrimary,
  },
});

export default EditRSSSourceScreen;
