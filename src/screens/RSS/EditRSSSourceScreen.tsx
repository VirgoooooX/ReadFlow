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
  Switch,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { rssService } from '../../services/rss';
import type { RSSSource } from '../../types';
import * as StyleUtils from '../../utils/styleUtils';

type RootStackParamList = {
  EditRSSSource: { sourceId: number };
};

type EditRSSSourceRouteProp = RouteProp<RootStackParamList, 'EditRSSSource'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface FormData {
  name: string;
  url: string;
  description: string;
  category: string;
  contentType: 'text' | 'image_text';
  sourceMode: 'direct' | 'proxy';
  maxArticles: number; // 新增
  isActive: boolean;
}

interface FormErrors {
  name?: string;
  url?: string;
  category?: string;
  maxArticles?: string; // 新增
}

const EditRSSSourceScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EditRSSSourceRouteProp>();
  const { sourceId } = route.params;
  const { theme, isDark } = useThemeContext();
  const { refreshRSSSources } = useRSSSource();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [originalData, setOriginalData] = useState<RSSSource | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    url: '',
    description: '',
    category: '技术',
    contentType: 'image_text',
    sourceMode: 'direct',
    maxArticles: 20, // 默认 20
    isActive: true,
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const categories = ['技术', '新闻', '科学', '娱乐', '体育', '财经', '其他'];

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
        description: source.description || '',
        category: source.category || '技术',
        contentType: source.contentType || 'image_text',
        sourceMode: source.sourceMode || 'direct',
        maxArticles: source.maxArticles || 20,
        isActive: source.isActive,
      });
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

    if (!formData.category) {
      newErrors.category = '请选择分类';
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
        description: formData.description,
        category: formData.category,
        contentType: formData.contentType,
        sourceMode: formData.sourceMode,
        maxArticles: formData.maxArticles,
        isActive: formData.isActive,
      };

      await rssService.updateRSSSource(sourceId, updatedSource);

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

  const styles = createStyles(isDark, theme);

  if (loading) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={theme?.colors?.primary || '#6750A4'} />
          <Text style={{ marginTop: 16, fontSize: 16, color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F') }}>\u52a0载\u4e2d...</Text>
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
              color={theme?.colors?.primary || '#3B82F6'}
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
                  placeholderTextColor={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {validating && (
                  <ActivityIndicator
                    size="small"
                    color={theme?.colors?.primary || '#3B82F6'}
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
                placeholderTextColor={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')}
              />
              {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>分类</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      formData.category === cat && styles.categoryChipSelected
                    ]}
                    onPress={() => updateFormData('category', cat)}
                  >
                    <Text style={[
                      styles.categoryChipText,
                      formData.category === cat && styles.categoryChipTextSelected
                    ]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>内容类型</Text>
              <View style={styles.contentTypeContainer}>
                <TouchableOpacity
                  style={[
                    styles.contentTypeOption,
                    formData.contentType === 'image_text' && styles.contentTypeOptionSelected
                  ]}
                  onPress={() => updateFormData('contentType', 'image_text')}
                >
                  <MaterialIcons
                    name="image"
                    size={20}
                    color={formData.contentType === 'image_text'
                      ? (theme?.colors?.onPrimary || '#FFFFFF')
                      : (theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'))
                    }
                  />
                  <Text style={[
                    styles.contentTypeText,
                    formData.contentType === 'image_text' && styles.contentTypeTextSelected
                  ]}>
                    多媒体内容
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.contentTypeOption,
                    formData.contentType === 'text' && styles.contentTypeOptionSelected
                  ]}
                  onPress={() => updateFormData('contentType', 'text')}
                >
                  <MaterialIcons
                    name="text-fields"
                    size={20}
                    color={formData.contentType === 'text'
                      ? (theme?.colors?.onPrimary || '#FFFFFF')
                      : (theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'))
                    }
                  />
                  <Text style={[
                    styles.contentTypeText,
                    formData.contentType === 'text' && styles.contentTypeTextSelected
                  ]}>
                    纯文本
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.contentTypeHint}>
                {formData.contentType === 'image_text'
                  ? '将提取图片和视频，适合多媒体内容源'
                  : '不提取图片和视频，适合纯文本内容源，加载更快'}
              </Text>
            </View>

            {/* 代理开关 */}
            <View style={styles.inputGroup}>
              <View style={styles.proxyContainer}>
                <View style={styles.proxyInfo}>
                  <View style={styles.proxyTitleRow}>
                    <MaterialIcons 
                      name="cloud" 
                      size={20} 
                      color={formData.sourceMode === 'proxy' ? (theme?.colors?.primary || '#3B82F6') : (theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'))} 
                    />
                    <Text style={styles.proxyTitle}>通过代理获取</Text>
                  </View>
                  <Text style={styles.proxyHint}>
                    使用代理服务器抓取此源，适合需要翻墙的国外源
                  </Text>
                </View>
                <Switch
                  value={formData.sourceMode === 'proxy'}
                  onValueChange={(value) => updateFormData('sourceMode', value ? 'proxy' : 'direct')}
                  trackColor={{ 
                    false: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E7E0EC'),
                    true: theme?.colors?.primaryContainer || (isDark ? '#004A77' : '#CCE7FF')
                  }}
                  thumbColor={formData.sourceMode === 'proxy' 
                    ? (theme?.colors?.primary || '#3B82F6') 
                    : (theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'))
                  }
                />
              </View>
            </View>

            {/* 文章数量限制 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>文章数量限制</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={String(formData.maxArticles || 0)}
                  onChangeText={(text) => {
                    const value = parseInt(text, 10);
                    if (!isNaN(value) && value >= 0) {
                      updateFormData('maxArticles', value);
                    } else if (text === '') {
                       updateFormData('maxArticles', 0);
                    }
                  }}
                  placeholder="例如: 20"
                  placeholderTextColor={theme?.colors?.onSurfaceVariant || '#999'}
                  keyboardType="number-pad"
                />
              </View>
              <Text style={styles.proxyHint}>每次抓取保留的最新文章数量 (0为不限制，建议 20-50 篇)</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>描述（可选）</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => updateFormData('description', text)}
                placeholder="简单描述这个RSS源的内容"
                placeholderTextColor={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
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
            <ActivityIndicator size="small" color={theme?.colors?.onPrimary || '#FFFFFF'} />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color={theme?.colors?.onPrimary || '#FFFFFF'} />
              <Text style={styles.addButtonText}>保存更改</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#FFFFFF'),
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
    fontWeight: 'bold',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
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
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 8,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    minHeight: 48,
  },
  inputError: {
    borderColor: theme?.colors?.error || '#B3261E',
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
    color: theme?.colors?.error || '#B3261E',
    marginTop: 4,
  },
  categoryScroll: {
    marginTop: 4,
  },
  categoryChip: {
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipSelected: {
    backgroundColor: theme?.colors?.primary || '#3B82F6',
  },
  categoryChipText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  categoryChipTextSelected: {
    color: theme?.colors?.onPrimary || '#FFFFFF',
    fontWeight: '500',
  },
  contentTypeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  contentTypeOption: {
    ...StyleUtils.createCardStyle(isDark, theme),
    flex: 1,
    flexDirection: 'row' as any,
    alignItems: 'center' as any,
    justifyContent: 'center' as any,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  contentTypeOptionSelected: {
    backgroundColor: theme?.colors?.primary || '#3B82F6',
  },
  contentTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  contentTypeTextSelected: {
    color: theme?.colors?.onPrimary || '#FFFFFF',
  },
  contentTypeHint: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginTop: 8,
    lineHeight: 16,
  },
  proxyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...StyleUtils.createCardStyle(isDark, theme),
    borderRadius: 12,
    padding: 16,
  },
  proxyInfo: {
    flex: 1,
    marginRight: 16,
  },
  proxyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proxyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  proxyHint: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginTop: 4,
    lineHeight: 16,
  },
  bottomActions: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#FFFFFF'),
    borderTopWidth: 1,
    borderTopColor: theme?.colors?.outlineVariant || (isDark ? '#49454F' : '#CAC4D0'),
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center' as any,
    justifyContent: 'center' as any,
    ...StyleUtils.createCardStyle(isDark, theme),
    borderRadius: 24,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  addButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: theme?.colors?.primary || '#3B82F6',
    gap: 8,
  },
  addButtonDisabled: {
    backgroundColor: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onPrimary || '#FFFFFF',
  },
});

export default EditRSSSourceScreen;