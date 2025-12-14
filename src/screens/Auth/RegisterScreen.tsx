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

type RegisterScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

interface Props {
  navigation: RegisterScreenNavigationProp;
}

interface RegisterForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, isDark } = useThemeContext();
  const { register, state } = useUser();
  const styles = createStyles(isDark, theme);
  
  const [form, setForm] = useState<RegisterForm>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { isLoading: authLoading } = state;
  const [errors, setErrors] = useState<Partial<RegisterForm>>({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Partial<RegisterForm> = {};
    
    if (!form.username.trim()) {
      newErrors.username = '请输入用户名';
    } else if (form.username.length < 2) {
      newErrors.username = '用户名至少需要2个字符';
    } else if (form.username.length > 20) {
      newErrors.username = '用户名不能超过20个字符';
    }
    
    if (!form.email.trim()) {
      newErrors.email = '请输入邮箱地址';
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = '请输入有效的邮箱地址';
    }
    
    if (!form.password.trim()) {
      newErrors.password = '请输入密码';
    } else if (form.password.length < 6) {
      newErrors.password = '密码至少需要6位字符';
    } else if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(form.password)) {
      newErrors.password = '密码需要包含字母和数字';
    }
    
    if (!form.confirmPassword.trim()) {
      newErrors.confirmPassword = '请确认密码';
    } else if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = '两次输入的密码不一致';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    
    if (!agreedToTerms) {
      Alert.alert('提示', '请先同意用户协议和隐私政策');
      return;
    }

    const response = await register({
      username: form.username,
      email: form.email,
      password: form.password,
    });
    
    if (response.success) {
      Alert.alert('注册成功', '账户创建成功，请登录', [
        { text: '确定', onPress: () => navigation.navigate('Login') }
      ]);
    } else {
      Alert.alert('注册失败', response.message || '注册过程中出现错误，请重试');
    }
  };

  const handleLogin = () => {
    navigation.navigate('Login');
  };

  const updateForm = (field: keyof RegisterForm, value: string) => {
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
        showsVerticalScrollIndicator={false}
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
          <Text style={styles.title}>创建账户</Text>
          <Text style={styles.subtitle}>加入ReadFlow社区</Text>
        </View>

        {/* 注册表单 */}
        <View style={styles.formContainer}>
          {/* 用户名输入 */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>用户名</Text>
            <View style={[styles.inputWrapper, errors.username && styles.inputError]}>
              <MaterialIcons 
                name="person" 
                size={20} 
                color={theme?.colors?.onSurfaceVariant || '#79747E'} 
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="请输入用户名"
                placeholderTextColor={theme?.colors?.onSurfaceVariant || '#79747E'}
                value={form.username}
                onChangeText={(text) => updateForm('username', text)}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
            </View>
            {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}
          </View>

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
            <Text style={styles.passwordHint}>密码需包含字母和数字，至少6位字符</Text>
          </View>

          {/* 确认密码输入 */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>确认密码</Text>
            <View style={[styles.inputWrapper, errors.confirmPassword && styles.inputError]}>
              <MaterialIcons 
                name="lock" 
                size={20} 
                color={theme?.colors?.onSurfaceVariant || '#79747E'} 
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="请再次输入密码"
                placeholderTextColor={theme?.colors?.onSurfaceVariant || '#79747E'}
                value={form.confirmPassword}
                onChangeText={(text) => updateForm('confirmPassword', text)}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity 
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.passwordToggle}
              >
                <MaterialIcons 
                  name={showConfirmPassword ? 'visibility-off' : 'visibility'} 
                  size={20} 
                  color={theme?.colors?.onSurfaceVariant || '#79747E'} 
                />
              </TouchableOpacity>
            </View>
            {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
          </View>

          {/* 用户协议 */}
          <TouchableOpacity 
            style={styles.termsContainer} 
            onPress={() => setAgreedToTerms(!agreedToTerms)}
          >
            <MaterialIcons 
              name={agreedToTerms ? 'check-box' : 'check-box-outline-blank'} 
              size={20} 
              color={theme?.colors?.primary || '#6750A4'} 
            />
            <Text style={styles.termsText}>
              我已阅读并同意
              <Text style={styles.termsLink}>《用户协议》</Text>
              和
              <Text style={styles.termsLink}>《隐私政策》</Text>
            </Text>
          </TouchableOpacity>

          {/* 注册按钮 */}
          <TouchableOpacity 
            style={[styles.registerButton, isLoading && styles.registerButtonDisabled]} 
            onPress={handleRegister}
            disabled={isLoading || authLoading}
          >
            {isLoading || authLoading ? (
              <ActivityIndicator color={theme?.colors?.onPrimary || '#FFFFFF'} />
            ) : (
              <Text style={styles.registerButtonText}>注册</Text>
            )}
          </TouchableOpacity>

          {/* 分割线 */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>或</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* 登录链接 */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>已有账户？</Text>
            <TouchableOpacity onPress={handleLogin}>
              <Text style={styles.loginLink}>立即登录</Text>
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
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
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
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme?.colors?.onSurface || (isDark ? '#E6E1E5' : '#1C1B1F'),
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme?.colors?.surfaceContainer || (isDark ? '#2B2930' : '#F7F2FA'),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme?.colors?.outline || (isDark ? '#938F99' : '#79747E'),
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  passwordHint: {
    fontSize: 12,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginTop: 4,
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginLeft: 8,
    lineHeight: 20,
  },
  termsLink: {
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '500',
  },
  registerButton: {
    backgroundColor: theme?.colors?.primary || '#6750A4',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  registerButtonDisabled: {
    opacity: 0.6,
  },
  registerButtonText: {
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
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    fontSize: 14,
    color: theme?.colors?.onSurfaceVariant || (isDark ? '#938F99' : '#79747E'),
    marginRight: 4,
  },
  loginLink: {
    fontSize: 14,
    color: theme?.colors?.primary || '#6750A4',
    fontWeight: '600',
  },
});

export default RegisterScreen;