import React, { useCallback, useRef } from 'react';
import { StyleSheet, View, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Animated, {
    useAnimatedStyle,
    SharedValue,
    useAnimatedReaction,
    useAnimatedRef,
    scrollTo,
    interpolateColor,
    useSharedValue,
    runOnUI,
} from 'react-native-reanimated';
import { useThemeContext } from '../theme';

interface Tab {
    key: string;
    title: string;
    unreadCount?: number;
}

interface CustomTabBarProps {
    tabs: Tab[];
    scrollX: SharedValue<number>;
    screenWidth: number;
    activeIndex: number;
    onTabPress: (index: number) => void;
}

// 布局测量数据类型
interface TabMeasurement {
    x: number;
    width: number;
}

// 提取 TabItem 组件以利用 React.memo 减少重渲染
const TabItem = React.memo(({
    item,
    index,
    onPress,
    onLayout,
    scrollX,
    screenWidth,
    inactiveColor,
    activeColor,
    errorColor
}: {
    item: Tab;
    index: number;
    onPress: () => void;
    onLayout: (e: LayoutChangeEvent) => void;
    scrollX: SharedValue<number>;
    screenWidth: number;
    inactiveColor: string;
    activeColor: string;
    errorColor: string;
}) => {
    // 文字颜色动画样式 - O(1) 复杂度优化
    // 只关注当前 index 附近的区间，使用相邻插值法
    const textAnimatedStyle = useAnimatedStyle(() => {
        const currentProgress = scrollX.value / screenWidth;

        return {
            color: interpolateColor(
                currentProgress,
                [index - 1, index, index + 1],
                [inactiveColor, activeColor, inactiveColor]
            )
        };
    });

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
            {/* 未读小红点 */}
            {item.unreadCount && item.unreadCount > 0 ? (
                <View
                    style={[
                        styles.unreadBadge,
                        { backgroundColor: errorColor }
                    ]}
                />
            ) : null}
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
    const { theme } = useThemeContext();
    const scrollViewRef = useAnimatedRef<Animated.ScrollView>();

    // 🚀 核心优化：将布局数据存入 SharedValue，避免 worklet 跨桥
    const tabMeasurements = useSharedValue<TabMeasurement[]>(
        tabs.map(() => ({ x: 0, width: 0 }))
    );
    const isLayoutReady = useSharedValue(false);
    const containerWidthShared = useSharedValue(0);

    // 使用 useRef 暂存 JS 端的测量数据，避免频繁 setSharedValue
    const layoutCache = useRef<TabMeasurement[]>(tabs.map(() => ({ x: 0, width: 0 })));
    const layoutCount = useRef(0);

    const inactiveColor = theme.colors.onSurfaceVariant;
    const activeColor = theme.colors.onPrimary;
    const pillBackgroundColor = theme.colors.primary;

    // 处理标签布局测量 - 收集完毕后一次性写入 SharedValue
    const handleTabLayout = useCallback((index: number, event: LayoutChangeEvent) => {
        const { x, width } = event.nativeEvent.layout;

        // 检查是否真的变化了
        const cached = layoutCache.current[index];
        if (cached && Math.abs(cached.x - x) < 0.5 && Math.abs(cached.width - width) < 0.5) {
            return;
        }

        // 更新 JS 缓存
        layoutCache.current[index] = { x, width };
        layoutCount.current += 1;

        // 检查是否所有 Tab 都测量完毕
        if (layoutCount.current >= tabs.length) {
            // 一次性写入 SharedValue (跨桥只发生这一次)
            tabMeasurements.value = [...layoutCache.current];
            isLayoutReady.value = true;
        }
    }, [tabs.length, tabMeasurements, isLayoutReady]);

    // 处理容器布局测量
    const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
        containerWidthShared.value = event.nativeEvent.layout.width;
    }, [containerWidthShared]);

    // 🚀 胶囊动画样式 - 纯 UI 线程计算，无跨桥！
    const pillAnimatedStyle = useAnimatedStyle(() => {
        if (!isLayoutReady.value) return { opacity: 0 };

        // 获取当前进度 (0 -> 1 -> 2.5 ...)
        const index = scrollX.value / screenWidth;

        // 核心优化：手动插值 (只取相邻的两个 measurement)
        const floorIndex = Math.floor(index);
        const progress = index - floorIndex;

        // 安全获取 measurements (防止数组越界)
        const measurements = tabMeasurements.value;
        const currentM = measurements[floorIndex] || { x: 0, width: 0 };
        const nextM = measurements[floorIndex + 1] || currentM;

        // 线性插值计算 x 和 width
        const x = currentM.x + (nextM.x - currentM.x) * progress;
        const width = currentM.width + (nextM.width - currentM.width) * progress;

        return {
            transform: [{ translateX: x }],
            width: width,
            opacity: 1,
        };
    });

    // 🚀 使用 useAnimatedReaction 实时同步标签条滚动（纯 UI 线程）
    useAnimatedReaction(
        () => scrollX.value / screenWidth,
        (index) => {
            if (!isLayoutReady.value) return;
            if (containerWidthShared.value === 0) return;

            const measurements = tabMeasurements.value;
            const floorIndex = Math.floor(index);
            const progress = index - floorIndex;

            const currentM = measurements[floorIndex];
            const nextM = measurements[floorIndex + 1] || currentM;

            if (!currentM) return;

            // 计算胶囊当前的中心点 X 坐标
            const currentCenterX = currentM.x + currentM.width / 2;
            const nextCenterX = nextM.x + nextM.width / 2;

            // 插值得到实时的中心点
            const indicatorCenterX = currentCenterX + (nextCenterX - currentCenterX) * progress;

            // 目标：让胶囊居中 -> ScrollView 偏移量 = 胶囊中心 - 容器一半
            const targetScrollX = Math.max(0, indicatorCenterX - containerWidthShared.value / 2);

            // 调用 scrollTo (纯 UI 线程调用，性能极高)
            scrollTo(scrollViewRef, targetScrollX, 0, false);
        }
    );
    return (
        <View
            style={[
                styles.container,
                { backgroundColor: theme.colors.background, shadowColor: theme.colors.shadow }
            ]}
            onLayout={handleContainerLayout}
        >
            <Animated.ScrollView
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
                        onPress={() => onTabPress(index)}
                        onLayout={(e) => handleTabLayout(index, e)}
                        scrollX={scrollX}
                        screenWidth={screenWidth}
                        inactiveColor={inactiveColor}
                        activeColor={activeColor}
                        errorColor={theme.colors.error}
                    />
                ))}
            </Animated.ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%', // 确保占满全宽
        height: 40, // 减小高度 (48 -> 40)
        // 添加阴影
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
    unreadBadge: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 6,
        height: 6,
        borderRadius: 3,
        zIndex: 2,
    },
});

export default CustomTabBar;
