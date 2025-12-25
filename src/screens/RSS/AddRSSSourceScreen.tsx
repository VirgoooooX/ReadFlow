import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { useRSSGroup } from '../../contexts/RSSGroupContext';
import { rssService } from '../../services/rss';
import * as StyleUtils from '../../utils/styleUtils';
import { Switch } from 'react-native';

type NavigationProp = NativeStackNavigationProp<any, 'AddRSSSource'>;

const AddRSSSourceScreen: React.FC = () => {
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();
  const { refreshRSSSources } = useRSSSource();
  const { groups, addSourceToGroup } = useRSSGroup();

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('技术');
  const [contentType, setContentType] = useState<'text' | 'image_text'>('image_text');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [useProxy, setUseProxy] = useState(false); // 是否通过代理获取
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null); // 📁 选中的分组

  const categories = ['技术', '新闻', '博客', '科学', '设计', '其他'];

  const validateRSSUrl = async (rssUrl: string) => {
    if (!rssUrl.trim()) {
      Alert.alert('错误', '请输入RSS源地址');
      return false;
    }

    // 支持HTTP/HTTPS和RSSHUB协议
    if (!rssUrl.startsWith('http://') && !rssUrl.startsWith('https://') && !rssUrl.startsWith('rsshub://')) {
      Alert.alert('错误', '请输入有效的RSS源地址（支持http://、https://或rsshub://协议）');
      return false;
    }

    setIsValidating(true);
    try {
      await rssService.validateRSSFeed(rssUrl);
      setIsValidating(false);
      return true;
    } catch (error) {
      setIsValidating(false);
      console.error('RSS验证失败:', error);
      
      // 提供更详细的错误信息和解决方案
      const errorMsg = error instanceof Error ? error.message : String(error);
      let helpText = '无法访问该RSS源。\n\n';
      
      if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
        helpText += '可能原因：\n• 网络连接较慢\n• RSS源服务器响应慢\n\n建议：\n• 检查网络连接\n• 开启「通过代理获取」开关\n• 稍后再试';
      } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        helpText += '可能原因：\n• 无法连接到服务器\n• 域名解析失败\n\n建议：\n• 检查URL是否正确\n• 尝试开启「通过代理获取」';
      } else if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        helpText += '可能原因：\n• RSS地址不存在\n\n建议：\n• 检查URL是否完整正确\n• 在浏览器中测试该地址';
      } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
        helpText += '可能原因：\n• 服务器拒绝访问\n\n建议：\n• 开启「通过代理获取」开关';
      } else {
        helpText += '建议：\n• 检查URL是否正确\n• 尝试开启「通过代理获取」\n• 检查网络连接';
      }
      
      Alert.alert('验证失败', helpText);
      return false;
    }
  };

  const handleAddRSSSource = async () => {
    const isValid = await validateRSSUrl(url);
    if (!isValid) return;

    setIsLoading(true);
    try {
      const result = await rssService.addRSSSource(
        url.trim(),
        name.trim() || '未命名RSS源',
        contentType,
        category,
        useProxy ? 'proxy' : 'direct'
      );
      
      // 📁 如果选择了分组，将源添加到分组
      if (selectedGroupId && result?.id) {
        await addSourceToGroup(result.id, selectedGroupId);
      }
      
      // 添加成功，刷新RSS源列表
      await refreshRSSSources();
      
      Alert.alert(
        '添加成功',
        `RSS源 "${name || '未命名RSS源'}" 已成功添加`,
        [
          {
            text: '确定',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error adding RSS source:', error);
      Alert.alert('添加失败', '添加RSS源时发生错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAdd = (quickUrl: string, quickName: string, quickContentType: 'text' | 'image_text' = 'image_text') => {
    setUrl(quickUrl);
    setName(quickName);
    setContentType(quickContentType);
  };

  const quickSources = [
    { name: 'GitHub Blog', url: 'https://github.blog/feed/', contentType: 'image_text' as const },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', contentType: 'image_text' as const },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage', contentType: 'text' as const },
    { name: 'Stack Overflow Blog', url: 'https://stackoverflow.blog/feed/', contentType: 'image_text' as const },
  ];

  const styles = createStyles(isDark, theme);

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
            <Text style={styles.title}>添加RSS源</Text>
            <Text style={styles.subtitle}>添加您喜欢的RSS订阅源</Text>
          </View>

          {/* RSS源信息表单 */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>RSS源地址 *</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://example.com/feed.xml"
                  placeholderTextColor={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {isValidating && (
                  <ActivityIndicator 
                    size="small" 
                    color={theme?.colors?.primary || '#3B82F6'} 
                    style={styles.validatingIcon}
                  />
                )}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>源名称</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="为RSS源起个名字"
                placeholderTextColor={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>分类</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      category === cat && styles.categoryChipSelected
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[
                      styles.categoryChipText,
                      category === cat && styles.categoryChipTextSelected
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
                    contentType === 'image_text' && styles.contentTypeOptionSelected
                  ]}
                  onPress={() => setContentType('image_text')}
                >
                  <MaterialIcons 
                    name="image" 
                    size={20} 
                    color={contentType === 'image_text' 
                      ? (theme?.colors?.onPrimary || '#FFFFFF')
                      : (theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'))
                    } 
                  />
                  <Text style={[
                    styles.contentTypeText,
                    contentType === 'image_text' && styles.contentTypeTextSelected
                  ]}>
                    多媒体内容
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.contentTypeOption,
                    contentType === 'text' && styles.contentTypeOptionSelected
                  ]}
                  onPress={() => setContentType('text')}
                >
                  <MaterialIcons 
                    name="text-fields" 
                    size={20} 
                    color={contentType === 'text' 
                      ? (theme?.colors?.onPrimary || '#FFFFFF')
                      : (theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'))
                    } 
                  />
                  <Text style={[
                    styles.contentTypeText,
                    contentType === 'text' && styles.contentTypeTextSelected
                  ]}>
                    纯文本
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.contentTypeHint}>
                {contentType === 'image_text' 
                  ? '将提取图片和视频，适合多媒体内容源' 
                  : '不提取图片和视频，适合纯文本内容源，加载更快'}
              </Text>
            </View>

            {/* 📁 分组选择 */}
            {groups.length > 0 && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>所属分组（可选）</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                  {/* 默认分组选项 */}
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
                  
                  {/* 分组列表 */}
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

            {/* 代理开关 */}
            <View style={styles.inputGroup}>
              <View style={styles.proxyContainer}>
                <View style={styles.proxyInfo}>
                  <View style={styles.proxyTitleRow}>
                    <MaterialIcons 
                      name="cloud" 
                      size={20} 
                      color={useProxy ? (theme?.colors?.primary || '#3B82F6') : (theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'))} 
                    />
                    <Text style={styles.proxyTitle}>通过代理获取</Text>
                  </View>
                  <Text style={styles.proxyHint}>
                    使用代理服务器抓取此源，适合需要翻墙的国外源
                  </Text>
                </View>
                <Switch
                  value={useProxy}
                  onValueChange={setUseProxy}
                  trackColor={{ 
                    false: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E7E0EC'),
                    true: theme?.colors?.primaryContainer || (isDark ? '#004A77' : '#CCE7FF')
                  }}
                  thumbColor={useProxy 
                    ? (theme?.colors?.primary || '#3B82F6') 
                    : (theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'))
                  }
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>描述（可选）</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="简单描述这个RSS源的内容"
                placeholderTextColor={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* 快速添加 */}
          <View style={styles.quickAddSection}>
            <Text style={styles.sectionTitle}>快速添加</Text>
            <Text style={styles.sectionSubtitle}>点击下方推荐源快速添加</Text>
            <View style={styles.quickSourcesList}>
              {quickSources.map((source) => (
                <TouchableOpacity
                  key={source.name}
                  style={styles.quickSourceItem}
                  onPress={() => handleQuickAdd(source.url, source.name, source.contentType)}
                >
                  <View style={styles.quickSourceIcon}>
                    <MaterialIcons 
                      name="rss-feed" 
                      size={20} 
                      color={theme?.colors?.primary || '#3B82F6'} 
                    />
                  </View>
                  <View style={styles.quickSourceContent}>
                    <Text style={styles.quickSourceName}>{source.name}</Text>
                    <Text style={styles.quickSourceUrl}>{source.url}</Text>
                  </View>
                  <MaterialIcons 
                    name="add" 
                    size={20} 
                    color={theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E')} 
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 底部操作按钮 */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={isLoading}
        >
          <Text style={styles.cancelButtonText}>取消</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.addButton,
            (!url.trim() || isLoading) && styles.addButtonDisabled
          ]}
          onPress={handleAddRSSSource}
          disabled={!url.trim() || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={theme?.colors?.onPrimary || '#FFFFFF'} />
          ) : (
            <>
              <MaterialIcons name="add" size={20} color={theme?.colors?.onPrimary || '#FFFFFF'} />
              <Text style={styles.addButtonText}>添加RSS源</Text>
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
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  validatingIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
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
  quickAddSection: {
    marginBottom: 100, // 为底部按钮留出空间
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginBottom: 16,
  },
  quickSourcesList: {
    gap: 8,
  },
  quickSourceItem: {
    flexDirection: 'row' as any,
    alignItems: 'center' as any,
    ...StyleUtils.createCardStyle(isDark, theme),
    borderRadius: 12,
    padding: 12,
  },
  quickSourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#004A77' : '#CCE7FF'),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quickSourceContent: {
    flex: 1,
  },
  quickSourceName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  quickSourceUrl: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginTop: 2,
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
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
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

export default AddRSSSourceScreen;
