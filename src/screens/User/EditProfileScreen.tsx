import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useThemeContext } from '../../theme';
import { useUser } from '../../contexts/UserContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UserStackParamList } from '../../navigation';
import * as ImageManipulator from 'expo-image-manipulator';
import AvatarStorageService from '../../services/AvatarStorageService';
import AuthService from '../../services/AuthService';

type EditProfileScreenNavigationProp = NativeStackNavigationProp<UserStackParamList, 'EditProfile'>;

interface Props {
  navigation: EditProfileScreenNavigationProp;
}

interface UserProfile {
  name: string;
  email: string;
  bio: string;
  avatar: string | null;
  phone: string;
  location: string;
}

const EditProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { theme } = useThemeContext();
  const { state, updateProfile } = useUser();
  const { user } = state;
  const styles = createStyles(theme);
  
  // 使用用户上下文数据
  const [profile, setProfile] = useState<UserProfile>({
    name: user?.username || 'ReadFlow用户',
    email: user?.email || 'user@readflow.com',
    bio: user?.bio || '热爱技术，喜欢阅读科技文章',
    avatar: user?.avatar || null,
    phone: user?.phone || '',
    location: user?.location || '北京',
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<UserProfile>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<UserProfile> = {};
    
    if (!profile.name.trim()) {
      newErrors.name = '请输入用户名';
    } else if (profile.name.length < 2) {
      newErrors.name = '用户名至少需要2个字符';
    } else if (profile.name.length > 20) {
      newErrors.name = '用户名不能超过20个字符';
    }
    
    if (!profile.email.trim()) {
      newErrors.email = '请输入邮箱地址';
    } else if (!/\S+@\S+\.\S+/.test(profile.email)) {
      newErrors.email = '请输入有效的邮箱地址';
    }
    
    if (profile.bio.length > 200) {
      newErrors.bio = '个人简介不能超过200个字符';
    }
    
    if (profile.phone && !/^1[3-9]\d{9}$/.test(profile.phone)) {
      newErrors.phone = '请输入有效的手机号码';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      const response = await updateProfile({
        username: profile.name,
        bio: profile.bio,
        phone: profile.phone,
        location: profile.location,
        avatar: profile.avatar || undefined,
      });
      
      if (response.success) {
        Alert.alert('保存成功', '个人资料已更新', [
          { text: '确定', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert('保存失败', response.message || '更新个人资料时出现错误，请重试');
      }
    } catch (error) {
      Alert.alert('保存失败', '更新个人资料时出现错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const updateLocalProfile = (field: keyof UserProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限不足', '需要相册权限来选择头像');
      return false;
    }
    return true;
  };

  const pickImageFromLibrary = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限不足', '需要相机权限来拍摄头像');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0].uri);
    }
  };

  const processImage = async (uri: string) => {
    try {
      // 压缩和调整图片大小
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 300, height: 300 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      
      // 使用AvatarStorageService保存头像
      const currentUser = AuthService.getCurrentUser();
      if (currentUser) {
        const savedAvatarUri = await AvatarStorageService.saveAvatar(currentUser.id, manipulatedImage.uri);
        setProfile(prev => ({ ...prev, avatar: savedAvatarUri }));
      } else {
        setProfile(prev => ({ ...prev, avatar: manipulatedImage.uri }));
      }
    } catch (error) {
      console.error('处理图片失败:', error);
      Alert.alert('错误', '处理图片时出现错误');
    }
  };

  const showImagePicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['取消', '拍照', '从相册选择', '删除头像'],
          destructiveButtonIndex: 3,
          cancelButtonIndex: 0,
        },
        async (buttonIndex) => {
          switch (buttonIndex) {
            case 1:
              takePhoto();
              break;
            case 2:
              pickImageFromLibrary();
              break;
            case 3:
              const currentUser1 = AuthService.getCurrentUser();
              if (currentUser1) {
                await AvatarStorageService.deleteAvatar(currentUser1.id);
              }
              setProfile(prev => ({ ...prev, avatar: null }));
              break;
          }
        }
      );
    } else {
      Alert.alert(
        '选择头像',
        '请选择头像来源',
        [
          { text: '取消', style: 'cancel' },
          { text: '拍照', onPress: takePhoto },
          { text: '从相册选择', onPress: pickImageFromLibrary },
          ...(profile.avatar ? [{ text: '删除头像', onPress: async () => {
             const currentUser = AuthService.getCurrentUser();
             if (currentUser) {
               await AvatarStorageService.deleteAvatar(currentUser.id);
             }
             setProfile(prev => ({ ...prev, avatar: null }));
           }, style: 'destructive' as const }] : []),
        ]
      );
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {/* 头像编辑 */}
      <View style={styles.avatarSection}>
        <TouchableOpacity style={styles.avatarContainer} onPress={showImagePicker}>
          {profile.avatar ? (
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <MaterialIcons 
                name="person" 
                size={48} 
                color={theme.colors.onPrimary} 
              />
            </View>
          )}
          <View style={styles.editAvatarButton}>
            <MaterialIcons 
              name="camera-alt" 
              size={16} 
              color={theme.colors.onPrimary} 
            />
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarHint}>点击更换头像</Text>
      </View>

      {/* 基本信息表单 */}
      <View style={styles.formContainer}>
        {/* 用户名 */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>用户名</Text>
          <View style={[styles.inputWrapper, errors.name && styles.inputError]}>
            <MaterialIcons 
              name="person" 
              size={20} 
              color={theme.colors.onSurfaceVariant} 
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.textInput}
              placeholder="请输入用户名"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={profile.name}
              onChangeText={(text) => updateLocalProfile('name', text)}
              maxLength={20}
            />
          </View>
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        {/* 邮箱 */}
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
              value={profile.email}
              onChangeText={(text) => updateLocalProfile('email', text)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        </View>

        {/* 手机号 */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>手机号码（可选）</Text>
          <View style={[styles.inputWrapper, errors.phone && styles.inputError]}>
            <MaterialIcons 
              name="phone" 
              size={20} 
              color={theme.colors.onSurfaceVariant} 
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.textInput}
              placeholder="请输入手机号码"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={profile.phone}
              onChangeText={(text) => updateLocalProfile('phone', text)}
              keyboardType="phone-pad"
              maxLength={11}
            />
          </View>
          {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
        </View>

        {/* 所在地 */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>所在地（可选）</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons 
              name="location-on" 
              size={20} 
              color={theme.colors.onSurfaceVariant} 
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.textInput}
              placeholder="请输入所在地"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={profile.location}
              onChangeText={(text) => updateLocalProfile('location', text)}
              maxLength={50}
            />
          </View>
        </View>

        {/* 个人简介 */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>个人简介（可选）</Text>
          <View style={[styles.inputWrapper, styles.bioWrapper, errors.bio && styles.inputError]}>
            <TextInput
              style={[styles.textInput, styles.bioInput]}
              placeholder="介绍一下自己吧..."
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={profile.bio}
              onChangeText={(text) => updateLocalProfile('bio', text)}
              multiline
              numberOfLines={4}
              maxLength={200}
              textAlignVertical="top"
            />
          </View>
          <View style={styles.bioFooter}>
            {errors.bio && <Text style={styles.errorText}>{errors.bio}</Text>}
            <Text style={styles.characterCount}>{profile.bio.length}/200</Text>
          </View>
        </View>
      </View>

      {/* 保存按钮 */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.saveButton, isLoading && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={isLoading}
        >
          <Text style={styles.saveButtonText}>
            {isLoading ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: theme.colors.surfaceContainer,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.surface,
  },
  avatarHint: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
  },
  formContainer: {
    padding: 20,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bioWrapper: {
    alignItems: 'flex-start',
    minHeight: 100,
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
  bioInput: {
    minHeight: 80,
  },
  bioFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    color: theme.colors.error,
    flex: 1,
  },
  characterCount: {
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    color: theme.colors.onSurfaceVariant,
  },
  buttonContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    fontWeight: '600',
    color: theme.colors.onPrimary,
  },
});

export default EditProfileScreen;
