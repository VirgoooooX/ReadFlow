import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UserStackParamList } from '../../navigation/types';
import BrandIcon from '../../components/BrandIcon';
import { SettingsService } from '../../services/SettingsService';
import { translationService } from '../../services/TranslationService';
import cacheEventEmitter from '../../services/CacheEventEmitter';

type NavigationProp = NativeStackNavigationProp<UserStackParamList, 'LLMSettings'>;

type LLMFeature = 'translation' | 'dictionary' | 'titleTranslation' | 'dailyReport';
type SelectorKey =
  | 'binding_translation'
  | 'binding_dictionary'
  | 'binding_titleTranslation'
  | 'binding_dailyReport'
  | 'editing_profile'
  | 'provider'
  | 'model';

interface LLMProfile {
  id: string;
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  isActive: boolean;
  customModelName: string;
}

const LLMSettingsScreen: React.FC = () => {
  const { theme } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();

  // LLM设置状态 - 基于数据库字段简化设计
  const [profiles, setProfiles] = useState<LLMProfile[]>([]);
  const [bindings, setBindings] = useState<Record<LLMFeature, string>>({
    translation: '',
    dictionary: '',
    titleTranslation: '',
    dailyReport: '',
  });
  const [editingProfileId, setEditingProfileId] = useState('');
  const [profileName, setProfileName] = useState('');

  const [provider, setProvider] = useState('openai'); // openai, anthropic, local, custom_openai
  const [model, setModel] = useState('gpt-3.5-turbo');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [temperatureText, setTemperatureText] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState(2048);
  const [maxTokensText, setMaxTokensText] = useState('2048');
  const [topP, setTopP] = useState(1.0);
  const [topPText, setTopPText] = useState('1.0');
  const [isActive, setIsActive] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showBaseUrl, setShowBaseUrl] = useState(false);
  const [customModelName, setCustomModelName] = useState('');
  const [loading, setLoading] = useState(true);
  const [usageStats, setUsageStats] = useState({ monthly: 0, total: 0 });
  const [expandedSelector, setExpandedSelector] = useState<SelectorKey | null>(null);

  // 加载设置
  useEffect(() => {
    loadSettings();
    loadUsageStats();
  }, []);

  useEffect(() => {
    const unsubscribe = cacheEventEmitter.subscribe((eventData) => {
      if (eventData.type === 'settingsUpdated') {
        loadSettings();
      }
    });
    return unsubscribe;
  }, []);

  const loadSettings = async () => {
    try {
      const settingsService = SettingsService.getInstance();
      const store = await settingsService.getLLMSettingsStore();
      const nextProfiles: LLMProfile[] = store?.profiles || [];
      const nextBindings: Record<LLMFeature, string> = store?.bindings || {
        translation: '',
        dictionary: '',
        titleTranslation: '',
        dailyReport: '',
      };

      setProfiles(nextProfiles);
      setBindings(nextBindings);

      const preferredEditingId =
        store?.ui?.lastEditedProfileId ||
        nextBindings.translation ||
        nextProfiles[0]?.id ||
        '';

      const activeProfile =
        nextProfiles.find(p => p.id === preferredEditingId) || nextProfiles[0];

      if (activeProfile) {
        setEditingProfileId(activeProfile.id);
        setProfileName(activeProfile.name || '');
        setProvider(activeProfile.provider);
        setModel(activeProfile.model);
        setApiKey(activeProfile.apiKey);
        setBaseUrl(activeProfile.baseUrl);
        setTemperature(activeProfile.temperature);
        setTemperatureText(activeProfile.temperature.toString());
        setMaxTokens(activeProfile.maxTokens);
        setMaxTokensText(activeProfile.maxTokens.toString());
        setTopP(activeProfile.topP);
        setTopPText(activeProfile.topP.toString());
        setIsActive(activeProfile.isActive);
        setCustomModelName(activeProfile.customModelName);
      }
    } catch (error) {
      console.error('Failed to load LLM settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsageStats = async () => {
    try {
      const stats = await translationService.getUsageStats();
      setUsageStats({ monthly: stats.monthly, total: stats.total });
    } catch (error) {
      console.error('Failed to load usage stats:', error);
      // 设置默认值，防止页面崩溃
      setUsageStats({ monthly: 0, total: 0 });
    }
  };

  const saveCurrentProfile = async () => {
    try {
      const settingsService = SettingsService.getInstance();
      if (!editingProfileId) return;
      const profile: LLMProfile = {
        id: editingProfileId,
        name: profileName.trim() || '未命名',
        provider,
        model,
        apiKey,
        baseUrl,
        temperature,
        maxTokens,
        topP,
        isActive,
        customModelName,
      };
      await settingsService.upsertLLMProfile(profile);
    } catch (error) {
      console.error('Failed to save LLM settings:', error);
    }
  };

  const applyProfileToForm = (profile: LLMProfile) => {
    setEditingProfileId(profile.id);
    setProfileName(profile.name || '');
    setProvider(profile.provider);
    setModel(profile.model);
    setApiKey(profile.apiKey || '');
    setBaseUrl(profile.baseUrl || '');
    setTemperature(profile.temperature ?? 0.7);
    setTemperatureText((profile.temperature ?? 0.7).toString());
    setMaxTokens(profile.maxTokens ?? 2048);
    setMaxTokensText((profile.maxTokens ?? 2048).toString());
    setTopP(profile.topP ?? 1.0);
    setTopPText((profile.topP ?? 1.0).toString());
    setIsActive(profile.isActive);
    setCustomModelName(profile.customModelName);
    setShowApiKey(false);
    setShowBaseUrl(false);
  };

  const handleEditingProfileChange = async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    applyProfileToForm(profile);
    try {
      const settingsService = SettingsService.getInstance();
      await settingsService.setLLMLastEditedProfileId(profileId);
    } catch (error) {
      console.error('Failed to save last edited profile:', error);
    }
  };

  const handleBindingChange = async (feature: LLMFeature, profileId: string) => {
    try {
      const settingsService = SettingsService.getInstance();
      await settingsService.setLLMBinding(feature, profileId);
      await loadSettings();
    } catch (error) {
      console.error('Failed to update LLM binding:', error);
    }
  };

  const buildUniqueProfileName = (baseName: string) => {
    const existing = new Set(profiles.map(p => (p.name || '').trim()).filter(Boolean));
    if (!existing.has(baseName)) return baseName;
    for (let i = 2; i < 1000; i += 1) {
      const candidate = `${baseName} (${i})`;
      if (!existing.has(candidate)) return candidate;
    }
    return `${baseName} (${Date.now()})`;
  };

  const handleCreateProfile = async () => {
    try {
      const settingsService = SettingsService.getInstance();
      const id = `profile_${Date.now()}`;
      const profile: LLMProfile = {
        id,
        name: buildUniqueProfileName(`档案${profiles.length + 1}`),
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        temperature: 0.7,
        maxTokens: 2048,
        topP: 1.0,
        isActive: true,
        customModelName: '',
      };
      await settingsService.upsertLLMProfile(profile);
      await loadSettings();
    } catch (error) {
      console.error('Failed to create profile:', error);
    }
  };

  const handleDuplicateProfile = async () => {
    if (!editingProfileId) return;
    try {
      const settingsService = SettingsService.getInstance();
      const id = `profile_${Date.now()}`;
      const profile: LLMProfile = {
        id,
        name: buildUniqueProfileName(`${profileName.trim() || '未命名'} 副本`),
        provider,
        model,
        apiKey,
        baseUrl,
        temperature,
        maxTokens,
        topP,
        isActive,
        customModelName,
      };
      await settingsService.upsertLLMProfile(profile);
      await loadSettings();
    } catch (error) {
      console.error('Failed to duplicate profile:', error);
    }
  };

  const handleDeleteProfile = async () => {
    if (!editingProfileId) return;
    if (profiles.length <= 1) {
      Alert.alert('提示', '至少需要保留一个档案');
      return;
    }
    Alert.alert('删除档案', `确定删除“${profileName || '未命名'}”吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            const settingsService = SettingsService.getInstance();
            await settingsService.deleteLLMProfile(editingProfileId);
            await loadSettings();
          } catch (error) {
            console.error('Failed to delete profile:', error);
          }
        },
      },
    ]);
  };

  // 提供商选项
  const providerOptions = [
    {
      label: 'OpenAI 官方',
      value: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      icon: 'auto-awesome'
    },
    {
      label: 'Anthropic (Claude)',
      value: 'anthropic',
      apiUrl: 'https://api.anthropic.com/v1',
      models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
      icon: 'psychology'
    },
    {
      label: 'Google Gemini',
      value: 'google',
      apiUrl: 'https://generativelanguage.googleapis.com/v1',
      models: ['gemini-pro', 'gemini-pro-vision'],
      icon: 'stars'
    },
    {
      label: '本地模型',
      value: 'local',
      apiUrl: 'http://localhost:11434/v1',
      models: ['llama2', 'codellama', 'mistral'],
      icon: 'computer'
    },
    {
      label: '自定义第三方API',
      value: 'custom',
      apiUrl: '',
      models: [],
      icon: 'settings'
    }
  ];

  // 获取当前选中提供商的信息
  const getCurrentProvider = () => {
    return providerOptions.find(p => p.value === provider) || providerOptions[0];
  };
  // 提供商选择处理函数
  const handleProviderChange = (selectedProvider: string) => {
    setProvider(selectedProvider);
    const providerInfo = providerOptions.find(p => p.value === selectedProvider);
    if (providerInfo) {
      setBaseUrl(providerInfo.apiUrl);
      // 如果有预设模型，选择第一个作为默认值
      if (providerInfo.models.length > 0) {
        setModel(providerInfo.models[0]);
      } else {
        setModel('');
      }
    }

    // 重置自定义模型名称
    setCustomModelName('');
  };

  // 参数输入处理函数
  const handleTemperatureChange = (text: string) => {
    if (text === '' || text === '.' || text === '0.') {
      // 允许中间状态
      return;
    }
    const value = parseFloat(text);
    if (!isNaN(value) && value >= 0 && value <= 2) {
      setTemperature(value);
    }
  };

  const handleMaxTokensChange = (text: string) => {
    setMaxTokensText(text);
    if (text === '') {
      return;
    }
    const value = parseInt(text);
    if (!isNaN(value) && value > 0) {
      setMaxTokens(value);
    }
  };

  const handleTopPChange = (text: string) => {
    if (text === '' || text === '.' || text === '0.' || text === '1.') {
      return;
    }
    const value = parseFloat(text);
    if (!isNaN(value) && value >= 0 && value <= 1) {
      setTopP(value);
    }
  };

  const handleApiKeyChange = (text: string) => {
    setApiKey(text);
  };

  const handleBaseUrlChange = (text: string) => {
    setBaseUrl(text);
  };



  const handleTestConnection = async () => {
    if (!apiKey) {
      Alert.alert('提示', '请先配置API密钥');
      return;
    }

    Alert.alert('测试连接', '正在测试API连接...');

    try {
      // 使用简单的翻译请求测试
      const testText = 'Hello';
      const result = await translationService.translateSentence(testText, 'en', 'zh');

      if (result) {
        Alert.alert('成功', `API连接正常！\n测试结果: ${result}`);
      } else {
        Alert.alert('失败', 'API返回空结果，请检查配置');
      }
    } catch (error: any) {
      Alert.alert('失败', `API请求失败: ${error.message || '未知错误'}`);
    }
  };

  const handleSave = async () => {
    try {
      // 验证自定义模型名称
      if (provider === 'custom' && !customModelName.trim()) {
        Alert.alert('错误', '请输入自定义模型名称');
        return;
      }

      // 验证Base URL
      if (provider === 'custom' && !baseUrl.trim()) {
        Alert.alert('错误', '请输入Base URL');
        return;
      }

      // 保存设置到AsyncStorage
      await saveCurrentProfile();

      Alert.alert('成功', '档案已保存');
    } catch (error) {
      console.error('保存LLM配置失败:', error);
      Alert.alert('错误', '保存配置失败');
    }
  };

  const getOptionLabel = (options: any[], selectedValue: string) => {
    const selected = options.find((option) => {
      if (typeof option === 'string') return option === selectedValue;
      return option?.value === selectedValue;
    });
    if (!selectedValue) return '未选择';
    if (!selected) return selectedValue;
    if (typeof selected === 'string') return selected;
    return selected.label || selected.value || selectedValue;
  };

  const renderOptionsList = (
    selectedValue: string,
    options: any[],
    onSelect: (value: string) => void,
    defaultIcon?: string
  ) => (
    <View style={styles.expandedOptions}>
      {options.map((option, index) => {
        const value = typeof option === 'string' ? option : option?.value;
        const label = typeof option === 'string' ? option : option?.label;
        const iconName = (typeof option === 'object' ? option?.icon : undefined) || defaultIcon || 'circle';
        const isSelected = selectedValue === value;
        const isLast = index === options.length - 1;
        return (
          <React.Fragment key={value}>
            <TouchableOpacity
              style={[
                styles.optionItem,
                styles.expandedOptionItem,
                isSelected && styles.selectedOption,
              ]}
              onPress={() => onSelect(value)}
            >
              <View style={styles.optionLeft}>
                {value && ['openai', 'anthropic', 'google', 'local', 'custom'].includes(value) ? (
                  <BrandIcon brand={value} size={24} color={theme.colors.primary} />
                ) : (
                  <MaterialIcons name={iconName as any} size={24} color={theme.colors.primary} />
                )}
                <Text style={[styles.optionText, isSelected && styles.selectedText]}>
                  {label || value}
                </Text>
              </View>
              {isSelected && <MaterialIcons name="check" size={24} color={theme.colors.primary} />}
            </TouchableOpacity>
            {!isLast && <View style={styles.optionDivider} />}
          </React.Fragment>
        );
      })}
    </View>
  );

  const renderSelectorRow = (
    selectorKey: SelectorKey,
    title: string,
    icon: string,
    selectedValue: string,
    options: any[],
    onSelect: (value: string) => void,
    defaultIcon?: string
  ) => {
    const expanded = expandedSelector === selectorKey;
    const selectedLabel = getOptionLabel(options, selectedValue);
    return (
      <>
        <TouchableOpacity
          style={styles.optionItem}
          onPress={() => setExpandedSelector(expanded ? null : selectorKey)}
        >
          <View style={styles.optionLeft}>
            <MaterialIcons name={icon as any} size={24} color={theme.colors.primary} />
            <Text style={styles.optionText}>{title}</Text>
          </View>
          <View style={styles.optionRight}>
            <Text style={styles.optionValueText} numberOfLines={1}>
              {selectedLabel}
            </Text>
            <MaterialIcons
              name={expanded ? 'expand-less' : 'chevron-right'}
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
        </TouchableOpacity>
        {expanded &&
          renderOptionsList(selectedValue, options, (value) => {
            onSelect(value);
            setExpandedSelector(null);
          }, defaultIcon)}
      </>
    );
  };

  const renderSwitchOption = (
    title: string,
    description: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    icon: string
  ) => {
    return (
      <View style={styles.optionItem}>
        <View style={styles.optionLeft}>
          <Text style={styles.optionTitle}>{title}</Text>
          {description ? <Text style={styles.optionDesc}>{description}</Text> : null}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{
            false: theme.colors.outline,
            true: theme.colors.primaryContainer,
          }}
          thumbColor={value ? theme.colors.primary : theme.colors.outline}
        />
      </View>
    );
  };

  const styles = createStyles(theme);
  const profileOptions = profiles.map(p => ({
    label: p.name || p.id,
    value: p.id,
    icon: 'badge',
  }));

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.maxWidthContainer}>
          <View style={styles.content}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>概览</Text>
              <View style={styles.card}>
                {renderSwitchOption(
                  '启用LLM功能',
                  '开启或关闭AI功能',
                  isActive,
                  setIsActive,
                  'smart-toy'
                )}
                <View style={styles.optionDivider} />
                <View style={styles.optionItem}>
                  <View style={styles.optionLeft}>
                    <MaterialIcons name="analytics" size={24} color={theme.colors.primary} />
                    <Text style={styles.optionText}>本月请求</Text>
                  </View>
                  <Text style={styles.statValueText}>{usageStats.monthly}次</Text>
                </View>
                <View style={styles.optionDivider} />
                <View style={styles.optionItem}>
                  <View style={styles.optionLeft}>
                    <MaterialIcons name="account-balance" size={24} color={theme.colors.primary} />
                    <Text style={styles.optionText}>总请求数</Text>
                  </View>
                  <Text style={styles.statValueText}>{usageStats.total}次</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>功能绑定</Text>
              <View style={styles.card}>
                {renderSelectorRow(
                  'binding_translation',
                  '翻译',
                  'translate',
                  bindings.translation,
                  profileOptions,
                  (value) => handleBindingChange('translation', value),
                  'badge'
                )}
                <View style={styles.optionDivider} />
                {renderSelectorRow(
                  'binding_dictionary',
                  '查词',
                  'menu-book',
                  bindings.dictionary,
                  profileOptions,
                  (value) => handleBindingChange('dictionary', value),
                  'badge'
                )}
                <View style={styles.optionDivider} />
                {renderSelectorRow(
                  'binding_titleTranslation',
                  '标题翻译',
                  'title',
                  bindings.titleTranslation,
                  profileOptions,
                  (value) => handleBindingChange('titleTranslation', value),
                  'badge'
                )}
                <View style={styles.optionDivider} />
                {renderSelectorRow(
                  'binding_dailyReport',
                  'AI日报',
                  'auto-awesome',
                  bindings.dailyReport,
                  profileOptions,
                  (value) => handleBindingChange('dailyReport', value),
                  'badge'
                )}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>档案管理</Text>
              <View style={styles.card}>
                {renderSelectorRow(
                  'editing_profile',
                  '当前编辑档案',
                  'manage-accounts',
                  editingProfileId,
                  profileOptions,
                  (value) => handleEditingProfileChange(value),
                  'badge'
                )}
                <View style={styles.optionDivider} />
                <View style={[styles.inputContainer, styles.inputContainerNoDivider]}>
                  <View style={styles.inputHeader}>
                    <MaterialIcons name="badge" size={24} color={theme.colors.primary} />
                    <Text style={styles.inputLabel}>档案名称</Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={profileName}
                    onChangeText={setProfileName}
                    placeholder="例如：查词-便宜模型"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.optionDivider} />
                <TouchableOpacity style={styles.optionItem} onPress={handleCreateProfile}>
                  <View style={styles.optionLeft}>
                    <MaterialIcons name="add" size={24} color={theme.colors.primary} />
                    <Text style={styles.optionText}>新建档案</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.optionDivider} />
                <TouchableOpacity style={styles.optionItem} onPress={handleDuplicateProfile}>
                  <View style={styles.optionLeft}>
                    <MaterialIcons name="content-copy" size={24} color={theme.colors.primary} />
                    <Text style={styles.optionText}>复制当前档案</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.optionDivider} />
                <TouchableOpacity style={styles.optionItem} onPress={handleDeleteProfile}>
                  <View style={styles.optionLeft}>
                    <MaterialIcons name="delete" size={24} color={theme.colors.error} />
                    <Text style={[styles.optionText, { color: theme.colors.error }]}>
                      删除当前档案
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>档案配置</Text>
              <View style={styles.card}>
                {renderSelectorRow(
                  'provider',
                  'AI 提供商',
                  'hub',
                  provider,
                  providerOptions,
                  handleProviderChange
                )}
                {getCurrentProvider().models.length > 0 && (
                  <>
                    <View style={styles.optionDivider} />
                    {renderSelectorRow(
                      'model',
                      '模型',
                      'psychology',
                      model,
                      getCurrentProvider().models,
                      setModel,
                      'psychology'
                    )}
                  </>
                )}
                {(provider === 'custom' || getCurrentProvider().models.length === 0) && (
                  <>
                    <View style={styles.optionDivider} />
                    <View style={[styles.inputContainer, styles.inputContainerNoDivider]}>
                      <View style={styles.inputHeader}>
                        <MaterialIcons name="edit" size={24} color={theme.colors.primary} />
                        <Text style={styles.inputLabel}>自定义模型</Text>
                      </View>
                      <TextInput
                        style={styles.textInput}
                        value={customModelName}
                        onChangeText={setCustomModelName}
                        placeholder="例如: gpt-4, claude-3-opus, llama2 等"
                        placeholderTextColor={theme.colors.onSurfaceVariant}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <Text style={styles.inputHint}>请输入具体的模型名称</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* API配置 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>API 配置</Text>
              <View style={styles.card}>
                <View style={styles.inputContainer}>
                  <View style={styles.inputHeader}>
                    <MaterialIcons name="key" size={24} color={theme.colors.primary} />
                    <Text style={styles.inputLabel}>API密钥</Text>
                    <TouchableOpacity
                      onPress={() => setShowApiKey(!showApiKey)}
                      style={styles.toggleButton}
                    >
                      <MaterialIcons
                        name={showApiKey ? 'visibility-off' : 'visibility'}
                        size={20}
                        color={theme.colors.onSurfaceVariant}
                      />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={apiKey}
                    onChangeText={handleApiKeyChange}
                    placeholder="请输入API密钥"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    secureTextEntry={!showApiKey}
                  />
                  <Text style={styles.inputHint}>状态: {apiKey ? '已配置' : '未配置'}</Text>
                </View>

                <View style={styles.inputContainer}>
                  <View style={styles.inputHeader}>
                    <MaterialIcons name="link" size={24} color={theme.colors.primary} />
                    <Text style={styles.inputLabel}>API地址</Text>
                    {provider !== 'custom' && (
                      <TouchableOpacity
                        onPress={() => setShowBaseUrl(!showBaseUrl)}
                        style={styles.toggleButton}
                      >
                        <MaterialIcons
                          name={showBaseUrl ? 'visibility-off' : 'visibility'}
                          size={20}
                          color={theme.colors.onSurfaceVariant}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={[
                      styles.textInput,
                      provider !== 'custom' && { backgroundColor: theme.colors.surfaceVariant }
                    ]}
                    value={baseUrl}
                    onChangeText={handleBaseUrlChange}
                    placeholder={provider === 'custom' ? '请输入自定义API地址' : '自动配置的API地址'}
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    secureTextEntry={provider !== 'custom' && !showBaseUrl}
                    editable={provider === 'custom'}
                  />
                  <Text style={styles.inputHint}>
                    {provider === 'custom' ? '请输入完整的API基础URL' : `当前提供商: ${getCurrentProvider().label}`}
                  </Text>
                </View>

                <TouchableOpacity style={styles.testButton} onPress={handleTestConnection}>
                  <MaterialIcons name="wifi" size={20} color={theme.colors.primary} />
                  <Text style={styles.testButtonText}>测试连接</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 模型参数 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>模型参数</Text>
              <View style={styles.card}>
                <View style={styles.inputContainer}>
                  <View style={styles.inputHeader}>
                    <MaterialIcons name="thermostat" size={24} color={theme.colors.primary} />
                    <Text style={styles.inputLabel}>Temperature</Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={temperatureText}
                    onChangeText={(text) => {
                      setTemperatureText(text);
                      const value = parseFloat(text);
                      if (!isNaN(value) && value >= 0 && value <= 2) {
                        setTemperature(value);
                      }
                    }}
                    onBlur={() => {
                      // 失去焦点时校验和格式化
                      const value = parseFloat(temperatureText);
                      if (isNaN(value) || value < 0 || value > 2) {
                        setTemperatureText(temperature.toString());
                      } else {
                        setTemperature(value);
                        setTemperatureText(value.toString());
                      }
                    }}
                    placeholder="0.7"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.inputHint}>控制输出随机性，范围: 0-2，推荐: 0.7</Text>
                </View>

                <View style={styles.inputContainer}>
                  <View style={styles.inputHeader}>
                    <MaterialIcons name="memory" size={24} color={theme.colors.primary} />
                    <Text style={styles.inputLabel}>最大Token数</Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={maxTokensText}
                    onChangeText={handleMaxTokensChange}
                    onBlur={() => {
                      const value = parseInt(maxTokensText);
                      if (isNaN(value) || value <= 0) {
                        setMaxTokensText(maxTokens.toString());
                      } else {
                        setMaxTokens(value);
                        setMaxTokensText(value.toString());
                      }
                    }}
                    placeholder="2048"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    keyboardType="numeric"
                  />
                  <Text style={styles.inputHint}>限制输出长度，推荐: 2048</Text>
                </View>

                <View style={styles.inputContainer}>
                  <View style={styles.inputHeader}>
                    <MaterialIcons name="tune" size={24} color={theme.colors.primary} />
                    <Text style={styles.inputLabel}>Top P</Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={topPText}
                    onChangeText={(text) => {
                      setTopPText(text);
                      const value = parseFloat(text);
                      if (!isNaN(value) && value >= 0 && value <= 1) {
                        setTopP(value);
                      }
                    }}
                    onBlur={() => {
                      const value = parseFloat(topPText);
                      if (isNaN(value) || value < 0 || value > 1) {
                        setTopPText(topP.toString());
                      } else {
                        setTopP(value);
                        setTopPText(value.toString());
                      }
                    }}
                    placeholder="1.0"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.inputHint}>核采样参数，范围: 0-1，推荐: 1.0</Text>
                </View>
              </View>
            </View>
            {/* 保存按钮 */}
            <View style={styles.section}>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <MaterialIcons name="save" size={20} color={theme.colors.onPrimary} />
                <Text style={styles.saveButtonText}>保存配置</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView >
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  maxWidthContainer: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 16,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 200,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 12,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    // 投影效果
    shadowColor: theme.isDark ? '#000' : theme.colors.shadow || '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  optionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.outlineVariant,
    marginHorizontal: 14,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  optionValueText: {
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
    marginRight: 8,
    flexShrink: 1,
    textAlign: 'right',
  },
  expandedOptions: {
    paddingBottom: 6,
  },
  expandedOptionItem: {
    paddingLeft: 24,
  },
  selectedOption: {
    backgroundColor: theme.colors.primaryContainer,
  },
  optionText: {
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    fontWeight: '500',
    color: theme.colors.onSurface,
    marginLeft: 12,
  },
  selectedText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  switchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  switchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  switchContent: {
    marginLeft: 12,
    flex: 1,
  },
  switchTitle: {
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    fontWeight: '500',
    color: theme.colors.onSurface,
    marginBottom: 2,
  },
  optionTitle: {
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    fontWeight: '500',
    color: theme.colors.onSurface,
    marginBottom: 2,
  },
  switchDescription: {
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
  },
  optionDesc: {
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
  },
  inputContainer: {
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  inputContainerNoDivider: {
    borderBottomWidth: 0,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    fontWeight: '500',
    color: theme.colors.onSurface,
    marginLeft: 12,
    flex: 1,
  },
  toggleButton: {
    padding: 4,
  },
  textInput: {
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  testButtonText: {
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    fontWeight: '500',
    marginLeft: 8,
    color: theme.colors.primary,
  },
  statsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    // 投影效果
    shadowColor: theme.isDark ? '#000' : theme.colors.shadow || '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  lastStatItem: {
    borderBottomWidth: 0,
  },
  statContent: {
    marginLeft: 12,
    flex: 1,
  },
  statLabel: {
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  statValueText: {
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    // 投影效果
    shadowColor: theme.isDark ? '#000' : theme.colors.shadow || '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.isDark ? 0.4 : 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
    fontWeight: '600',
    color: theme.colors.onPrimary,
    marginLeft: 8,
  },
});

export default LLMSettingsScreen;
