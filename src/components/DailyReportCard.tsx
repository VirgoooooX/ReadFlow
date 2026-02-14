import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useThemeContext } from '../theme';
import { dailyReportApiService, DailyReportSummary } from '../services/DailyReportApiService';

interface DailyReportCardProps {
    onPress: (reportId: number) => void;
}

const DailyReportCard: React.FC<DailyReportCardProps> = ({ onPress }) => {
    const { theme } = useThemeContext();
    const [report, setReport] = useState<DailyReportSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissed] = useState(false);

    // 每次回到首页时重新获取最新日报
    useFocusEffect(
        useCallback(() => {
            let cancelled = false;

            const fetchLatestReport = async () => {
                try {
                    console.log('[DailyReportCard] Fetching latest report...');
                    const latest = await dailyReportApiService.getLatestReport();
                    if (!cancelled) {
                        console.log('[DailyReportCard] Got report:', latest ? `#${latest.id} "${latest.title}"` : 'null');
                        setReport(latest);
                        // 有新日报时重置 dismissed 状态
                        if (latest) {
                            setDismissed(false);
                        }
                    }
                } catch (error) {
                    console.warn('[DailyReportCard] Failed to fetch latest report:', error);
                } finally {
                    if (!cancelled) {
                        setLoading(false);
                    }
                }
            };

            fetchLatestReport();

            return () => {
                cancelled = true;
            };
        }, [])
    );

    // 没有日报数据 或 被关闭 → 不渲染
    if (loading || !report || dismissed) {
        return null;
    }

    const previewLines = report.content
        .replace(/^#+\s.*/gm, '')
        .replace(/\n{2,}/g, '\n')
        .trim()
        .split('\n')
        .filter(line => line.trim().length > 0)
        .slice(0, 2)
        .join('\n');

    const timeStr = new Date(report.generatedAt).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <TouchableOpacity
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.primary + '30',
                    shadowColor: theme.colors.primary,
                },
            ]}
            activeOpacity={0.7}
            onPress={() => onPress(report.id)}
        >
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <MaterialIcons name="auto-awesome" size={20} color={theme.colors.primary} />
                    <Text style={[styles.title, { color: theme.colors.onSurface }]} numberOfLines={1}>
                        {report.title}
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={(e) => {
                        e.stopPropagation();
                        setDismissed(true);
                    }}
                >
                    <MaterialIcons name="close" size={16} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
            </View>

            <Text style={[styles.preview, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
                {previewLines || '查看今日新闻摘要...'}
            </Text>

            <View style={styles.footer}>
                <View style={styles.footerLeft}>
                    <MaterialIcons name="schedule" size={14} color={theme.colors.onSurfaceVariant} />
                    <Text style={[styles.footerText, { color: theme.colors.onSurfaceVariant }]}>
                        {timeStr}
                    </Text>
                </View>
                <Text style={[styles.articleCount, { color: theme.colors.primary }]}>
                    {report.articleCount} 篇文章
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 8,
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        flex: 1,
        lineHeight: 22,
        includeFontPadding: false,
    },
    closeButton: {
        padding: 4,
        marginLeft: 8,
    },
    preview: {
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 10,
        includeFontPadding: false,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    footerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    footerText: {
        fontSize: 12,
        lineHeight: 18,
        includeFontPadding: false,
    },
    articleCount: {
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 18,
        includeFontPadding: false,
    },
});

export default DailyReportCard;
