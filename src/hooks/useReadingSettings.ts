import { useState, useEffect } from 'react';
import { settingsService } from '../services/SettingsService';
import { ReadingSettings } from '../types';
import { getPlatformFont } from '../theme/typography';

export const useReadingSettings = () => {
  const [settings, setSettings] = useState<ReadingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载阅读设置
  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const readingSettings = await settingsService.getReadingSettings();
      setSettings(readingSettings);
    } catch (err) {
      console.error('Failed to load reading settings:', err);
      setError('加载阅读设置失败');
    } finally {
      setLoading(false);
    }
  };

  // 更新单个设置
  const updateSetting = async <K extends keyof ReadingSettings>(
    key: K,
    value: ReadingSettings[K]
  ) => {
    try {
      await settingsService.updateReadingSetting(key, value);
      if (settings) {
        setSettings({ ...settings, [key]: value });
      }
    } catch (err) {
      console.error(`Failed to update ${key}:`, err);
      throw err;
    }
  };

  // 批量更新设置
  const updateSettings = async (newSettings: Partial<ReadingSettings>) => {
    try {
      const currentSettings = settings || await settingsService.getReadingSettings();
      const updatedSettings = { ...currentSettings, ...newSettings };
      await settingsService.saveReadingSettings(updatedSettings);
      setSettings(updatedSettings);
    } catch (err) {
      console.error('Failed to update settings:', err);
      throw err;
    }
  };

  // 重置设置
  const resetSettings = async () => {
    try {
      await settingsService.resetReadingSettings();
      await loadSettings();
    } catch (err) {
      console.error('Failed to reset settings:', err);
      throw err;
    }
  };

  // 获取应用于文本的样式
  const getTextStyles = () => {
    if (!settings) return {};

    const fontFamily = settings.fontFamily === 'system' 
      ? undefined 
      : getPlatformFont(settings.fontFamily);

    return {
      fontSize: settings.fontSize,
      lineHeight: settings.fontSize * settings.lineHeight,
      fontFamily,
      color: settings.textColor,
    };
  };

  // 获取标题样式
  const getTitleStyles = (sizeMultiplier: number = 1.75) => {
    if (!settings) return {};

    const fontFamily = settings.fontFamily === 'system' 
      ? undefined 
      : getPlatformFont(settings.fontFamily);

    return {
      fontSize: settings.fontSize * sizeMultiplier,
      lineHeight: settings.fontSize * sizeMultiplier * settings.lineHeight,
      fontFamily,
      color: settings.textColor,
    };
  };

  // 获取副标题样式
  const getSubtitleStyles = (sizeMultiplier: number = 1.25) => {
    if (!settings) return {};

    const fontFamily = settings.fontFamily === 'system' 
      ? undefined 
      : getPlatformFont(settings.fontFamily);

    return {
      fontSize: settings.fontSize * sizeMultiplier,
      lineHeight: settings.fontSize * sizeMultiplier * settings.lineHeight,
      fontFamily,
      color: settings.textColor,
      opacity: 0.8,
    };
  };

  // 获取容器样式
  const getContainerStyles = () => {
    if (!settings) return {};

    return {
      backgroundColor: settings.backgroundColor,
      paddingHorizontal: settings.margin,
    };
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return {
    settings,
    loading,
    error,
    updateSetting,
    updateSettings,
    resetSettings,
    loadSettings,
    getTextStyles,
    getTitleStyles,
    getSubtitleStyles,
    getContainerStyles,
  };
};