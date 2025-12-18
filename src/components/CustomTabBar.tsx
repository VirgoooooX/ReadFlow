import React, { useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, ScrollView, LayoutChangeEvent } from 'react-native';
import Animated, {
    useAnimatedStyle,
    interpolate,
    SharedValue,
    useAnimatedReaction,
    useAnimatedRef,
    scrollTo,
    interpolateColor,
} from 'react-native-reanimated';
import { useThemeContext } from '../theme';

interface Tab {
    key: string;
    title: string;
}

interface CustomTabBarProps {
    tabs: Tab[];
    scrollX: SharedValue<number>;
    screenWidth: number;
    activeIndex: number;
    onTabPress: (index: number) => void;
}

// 提取 TabItem 组件以利用 React.memo 减少重渲染
const TabItem = React.memo(({
    item,
    index,
    isFocused,
    onPress,
    onLayout,
    scrollX,
    screenWidth,
    activeColor,
    inactiveColor
}: {
    item: Tab;
    index: number;
    isFocused: boolean;
    onPress: () => void;
    onLayout: (e: LayoutChangeEvent) => void;
    scrollX: SharedValue<number>;
    screenWidth: number;
    activeColor: string;
    inactiveColor: string;
}) => {
    // 文字颜色动画样式 - O(1) 复杂度优化
    const textAnimatedStyle = useAnimatedStyle(() => {
        const currentProgress = scrollX.value / screenWidth;

        // 只关注当前 index 附近的区间，而不是遍历整个数组
        return {
            color: interpolateColor(
                currentProgress,
                [index - 1, index, index + 1],
                [inactiveColor, '#FFFFFF', inactiveColor] // 激活色固定为白色
            )
        };
    }, [index, screenWidth, inactiveColor]); // 移除不必要的依赖

    return (
        <TouchableOpacity
            style={styles.tabItem}
            onLayout={onLayout}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Animated.Text
                style={[
                    styles.tabLabel,
                    textAnimatedStyle,
                ]}
                numberOfLines={1}
            >
                {item.title}
            </Animated.Text>
        </TouchableOpacity>
    );
});

