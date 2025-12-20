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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useUser } from '../../contexts/UserContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AppNavigator';
import * as StyleUtils from '../../utils/styleUtils';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

interface LoginForm {
  email: string;
  password: string;
}

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const { login, state } = useUser();
  const styles = createStyles(isDark, theme);
  
  const [form, setForm] = useState<LoginForm>({
    email: '',
    password: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { isLoading: authLoading } = state;
  const [errors, setErrors] = useState<Partial<LoginForm>>({});

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

    const response = await login({ email: form.email, password: form.password });
    
    if (!response.success) {
      Alert.alert('登录失败', response.message || '登录失败，请重试');
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
              color={theme?.colors?.primary || '#6750A4'} 
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
                color={theme?.colors?.onSurfaceVariant || '#79747E'} 
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="请输入邮箱地址"
                placeholderTextColor={theme?.colors?.onSurfaceVariant || '#79747E'}
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
                color={theme?.colors?.onSurfaceVariant || '#79747E'} 
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="请输入密码"
                placeholderTextColor={theme?.colors?.onSurfaceVariant || '#79747E'}
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
                  color={theme?.colors?.onSurfaceVariant || '#79747E'} 
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

          {/* 分割线 */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>或</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* 注册链接 */}
          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>还没有账户？</Text>
            <TouchableOpacity onPress={handleRegister}>
              <Text style={styles.registerLink}>立即注册</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (isDark: boolean, theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme?.colors?.background || (isDark ? '#1C1B1F' : '#FFFBFE'),
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
    ...StyleUtils.createCardStyle(isDark, theme),
    justifyContent: 'center' as any,
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row' as any,
    alignItems: 'center',
    backgroundColor: theme?.colors?.surface || (isDark ? '#2B2930' : '#FFFFFF'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme?.colors?.outline || (isDark ? '#49454F' : '#E6E0E9'),
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.1 : 0.05,
    shadowRadius: 2,
    elevation: isDark ? 0 : 1,
  },
  inputError: {
    borderColor: theme?.colors?.error || '#BA1A1A',
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
  },
  passwordToggle: {
    padding: 4,
  },
  errorText: {
    fontSize: 12,
    color: theme?.colors?.error || '#BA1A1A',
    marginTop: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: theme?.colors?.primary || '#6750A4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center' as any,
    marginBottom: 24,
    shadowColor: theme?.colors?.primary || '#6750A4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.15,
    shadowRadius: 4,
    elevation: isDark ? 0 : 3,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme?.colors?.onPrimary || '#FFFFFF',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'),
  },
  dividerText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginHorizontal: 16,
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginRight: 4,
  },
  registerLink: {
    fontSize: 14,
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '600',
  },
});

export default LoginScreen;