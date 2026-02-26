import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    RefreshControl,
    Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { typography } from '../../theme/typography';
import { cloudSyncService } from '../../services/rss/CloudSyncService';
import { rssService } from '../../services/rss';
import { useRSSSource } from '../../contexts/RSSSourceContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RSSStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RSSStackParamList, 'DiscoverRSS'>;

export default function DiscoverRSSScreen() {
    const { theme, isDark } = useThemeContext();
    const navigation = useNavigation<NavigationProp>();
    const { refreshRSSSources, rssSources } = useRSSSource();
    const [feeds, setFeeds] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [subscribingId, setSubscribingId] = useState<number | null>(null);

    useEffect(() => {
        fetchPublicFeeds();
    }, []);

    const fetchPublicFeeds = async () => {
        try {
            const data = await cloudSyncService.getPublicFeeds();
            setFeeds(data);
        } catch (error) {
            console.error('Failed to fetch public feeds:', error);
            Alert.alert('加载失败', '无法拉取公共订阅池数据');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchPublicFeeds();
    };

    const isSubscribed = (url: string) => {
        return rssSources.some(s => s.url === url);
    };

    const handleSubscribe = async (feed: any) => {
        if (isSubscribed(feed.url)) {
            Alert.alert('提示', '您已经订阅过此源');
            return;
        }

        setSubscribingId(feed.id);
        try {
            // 客户端发送 POST /api/rss/sources
            await rssService.addRSSSource(feed.url);
            Alert.alert('成功', '订阅成功！');
            await refreshRSSSources();
        } catch (error) {
            console.error('Failed to subscribe:', error);
            Alert.alert('订阅失败', '无法添加该订阅源，请稍后重试');
        } finally {
            setSubscribingId(null);
        }
    };

    const renderItem = ({ item }: { item: any }) => {
        const subscribed = isSubscribed(item.url);
        const isSubscribing = subscribingId === item.id;

        return (
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
                <View style={styles.cardMain}>
                    {item.icon_url ? (
                        <Image source={{ uri: item.icon_url }} style={styles.icon} />
                    ) : (
                        <View style={[styles.iconPlaceholder, { backgroundColor: theme.colors.primaryContainer }]}>
                            <MaterialIcons name="rss-feed" size={20} color={theme.colors.primary} />
                        </View>
                    )}
                    <View style={styles.cardTextContent}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.title, { color: theme.colors.onSurface }]} numberOfLines={1}>
                                {item.name}
                            </Text>
                            {item.category && (
                                <View style={[styles.badge, { backgroundColor: theme.colors.secondaryContainer }]}>
                                    <Text style={[styles.badgeText, { color: theme.colors.onSecondaryContainer }]}>
                                        {item.category}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {item.description ? (
                            <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
                                {item.description}
                            </Text>
                        ) : (
                            <Text style={[styles.description, { color: theme.colors.outline, fontStyle: 'italic' }]}>
                                暂无简介
                            </Text>
                        )}

                        <View style={styles.metaRow}>
                            <View style={styles.metaItem}>
                                <MaterialIcons name="article" size={12} color={theme.colors.outline} />
                                <Text style={[styles.metaText, { color: theme.colors.outline }]}>
                                    {item.articleCount || 0} 文章
                                </Text>
                            </View>
                            <View style={styles.metaItem}>
                                <MaterialIcons name="people" size={12} color={theme.colors.outline} />
                                <Text style={[styles.metaText, { color: theme.colors.outline }]}>
                                    {item.subscriberCount || 0} 订阅
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.actionContainer}>
                    <TouchableOpacity
                        style={[
                            styles.subscribeBtn,
                            {
                                backgroundColor: subscribed ? theme.colors.surfaceVariant : theme.colors.primary,
                                borderColor: subscribed ? theme.colors.outlineVariant : 'transparent',
                                borderWidth: subscribed ? 1 : 0
                            }
                        ]}
                        onPress={() => handleSubscribe(item)}
                        disabled={subscribed || isSubscribing}
                    >
                        {isSubscribing ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <View style={styles.btnContent}>
                                {!subscribed && <MaterialIcons name="add" size={16} color={theme.colors.onPrimary} style={{ marginRight: 4 }} />}
                                <Text style={[styles.subscribeBtnText, { color: subscribed ? theme.colors.onSurfaceVariant : theme.colors.onPrimary }]}>
                                    {subscribed ? '已订阅' : '订阅'}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    if (loading && !refreshing) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <FlatList
                data={feeds}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <MaterialIcons name="explore" size={64} color={theme.colors.outlineVariant} />
                        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                            公共订阅池暂无数据
                        </Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContainer: {
        padding: 12,
    },
    card: {
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    icon: {
        width: 56,
        height: 56,
        borderRadius: 12,
        marginRight: 12,
    },
    iconPlaceholder: {
        width: 56,
        height: 56,
        borderRadius: 12,
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardTextContent: {
        flex: 1,
        marginRight: 8,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    title: {
        ...typography.titleSmall,
        fontWeight: 'bold',
        flexShrink: 1,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        marginLeft: 8,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    description: {
        ...typography.bodySmall,
        lineHeight: 16,
        fontSize: 12,
        marginBottom: 6,
        includeFontPadding: false,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 12,
    },
    metaText: {
        fontSize: 11,
        marginLeft: 4,
        includeFontPadding: true,
        lineHeight: 14,
    },
    actionContainer: {
        marginLeft: 4,
    },
    subscribeBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        minWidth: 70,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    subscribeBtnText: {
        fontSize: 13,
        fontWeight: '700',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
    },
    emptyText: {
        ...typography.bodyLarge,
        marginTop: 16,
    },
});