const CustomTabBar: React.FC<CustomTabBarProps> = ({
    tabs,
    scrollX,
    screenWidth,
    activeIndex,
    onTabPress,
}) => {
    const { theme, isDark } = useThemeContext();
    const scrollViewRef = useAnimatedRef<Animated.ScrollView>();

    // 存储每个标签的布局信息
    const [tabLayouts, setTabLayouts] = useState<Record<string, { x: number; width: number }>>({});
    const [containerWidth, setContainerWidth] = useState(0);

    const activeColor = theme.colors.primary; // 仅用于部分逻辑，文字激活色固定为白色
    const inactiveColor = isDark ? '#938F99' : '#64748B';
    const pillBackgroundColor = theme.colors.primary;

    // 检查布局是否准备好
    const isLayoutReady = tabs.every((tab) => tabLayouts[tab.key]) && containerWidth > 0;

    // 预计算插值数组，避免在 worklet 中每帧重复计算 (O(n) -> O(1) in worklet)
    const { inputRange, widths, positions } = React.useMemo(() => {
        const inputRange = tabs.map((_, i) => i);
        const widths = tabs.map((tab) => tabLayouts[tab.key]?.width || 0);
        const positions = tabs.map((tab) => tabLayouts[tab.key]?.x || 0);
        return { inputRange, widths, positions };
    }, [tabs, tabLayouts]);

    // 处理标签布局测量
    const handleTabLayout = useCallback((key: string, event: LayoutChangeEvent) => {
        const { x, width } = event.nativeEvent.layout;
        setTabLayouts((prev) => {
            // 只有当值真正改变时才更新，减少重渲染
            if (prev[key] && Math.abs(prev[key].x - x) < 0.5 && Math.abs(prev[key].width - width) < 0.5) return prev;
            return { ...prev, [key]: { x, width } };
        });
    }, []);

    // 处理容器布局测量
    const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
        setContainerWidth(event.nativeEvent.layout.width);
    }, []);

    // 胶囊动画样式
    const pillAnimatedStyle = useAnimatedStyle(() => {
        if (!isLayoutReady) return { opacity: 0 };

        const currentIndex = scrollX.value / screenWidth;

        // 使用预计算的数组
        const width = interpolate(
            currentIndex,
            inputRange,
            widths,
            'clamp'
        );

        const translateX = interpolate(
            currentIndex,
            inputRange,
            positions,
            'clamp'
        );

        return {
            width,
            transform: [{ translateX }],
            opacity: 1,
        };
    }, [isLayoutReady, inputRange, widths, positions, screenWidth]);

    // 创建 scrollTo 的 JS 函数
    const scrollToTab = useCallback((offset: number) => {
        scrollViewRef.current?.scrollTo({ x: offset, animated: false });
    }, []);

    // 使用 useAnimatedReaction 实时同步标签条滚动（完全在 UI 线程）
    useAnimatedReaction(
        () => {
            if (!isLayoutReady) return -1;
            return scrollX.value / screenWidth;
        },
        (currentProgress, previousProgress) => {
            if (currentProgress === -1) return;

            // 阈值检查避免微小抖动
            if (previousProgress !== null && Math.abs(currentProgress - previousProgress) < 0.001) {
                return;
            }

            const currentIndex = Math.floor(currentProgress);
            const nextIndex = Math.min(currentIndex + 1, tabs.length - 1);
            const interpolation = currentProgress - currentIndex;

            const currentTab = tabs[currentIndex];
            const nextTab = tabs[nextIndex];
            if (!currentTab) return;

            const currentLayout = tabLayouts[currentTab.key];
            if (!currentLayout || containerWidth === 0) return;

            const currentCenterOffset = currentLayout.x + currentLayout.width / 2 - containerWidth / 2;

            let targetOffset = currentCenterOffset;
            if (nextTab && currentIndex !== nextIndex) {
                const nextLayout = tabLayouts[nextTab.key];
                if (nextLayout) {
                    const nextCenterOffset = nextLayout.x + nextLayout.width / 2 - containerWidth / 2;
                    targetOffset = currentCenterOffset + (nextCenterOffset - currentCenterOffset) * interpolation;
                }
            }

            const finalOffset = Math.max(0, targetOffset);
            scrollTo(scrollViewRef, finalOffset, 0, false);
        }
    );
    return (
        <View
            style={[styles.container, { backgroundColor: theme.colors.background }]}
            onLayout={handleContainerLayout}
        >
            <ScrollView
                ref={scrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                decelerationRate="fast"
            >
                {/* 悬浮胶囊 */}
                <Animated.View
                    style={[
                        styles.floatingPill,
                        { backgroundColor: pillBackgroundColor },
                        pillAnimatedStyle,
                    ]}
                />

                {/* 标签按钮 */}
                {tabs.map((tab, index) => (
                    <TabItem
                        key={tab.key}
                        item={tab}
                        index={index}
                        isFocused={activeIndex === index}
                        onPress={() => onTabPress(index)}
                        onLayout={(e) => handleTabLayout(tab.key, e)}
                        scrollX={scrollX}
                        screenWidth={screenWidth}
                        activeColor={activeColor}
                        inactiveColor={inactiveColor}
                    />
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 40, // 减小高度 (48 -> 40)
        // 添加阴影
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1, // 减小阴影偏移
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
        zIndex: 10,
    },
    scrollContent: {
        paddingHorizontal: 12, // 对齐文章列表的 padding (12)
        alignItems: 'center',
        height: '100%',
    },
    floatingPill: {
        position: 'absolute',
        height: 26, // 微调胶囊高度 (28 -> 26)
        borderRadius: 13,
        zIndex: 0,
    },
    tabItem: {
        paddingHorizontal: 10, // 进一步减少内边距 (12 -> 10)
        paddingVertical: 4,
        marginHorizontal: 1, // 进一步减少间距 (2 -> 1)
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    tabLabel: {
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default CustomTabBar;
