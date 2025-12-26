import React, { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { FlatList, Dimensions, ViewToken } from 'react-native';
import Animated, { useAnimatedScrollHandler, SharedValue } from 'react-native-reanimated';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

interface Tab {
    key: string;
    title: string;
}

interface CustomTabContentProps {
    tabs: Tab[];
    renderScene: (info: { route: Tab; index: number }) => React.ReactElement | null;
    scrollX: SharedValue<number>;
    onIndexChange: (index: number) => void;
    initialIndex?: number;
}

export interface CustomTabContentHandle {
    scrollToIndex: (index: number) => void;
}

const CustomTabContent = forwardRef<CustomTabContentHandle, CustomTabContentProps>(({
    tabs,
    renderScene,
    scrollX,
    onIndexChange,
    initialIndex = 0,
}, ref) => {
    const flatListRef = useRef<FlatList>(null);
    const screenWidth = Dimensions.get('window').width;

    useImperativeHandle(ref, () => ({
        scrollToIndex: (index: number) => {
            flatListRef.current?.scrollToIndex({ index, animated: false });
        },
    }));

    // 【优化3】滑动结束才触发 React 状态更新，释放 JS 线程
    // 但保留 onScroll 用于驱动动画（Reanimated 的 useAnimatedScrollHandler）
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollX.value = event.contentOffset.x;
        },
    });

    const onMomentumScrollEnd = useCallback((e: any) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
      onIndexChange(index);
    }, [onIndexChange, screenWidth]);

    // 渲染每一页
    const renderItem = useCallback(
        (info: any) => {
            const item = info.item as Tab;
            const index = info.index as number;
            return renderScene({ route: item, index });
        },
        [renderScene]
    );

    return (
        <AnimatedFlatList
            ref={flatListRef}
            data={tabs}
            renderItem={renderItem}
            keyExtractor={(item: any) => item.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onMomentumScrollEnd={onMomentumScrollEnd}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({
                length: screenWidth,
                offset: screenWidth * index,
                index,
            })}
            removeClippedSubviews={true}
            bounces={false}
            // 【关键优化4】性能参数调优
            // windowSize=11: 当前1页 + 左5页 + 右5页 => 保证左右滑回时页面还在，不丢失滚动位置
            windowSize={11}
            initialNumToRender={1}      // 初始只渲染当前页面
            maxToRenderPerBatch={1}     // 每批只渲染1页，避免一次性大量渲染
            legacyImplementation={false}
        />
    );
});

CustomTabContent.displayName = 'CustomTabContent';

export default CustomTabContent;
