import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsService } from '../services/SettingsService';
import { ReadingSettings } from '../types';
import { getPlatformFont } from '../theme/typography';

interface ReadingSettingsContextType {
    settings: ReadingSettings | null;
    loading: boolean;
    error: string | null;
    loadSettings: () => Promise<void>;
    updateSetting: <K extends keyof ReadingSettings>(key: K, value: ReadingSettings[K]) => Promise<void>;
    updateSettings: (newSettings: Partial<ReadingSettings>) => Promise<void>;
    resetSettings: () => Promise<void>;
    getTextStyles: () => any;
    getTitleStyles: (sizeMultiplier?: number) => any;
    getSubtitleStyles: (sizeMultiplier?: number) => any;
    getContainerStyles: () => any;
}

const ReadingSettingsContext = createContext<ReadingSettingsContextType | null>(null);

export const ReadingSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<ReadingSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadSettings = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const updateSetting = useCallback(async <K extends keyof ReadingSettings>(
        key: K,
        value: ReadingSettings[K]
    ) => {
        try {
            await settingsService.updateReadingSetting(key, value);
            setSettings(prev => prev ? { ...prev, [key]: value } : null);
        } catch (err) {
            console.error(`Failed to update ${key}:`, err);
            throw err;
        }
    }, []);

    const updateSettings = useCallback(async (newSettings: Partial<ReadingSettings>) => {
        try {
            const currentSettings = settings || await settingsService.getReadingSettings();
            const updatedSettings = { ...currentSettings, ...newSettings };
            await settingsService.saveReadingSettings(updatedSettings);
            setSettings(updatedSettings);
        } catch (err) {
            console.error('Failed to update settings:', err);
            throw err;
        }
    }, [settings]);

    const resetSettings = useCallback(async () => {
        try {
            await settingsService.resetReadingSettings();
            await loadSettings();
        } catch (err) {
            console.error('Failed to reset settings:', err);
            throw err;
        }
    }, [loadSettings]);

    const getTextStyles = useCallback(() => {
        if (!settings) return {};
        const fontFamily = settings.fontFamily === 'system' ? undefined : getPlatformFont(settings.fontFamily);
        return {
            fontSize: settings.fontSize,
            lineHeight: settings.fontSize * settings.lineHeight,
            fontFamily,
            color: settings.textColor,
        };
    }, [settings]);

    const getTitleStyles = useCallback((sizeMultiplier: number = 1.75) => {
        if (!settings) return {};
        const fontFamily = settings.fontFamily === 'system' ? undefined : getPlatformFont(settings.fontFamily);
        return {
            fontSize: settings.fontSize * sizeMultiplier,
            lineHeight: settings.fontSize * sizeMultiplier * settings.lineHeight,
            fontFamily,
            color: settings.textColor,
        };
    }, [settings]);

    const getSubtitleStyles = useCallback((sizeMultiplier: number = 1.25) => {
        if (!settings) return {};
        const fontFamily = settings.fontFamily === 'system' ? undefined : getPlatformFont(settings.fontFamily);
        return {
            fontSize: settings.fontSize * sizeMultiplier,
            lineHeight: settings.fontSize * sizeMultiplier * settings.lineHeight,
            fontFamily,
            color: settings.textColor,
            opacity: 0.8,
        };
    }, [settings]);

    const getContainerStyles = useCallback(() => {
        if (!settings) return {};
        return {
            backgroundColor: settings.backgroundColor,
            paddingHorizontal: settings.margin,
        };
    }, [settings]);

    const value = {
        settings,
        loading,
        error,
        loadSettings,
        updateSetting,
        updateSettings,
        resetSettings,
        getTextStyles,
        getTitleStyles,
        getSubtitleStyles,
        getContainerStyles,
    };

    return (
        <ReadingSettingsContext.Provider value={value}>
            {children}
        </ReadingSettingsContext.Provider>
    );
};

export const useReadingSettings = () => {
    const context = useContext(ReadingSettingsContext);
    if (!context) {
        throw new Error('useReadingSettings must be used within a ReadingSettingsProvider');
    }
    return context;
};
