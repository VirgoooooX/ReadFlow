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

type NavigationProp = NativeStackNavigationProp<any, 'AddRSSSource'>;

const AddRSSSourceScreen: React.FC = () => {
  const { theme } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();
  const { refreshRSSSources } = useRSSSource();
  const { groups, addSourceToGroup } = useRSSGroup();

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null); // 📁 选中的分组

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
        helpText += '可能原因：\n• 网络连接较慢\n• RSS源服务器响应慢\n\n建议：\n• 检查网络连接\n• 稍后再试';
      } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        helpText += '可能原因：\n• 无法连接到服务器\n• 域名解析失败\n\n建议：\n• 检查URL是否正确';
      } else if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        helpText += '可能原因：\n• RSS地址不存在\n\n建议：\n• 检查URL是否完整正确\n• 在浏览器中测试该地址';
      } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
        helpText += '可能原因：\n• 服务器拒绝访问\n\n建议：\n• 检查该源是否限制访问';
      } else {
        helpText += '建议：\n• 检查URL是否正确\n• 检查网络连接';
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
        'image_text',
        '技术',
        'direct',
        50,
        100
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

  const styles = createStyles(theme);

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
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {isValidating && (
                  <ActivityIndicator 
                    size="small" 
                    color={theme.colors.primary} 
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
                placeholderTextColor={theme.colors.onSurfaceVariant}
              />
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
            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          ) : (
            <>
              <MaterialIcons name="add" size={20} color={theme.colors.onPrimary} />
              <Text style={styles.addButtonText}>添加RSS源</Text>
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
  validatingIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
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
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
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

export default AddRSSSourceScreen;
