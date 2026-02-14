import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UserStackParamList } from '../../navigation/types';
import { dailyReportApiService, DailyReportSummary } from '../../services/DailyReportApiService';

type NavigationProp = NativeStackNavigationProp<UserStackParamList, 'DailyReportList'>;

const DailyReportListScreen: React.FC = () => {
    const { theme } = useThemeContext();
    const navigation = useNavigation<NavigationProp>();

    const [reports, setReports] = useState<DailyReportSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const fetchReports = useCallback(async (offset = 0, append = false) => {
        try {
            const data = await dailyReportApiService.getReports(10, offset);
            if (append) {
                setReports(prev => [...prev, ...data]);
            } else {
                setReports(data);
            }
            setHasMore(data.length >= 10);
        } catch (error) {
            // Error logged in service
        }
    }, []);

    useEffect(() => {
        fetchReports().finally(() => setLoading(false));
    }, [fetchReports]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchReports(0, false);
        setRefreshing(false);
    };

    const handleLoadMore = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        await fetchReports(reports.length, true);
        setLoadingMore(false);
    };

    const renderItem = ({ item }: { item: DailyReportSummary }) => {
        const time = new Date(item.generatedAt).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

        const preview = item.content
            .replace(/^#+\s.*/gm, '')
            .replace(/\n{2,}/g, '\n')
            .trim()
            .split('\n')
            .find(l => l.trim().length > 0) || '';

        return (
            <TouchableOpacity
                style={[styles.reportItem, { backgroundColor: theme.colors.surface }]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('DailyReportDetail', { reportId: item.id })}
            >
                <View style={styles.reportHeader}>
                    <MaterialIcons name="auto-awesome" size={18} color={theme.colors.primary} />
                    <Text style={[styles.reportTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                </View>
                <Text style={[styles.reportPreview, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
                    {preview}
                </Text>
                <View style={styles.reportFooter}>
                    <Text style={[styles.reportTime, { color: theme.colors.onSurfaceVariant }]}>{time}</Text>
                    <Text style={[styles.reportArticleCount, { color: theme.colors.primary }]}>
                        {item.articleCount} 篇文章
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <FlatList
                data={reports}
                keyExtractor={item => String(item.id)}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />
                }
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.3}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <MaterialIcons name="auto-awesome" size={48} color={theme.colors.onSurfaceVariant} />
                        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                            暂无日报
                        </Text>
                        <Text style={[styles.emptySubtext, { color: theme.colors.onSurfaceVariant }]}>
                            日报将根据你的设置自动生成
                        </Text>
                    </View>
                }
                ListFooterComponent={
                    loadingMore ? (
                        <ActivityIndicator style={styles.footer} size="small" color={theme.colors.primary} />
                    ) : null
                }
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContent: { paddingVertical: 8 },
    reportItem: {
        marginHorizontal: 16,
        marginVertical: 4,
        borderRadius: 12,
        padding: 14,
    },
    reportHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    reportTitle: { fontSize: 15, fontWeight: '600', flex: 1, lineHeight: 22, includeFontPadding: false },
    reportPreview: { fontSize: 13, lineHeight: 20, marginBottom: 8, includeFontPadding: false },
    reportFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    reportTime: { fontSize: 12, lineHeight: 18, includeFontPadding: false },
    reportArticleCount: { fontSize: 12, fontWeight: '500', lineHeight: 18, includeFontPadding: false },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 80,
        gap: 8,
    },
    emptyText: { fontSize: 16, fontWeight: '500', lineHeight: 24, includeFontPadding: false },
    emptySubtext: { fontSize: 13, lineHeight: 20, includeFontPadding: false },
    footer: { paddingVertical: 16 },
});

export default DailyReportListScreen;
