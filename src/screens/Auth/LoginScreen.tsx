import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useUser } from '../../contexts/UserContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AppNavigator';
import * as StyleUtils from '../../utils/styleUtils';
import { cloudConfigService } from '../../services/CloudConfigService';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

interface LoginForm {
  email: string;
  password: string;
}

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useThemeContext();
  const { login, state } = useUser();
  const styles = createStyles(theme);

  const [form, setForm] = useState<LoginForm>({
    email: '',
    password: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { isLoading: authLoading } = state;
  const [errors, setErrors] = useState<Partial<LoginForm>>({});

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverUrl, setServerUrl] = useState('http://localhost:30000/');
  const [serverToken, setServerToken] = useState('');

  React.useEffect(() => {
    const loadConfig = async () => {
      const config = await cloudConfigService.getConfig();
      if (config.serverUrl) {
        setServerUrl(config.serverUrl);
      } else {
        setServerUrl('http://localhost:30000/');
        await cloudConfigService.setServer('http://localhost:30000/');
      }
      if (config.serverAccessKey) {
        setServerToken(config.serverAccessKey);
      }
    };
    loadConfig();
  }, []);

  const validateForm = (): boolean => {
    const newErrors: Partial<LoginForm> = {};

    if (!form.email.trim()) {
      newErrors.email = '请输入邮箱地址';
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = '请输入有效的邮箱地址';
    }

    if (!form.password.trim()) {
      newErrors.password = '请输入密码';
    } else if (form.password.length < 6) {
      newErrors.password = '密码至少需要6位字符';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    // 在尝试登录前保存配置好的 ServerURL 和 Server Token
    await cloudConfigService.setServer(serverUrl, serverToken);

    const response = await login({ email: form.email, password: form.password });

    if (!response.success) {
      Alert.alert('登录失败', response.message || '登录失败，请重试');
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleRegister = () => {
    navigation.navigate('Register');
  };

  const handleForgotPassword = () => {
    Alert.alert('忘记密码', '密码重置功能即将推出');
  };

  const updateForm = (field: keyof LoginForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo和标题 */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <MaterialIcons
              name="auto-stories"
              size={64}
              color={theme.colors.primary}
            />
          </View>
          <Text style={styles.title}>ReadFlow</Text>
          <Text style={styles.subtitle}>登录您的账户</Text>
        </View>

        {/* 登录表单 */}
        <View style={styles.formContainer}>
          {/* 邮箱输入 */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>邮箱地址</Text>
            <View style={[styles.inputWrapper, errors.email && styles.inputError]}>
              <MaterialIcons
                name="email"
                size={20}
                color={theme.colors.onSurfaceVariant}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="请输入邮箱地址"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={form.email}
                onChangeText={(text) => updateForm('email', text)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>

          {/* 密码输入 */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>密码</Text>
            <View style={[styles.inputWrapper, errors.password && styles.inputError]}>
              <MaterialIcons
                name="lock"
                size={20}
                color={theme.colors.onSurfaceVariant}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="请输入密码"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={form.password}
                onChangeText={(text) => updateForm('password', text)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.passwordToggle}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={20}
                  color={theme.colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>

          {/* 忘记密码 */}
          <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>忘记密码？</Text>
          </TouchableOpacity>

          {/* 登录按钮 */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading || authLoading}
          >
            <Text style={styles.loginButtonText}>
              {isLoading || authLoading ? '登录中...' : '登录'}
            </Text>
          </TouchableOpacity>

          {/* 高级设置 Toggle */}
          <TouchableOpacity onPress={() => setShowAdvanced(!showAdvanced)} style={styles.serverSettingsToggle}>
            <Text style={styles.serverSettingsToggleText}>{showAdvanced ? '收起高级设置' : '高级设置'}</Text>
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.serverSettingsContainer}>
              <Text style={styles.serverSettingsHint}>配置自定义的 ReadFlow 服务端地址</Text>
              <View style={styles.serverInputRow}>
                <View style={styles.serverInputContainer}>
                  <TextInput
                    style={styles.serverInput}
                    placeholder="http://192.168.x.x:30000/"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    value={serverUrl}
                    onChangeText={setServerUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
              </View>

              <Text style={[styles.serverSettingsHint, { marginTop: 12 }]}>服务端访问令牌 (Server Token, 选填)</Text>
              <View style={styles.serverInputRow}>
                <View style={styles.serverInputContainer}>
                  <TextInput
                    style={styles.serverInput}
                    placeholder="填入服务端的 SERVER_TOKEN"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    value={serverToken}
                    onChangeText={setServerToken}
                    secureTextEntry={true}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            </View>
          )}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  serverSettingsContainer: {
    marginTop: 32,
    width: '100%',
  },
  serverSettingsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  serverSettingsToggleText: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.primary,
    marginHorizontal: 8,
    fontWeight: '500',
  },
  serverSettingsContent: {
    marginTop: 12,
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: 12,
    padding: 16,
  },
  serverSettingsHint: {
    fontSize: 12,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 12,
    lineHeight: 18,
  },
  serverInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serverInputContainer: {
    flex: 1,
  },
  serverInput: {
    height: 40,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    paddingHorizontal: 12,
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurface,
  },
  testButton: {
    height: 40,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    color: theme.colors.onPrimary,
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.surfaceContainer,
    justifyContent: 'center' as any,
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    includeFontPadding: false,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    fontWeight: '500',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row' as any,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: theme.isDark ? '#000' : (theme.colors.shadow || '#000'),
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: theme.isDark ? 0.3 : 0.05,
    shadowRadius: 2,
    elevation: theme.isDark ? 2 : 1,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    color: theme.colors.onSurface,
  },
  passwordToggle: {
    padding: 4,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    color: theme.colors.error,
    marginTop: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center' as any,
    marginBottom: 24,
    shadowColor: theme.isDark ? '#000' : (theme.colors.shadow || '#000'),
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.isDark ? 0.3 : 0.15,
    shadowRadius: 4,
    elevation: theme.isDark ? 4 : 3,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    fontWeight: '600',
    color: theme.colors.onPrimary,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.outline,
  },
  dividerText: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
    marginHorizontal: 16,
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerText: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
    marginRight: 4,
  },
  registerLink: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});

export default LoginScreen;
