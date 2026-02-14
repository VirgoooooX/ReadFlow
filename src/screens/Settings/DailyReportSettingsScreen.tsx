import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Switch,
    Alert,
    ActivityIndicator,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { SettingsService } from '../../services/SettingsService';
import { RSSGroupService } from '../../services/RSSGroupService';
import { dailyReportApiService } from '../../services/DailyReportApiService';

const INTERVAL_OPTIONS = [
    { label: '手动', value: 0 },
    { label: '6小时', value: 6 },
    { label: '12小时', value: 12 },
    { label: '24小时', value: 24 },
];

const DailyReportSettingsScreen: React.FC = () => {
    const { theme } = useThemeContext();
    const navigation = useNavigation();
    const settingsService = SettingsService.getInstance();

    const [enabled, setEnabled] = useState(true);
    const [intervalHours, setIntervalHours] = useState(12);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [articleLimit, setArticleLimit] = useState(0);
    const [articleLimitText, setArticleLimitText] = useState('0');
    const [allGroups, setAllGroups] = useState<{ id: number; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    const loadSettings = useCallback(async () => {
        try {
            const [drSettings, groups] = await Promise.all([
                settingsService.getDailyReportSettings(),
                RSSGroupService.getInstance().getAllGroups(),
            ]);
            setEnabled(drSettings.enabled);
            setIntervalHours(drSettings.intervalHours);
            setSelectedGroups(drSettings.groupNames);
            setArticleLimit(drSettings.articleLimit || 0); // Default to 0 if undefined
            setArticleLimitText((drSettings.articleLimit || 0).toString());
            setAllGroups(groups.map((g: any) => ({ id: g.id, name: g.name })));
        } catch (error) {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [settingsService]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        navigation.setOptions({ title: 'AI 日报设置' });
    }, [navigation]);

    const saveSettings = async (updates: any) => {
        const merged = { enabled, intervalHours, groupNames: selectedGroups, articleLimit, ...updates };
        await settingsService.saveDailyReportSettings(merged);
    };

    const handleToggle = async (value: boolean) => {
        setEnabled(value);
        await saveSettings({ enabled: value });
    };

    const handleIntervalChange = async (hours: number) => {
        setIntervalHours(hours);
        await saveSettings({ intervalHours: hours });
    };

    const handleGroupToggle = async (groupName: string) => {
        let next: string[];
        if (selectedGroups.includes(groupName)) {
            next = selectedGroups.filter(g => g !== groupName);
        } else {
            next = [...selectedGroups, groupName];
        }
        setSelectedGroups(next);
        await saveSettings({ groupNames: next });
    };

    const handleArticleLimitChange = (text: string) => {
        setArticleLimitText(text);
        if (text === '') return;
        const val = parseInt(text);
        if (!isNaN(val) && val >= 0) {
            setArticleLimit(val);
        }
    };

    const handleArticleLimitBlur = () => {
        let val = parseInt(articleLimitText);
        if (isNaN(val) || val < 0) {
            val = articleLimit; // revert to last valid
            setArticleLimitText(val.toString());
        } else {
            setArticleLimit(val);
            saveSettings({ articleLimit: val }); // Save on blur to ensure validity
        }
    };

    const handleManualGenerate = async () => {
        try {
            setGenerating(true);
            const result = await dailyReportApiService.generateReport();
            if (result) {
                Alert.alert('生成成功', `日报 "${result.title}" 已生成`);
            }
        } catch (error: any) {
            Alert.alert('生成失败', error?.message || '请检查 LLM 设置和网络连接');
        } finally {
            setGenerating(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: theme.colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.contentContainer}
                keyboardShouldPersistTaps="handled"
            >
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <View style={styles.row}>
                        <View style={styles.rowLeft}>
                            <MaterialIcons name="auto-awesome" size={22} color={theme.colors.primary} />
                            <Text style={[styles.rowLabel, { color: theme.colors.onSurface }]}>启用 AI 日报</Text>
                        </View>
                        <Switch
                            value={enabled}
                            onValueChange={handleToggle}
                            trackColor={{ false: '#ccc', true: theme.colors.primary + '80' }}
                            thumbColor={enabled ? theme.colors.primary : '#f4f4f4'}
                        />
                    </View>
                </View>

                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>生成间隔</Text>
                    <View style={styles.intervalGrid}>
                        {INTERVAL_OPTIONS.map(opt => (
                            <TouchableOpacity
                                key={opt.value}
                                style={[
                                    styles.intervalChip,
                                    {
                                        backgroundColor:
                                            intervalHours === opt.value ? theme.colors.primary + '20' : theme.colors.background,
                                        borderColor: intervalHours === opt.value ? theme.colors.primary : theme.colors.outline,
                                    },
                                ]}
                                onPress={() => handleIntervalChange(opt.value)}
                            >
                                <Text
                                    style={[
                                        styles.intervalChipText,
                                        { color: intervalHours === opt.value ? theme.colors.primary : theme.colors.onSurface },
                                    ]}
                                >
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>最大文章数限制</Text>
                    <Text style={[styles.sectionSubtitle, { color: theme.colors.onSurfaceVariant }]}>
                        限制参与日报生成的文章数量（0 表示不限制，默认不限）
                    </Text>
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={[
                                styles.textInput,
                                {
                                    color: theme.colors.onSurface,
                                    backgroundColor: theme.colors.surfaceVariant,
                                    borderColor: theme.colors.outline
                                }
                            ]}
                            value={articleLimitText}
                            onChangeText={handleArticleLimitChange}
                            onBlur={handleArticleLimitBlur}
                            placeholder="0"
                            placeholderTextColor={theme.colors.onSurfaceVariant}
                            keyboardType="numeric"
                        />
                    </View>
                </View>

                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>数据源分组</Text>
                    <Text style={[styles.sectionSubtitle, { color: theme.colors.onSurfaceVariant }]}>
                        选择哪些分组的文章纳入日报（不选则使用默认新闻分组）
                    </Text>
                    {allGroups.length === 0 ? (
                        <Text style={[styles.emptyGroups, { color: theme.colors.onSurfaceVariant }]}>
                            暂无分组，请先创建 RSS 分组
                        </Text>
                    ) : (
                        allGroups.map(group => (
                            <TouchableOpacity
                                key={group.id}
                                style={styles.groupRow}
                                onPress={() => handleGroupToggle(group.name)}
                            >
                                <MaterialIcons
                                    name={selectedGroups.includes(group.name) ? 'check-box' : 'check-box-outline-blank'}
                                    size={22}
                                    color={
                                        selectedGroups.includes(group.name)
                                            ? theme.colors.primary
                                            : theme.colors.onSurfaceVariant
                                    }
                                />
                                <Text style={[styles.groupName, { color: theme.colors.onSurface }]}>{group.name}</Text>
                            </TouchableOpacity>
                        ))
                    )}
                </View>

                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <TouchableOpacity
                        style={[styles.generateButton, { backgroundColor: theme.colors.primary }]}
                        onPress={handleManualGenerate}
                        disabled={generating}
                    >
                        {generating ? (
                            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                        ) : (
                            <>
                                <MaterialIcons name="play-arrow" size={20} color={theme.colors.onPrimary} />
                                <Text style={[styles.generateButtonText, { color: theme.colors.onPrimary }]}>手动生成日报</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    contentContainer: { paddingVertical: 16 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: {
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 12,
        padding: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    rowLabel: { fontSize: 15, fontWeight: '500', lineHeight: 22, includeFontPadding: false },
    sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4, lineHeight: 22, includeFontPadding: false },
    sectionSubtitle: { fontSize: 12, marginBottom: 12, lineHeight: 18, includeFontPadding: false },
    intervalGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    intervalChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    intervalChipText: { fontSize: 14, fontWeight: '500', lineHeight: 20, includeFontPadding: false },
    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
    },
    groupName: { fontSize: 14, lineHeight: 20, includeFontPadding: false },
    emptyGroups: { fontSize: 13, paddingVertical: 8, lineHeight: 20, includeFontPadding: false },
    generateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 10,
    },
    generateButtonText: {
        fontSize: 15,
        fontWeight: '600',
        lineHeight: 22,
        includeFontPadding: false,
    },
    inputContainer: {
        marginTop: 4,
    },
    textInput: {
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        lineHeight: 20,
        includeFontPadding: false,
        borderWidth: 1,
    },
});

export default DailyReportSettingsScreen;
