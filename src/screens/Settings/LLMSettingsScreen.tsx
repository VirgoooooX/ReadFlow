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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../../navigation/AppNavigator';
import BrandIcon from '../../components/BrandIcon';
import { SettingsService } from '../../services/SettingsService';
import { translationService } from '../../services/TranslationService';

type NavigationProp = NativeStackNavigationProp<SettingsStackParamList, 'LLMSettings'>;

interface LLMSettings {
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
  const { theme, isDark } = useThemeContext();
  const navigation = useNavigation<NavigationProp>();

  // LLM设置状态 - 基于数据库字段简化设计
  const [provider, setProvider] = useState('openai'); // openai, anthropic, local, custom_openai
  const [model, setModel] = useState('gpt-3.5-turbo');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [temperatureText, setTemperatureText] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState(2048);
  const [topP, setTopP] = useState(1.0);
  const [topPText, setTopPText] = useState('1.0');
  const [isActive, setIsActive] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showBaseUrl, setShowBaseUrl] = useState(false);
  const [customModelName, setCustomModelName] = useState('');
  const [loading, setLoading] = useState(true);
  const [usageStats, setUsageStats] = useState({ monthly: 0, total: 0 });

  // 加载设置
  useEffect(() => {
    loadSettings();
    loadUsageStats();
  }, []);

  const loadSettings = async () => {
    try {
      const settingsService = SettingsService.getInstance();
      const settings = await settingsService.getLLMSettings();
      if (settings) {
        setProvider(settings.provider);
        setModel(settings.model);
        setApiKey(settings.apiKey);
        setBaseUrl(settings.baseUrl);
        setTemperature(settings.temperature);
        setTemperatureText(settings.temperature.toString());
        setMaxTokens(settings.maxTokens);
        setTopP(settings.topP);
        setTopPText(settings.topP.toString());
        setIsActive(settings.isActive);
        setCustomModelName(settings.customModelName);
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

  const saveSettings = async () => {
    try {
      const settingsService = SettingsService.getInstance();
      const settings: LLMSettings = {
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
      await settingsService.saveLLMSettings(settings);
    } catch (error) {
      console.error('Failed to save LLM settings:', error);
    }
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
  const handleProviderChange = async (selectedProvider: string) => {
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
    
    // 自动保存
    try {
      await saveSettings();
    } catch (error) {
      console.error('Failed to save provider change:', error);
    }
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
      await saveSettings();
      
      Alert.alert('成功', 'LLM配置已保存');
    } catch (error) {
      console.error('保存LLM配置失败:', error);
      Alert.alert('错误', '保存配置失败');
    }
  };

  // 选择器渲染函数
  const renderOptionSelector = (
    title: string,
    selectedValue: string,
    options: any[],
    onSelect: (value: string) => void,
    defaultIcon?: string
  ) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {options.map((option, index) => {
          const isSelected = selectedValue === option.value || selectedValue === option;
          const isLast = index === options.length - 1;
          const iconName = option.icon || defaultIcon || 'circle';
          return (
            <React.Fragment key={option.value || option}>
              <TouchableOpacity
                style={[
                  styles.optionItem,
                  isSelected && styles.selectedOption,
                ]}
                onPress={() => onSelect(option.value || option)}
              >
                <View style={styles.optionLeft}>
                  {option.value && ['openai', 'anthropic', 'google', 'local', 'custom'].includes(option.value) ? (
                    <BrandIcon 
                      brand={option.value} 
                      size={24} 
                      color={theme?.colors?.primary} 
                    />
                  ) : (
                    <MaterialIcons name={iconName as any} size={24} color={theme?.colors?.primary} />
                  )}
                  <Text style={[
                    styles.optionText,
                    isSelected && styles.selectedText
                  ]}>
                    {option.label || option}
                  </Text>
                </View>
                {isSelected && (
                  <MaterialIcons name="check" size={24} color={theme?.colors?.primary} />
                )}
              </TouchableOpacity>
              {!isLast && <View style={styles.optionDivider} />}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );

  const renderSwitchOption = (
    title: string,
    description: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    icon: string
  ) => (
    <View style={styles.switchItem}>
      <View style={styles.switchLeft}>
        <MaterialIcons name={icon as any} size={24} color={theme?.colors?.primary} />
        <View style={styles.switchContent}>
          <Text style={styles.switchTitle}>{title}</Text>
          <Text style={styles.switchDescription}>{description}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'),
          true: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF'),
        }}
        thumbColor={value ? theme?.colors?.primary : theme?.colors?.onSurfaceVariant}
      />
    </View>
  );

  const styles = createStyles(isDark, theme);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* 基础配置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>基础配置</Text>
          <View style={styles.card}>
            {renderSwitchOption(
              '启用LLM功能',
              '开启或关闭AI功能',
              isActive,
              setIsActive,
              'smart-toy'
            )}
          </View>
        </View>

        {/* 提供商配置 */}
        {renderOptionSelector('AI提供商', provider, providerOptions, handleProviderChange)}
        
        {/* 模型选择 */}
        {getCurrentProvider().models.length > 0 && (
          renderOptionSelector('模型选择', model, getCurrentProvider().models, setModel, 'psychology')
        )}
        
        {/* 自定义模型名称 - 仅在选择自定义提供商或没有预设模型时显示 */}
        {(provider === 'custom' || getCurrentProvider().models.length === 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>自定义模型</Text>
            <View style={styles.card}>
              <View style={styles.inputContainer}>
                <View style={styles.inputHeader}>
                  <MaterialIcons name="edit" size={24} color={theme?.colors?.primary} />
                  <Text style={styles.inputLabel}>模型名称</Text>
                </View>
                <TextInput
                  style={styles.textInput}
                  value={customModelName}
                  onChangeText={setCustomModelName}
                  placeholder="例如: gpt-4, claude-3-opus, llama2 等"
                  placeholderTextColor={theme?.colors?.onSurfaceVariant}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.inputHint}>请输入具体的模型名称</Text>
              </View>
            </View>
          </View>
        )}
        
        {/* API配置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API配置</Text>
          <View style={styles.card}>
            <View style={styles.inputContainer}>
              <View style={styles.inputHeader}>
                <MaterialIcons name="key" size={24} color={theme?.colors?.primary} />
                <Text style={styles.inputLabel}>API密钥</Text>
                <TouchableOpacity
                  onPress={() => setShowApiKey(!showApiKey)}
                  style={styles.toggleButton}
                >
                  <MaterialIcons
                    name={showApiKey ? 'visibility-off' : 'visibility'}
                    size={20}
                    color={theme?.colors?.onSurfaceVariant}
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.textInput}
                value={showApiKey ? apiKey : '••••••••••••••••'}
                onChangeText={handleApiKeyChange}
                placeholder="请输入API密钥"
                placeholderTextColor={theme?.colors?.onSurfaceVariant}
                secureTextEntry={!showApiKey}
                editable={showApiKey}
              />
              <Text style={styles.inputHint}>状态: {apiKey ? '已配置' : '未配置'}</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <View style={styles.inputHeader}>
                <MaterialIcons name="link" size={24} color={theme?.colors?.primary} />
                <Text style={styles.inputLabel}>API地址</Text>
                {provider !== 'custom' && (
                  <TouchableOpacity
                    onPress={() => setShowBaseUrl(!showBaseUrl)}
                    style={styles.toggleButton}
                  >
                    <MaterialIcons
                      name={showBaseUrl ? 'visibility-off' : 'visibility'}
                      size={20}
                      color={theme?.colors?.onSurfaceVariant}
                    />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={[
                  styles.textInput,
                  provider !== 'custom' && { backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#E7E0EC') }
                ]}
                value={baseUrl}
                onChangeText={handleBaseUrlChange}
                placeholder={provider === 'custom' ? '请输入自定义API地址' : '自动配置的API地址'}
                placeholderTextColor={theme?.colors?.onSurfaceVariant}
                secureTextEntry={provider !== 'custom' && !showBaseUrl}
                editable={provider === 'custom'}
              />
              <Text style={styles.inputHint}>
                 {provider === 'custom' ? '请输入完整的API基础URL' : `当前提供商: ${getCurrentProvider().label}`}
               </Text>
             </View>
            

            
            <TouchableOpacity style={styles.testButton} onPress={handleTestConnection}>
              <MaterialIcons name="wifi" size={20} color={theme?.colors?.primary} />
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
                <MaterialIcons name="thermostat" size={24} color={theme?.colors?.primary} />
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
                placeholderTextColor={theme?.colors?.onSurfaceVariant}
                keyboardType="decimal-pad"
              />
              <Text style={styles.inputHint}>控制输出随机性，范围: 0-2，推荐: 0.7</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <View style={styles.inputHeader}>
                <MaterialIcons name="memory" size={24} color={theme?.colors?.primary} />
                <Text style={styles.inputLabel}>最大Token数</Text>
              </View>
              <TextInput
                style={styles.textInput}
                value={maxTokens.toString()}
                onChangeText={handleMaxTokensChange}
                placeholder="2048"
                placeholderTextColor={theme?.colors?.onSurfaceVariant}
                keyboardType="numeric"
              />
              <Text style={styles.inputHint}>限制输出长度，推荐: 2048</Text>
            </View>
            
            <View style={styles.inputContainer}>
              <View style={styles.inputHeader}>
                <MaterialIcons name="tune" size={24} color={theme?.colors?.primary} />
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
                placeholderTextColor={theme?.colors?.onSurfaceVariant}
                keyboardType="decimal-pad"
              />
              <Text style={styles.inputHint}>核采样参数，范围: 0-1，推荐: 1.0</Text>
            </View>
          </View>
        </View>



        {/* 使用统计 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>使用统计</Text>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <MaterialIcons name="analytics" size={24} color={theme?.colors?.primary} />
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>本月请求</Text>
                <Text style={styles.statValue}>{usageStats.monthly}次</Text>
              </View>
            </View>
            <View style={[styles.statItem, styles.lastStatItem]}>
              <MaterialIcons name="account-balance" size={24} color={theme?.colors?.primary} />
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>总请求数</Text>
                <Text style={styles.statValue}>{usageStats.total}次</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 保存按钮 */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <MaterialIcons name="save" size={20} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>保存配置</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#121212' : '#F5F5F5'),
    paddingHorizontal: 16,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
      marginBottom: 10,
      marginTop: -5,  // 👈 增加与上方容器的距离
      textTransform: 'uppercase',
      letterSpacing: 0.3,
  },
  card: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    overflow: 'hidden',
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
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
    backgroundColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E8E8E8'),
    marginHorizontal: 14,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedOption: {
    backgroundColor: theme?.colors?.primaryContainer || (isDark ? '#4F378B' : '#EADDFF'),
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginLeft: 12,
  },
  selectedText: {
    color: theme?.colors?.primary || '#6750A4',
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
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 2,
  },
  switchDescription: {
    fontSize: 13,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
  },
  inputContainer: {
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E8E8E8'),
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginLeft: 12,
    flex: 1,
  },
  toggleButton: {
    padding: 4,
  },
  textInput: {
    backgroundColor: theme?.colors?.surfaceVariant || (isDark ? '#49454F' : '#F0F0F0'),
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 13,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
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
    fontWeight: '500',
    marginLeft: 8,
    color: theme?.colors?.primary || '#6750A4',
  },
  statsCard: {
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    overflow: 'hidden',
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme?.colors?.outlineVariant || (isDark ? '#3D3D3D' : '#E8E8E8'),
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
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#B0B0B0' : '#666666'),
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
    color: theme?.colors?.onSurface || (isDark ? '#FFFFFF' : '#000000'),
  },
  saveButton: {
    backgroundColor: theme?.colors?.primary || '#6750A4',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    // 投影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
});

export default LLMSettingsScreen;