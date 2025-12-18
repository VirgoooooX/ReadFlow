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

    // 滚动处理
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollX.value = event.contentOffset.x;
        },
    });

    // 可见性变化回调
    const onViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            if (viewableItems.length > 0 && viewableItems[0].index !== null) {
                onIndexChange(viewableItems[0].index);
            }
        },
        [onIndexChange]
    );

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

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
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({
                length: screenWidth,
                offset: screenWidth * index,
                index,
            })}
            removeClippedSubviews={true}
            bounces={false}
            // 性能优化配置
            windowSize={5} // 减少渲染窗口，默认是 21
            initialNumToRender={1} // 初始只渲染一个页面
            maxToRenderPerBatch={1} // 每批只渲染一个
            legacyImplementation={false}
        />
    );
});

CustomTabContent.displayName = 'CustomTabContent';

export default CustomTabContent;
