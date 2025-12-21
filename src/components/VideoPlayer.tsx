import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  Dimensions, 
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useThemeContext } from '../theme';

interface VideoPlayerProps {
  src: string;
  maxWidth?: number;
  /** 是否在可视范围内，用于外部控制播放/暂停 */
  isVisible?: boolean;
  /** 视频原始宽高比（可选） */
  aspectRatio?: number;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  src, 
  maxWidth,
  isVisible = true,
  aspectRatio: initialAspectRatio,
}) => {
  const { theme } = useThemeContext();
  const { width: windowWidth } = useWindowDimensions();
  const videoRef = useRef<Video>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio || 16 / 9);
  
  // 计算实际宽度：使用传入的 maxWidth 或者窗口宽度减去边距
  const containerWidth = maxWidth || (windowWidth - 32);
  
  // 根据宽高比计算高度，限制最大高度不超过屏幕 60%
  const maxHeight = Dimensions.get('window').height * 0.6;
  let videoHeight = containerWidth / aspectRatio;
  let videoWidth = containerWidth;
  
  // 如果计算出的高度超过最大高度，则以高度为基准重新计算宽度
  if (videoHeight > maxHeight) {
    videoHeight = maxHeight;
    videoWidth = videoHeight * aspectRatio;
  }

  // 监听可见性变化，自动暂停/播放
  useEffect(() => {
    if (!videoRef.current) return;
    
    if (!isVisible && isPlaying) {
      // 划出可视范围，暂停播放
      videoRef.current.pauseAsync().catch(() => {});
    }
    // 注意：不自动恢复播放，让用户手动控制
  }, [isVisible, isPlaying]);

  // 视频加载完成，获取实际宽高比
  const handleLoad = useCallback((status: AVPlaybackStatus) => {
    setIsLoading(false);
    
    if (status.isLoaded && 'uri' in status) {
      // expo-av 不直接提供视频尺寸，保持默认比例
      // 如果需要精确比例，可以从视频 metadata 获取
    }
  }, []);

  // 播放状态变化
  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
    }
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  if (hasError) {
    return null;
  }

  return (
    <View style={[styles.container, { width: videoWidth }]}>
      <Video
        ref={videoRef}
        source={{ uri: src }}
        style={[styles.video, { width: videoWidth, height: videoHeight }]}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
        shouldPlay={false}
        progressUpdateIntervalMillis={500}
        onLoad={handleLoad}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        onError={handleError}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme?.colors?.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
    backgroundColor: '#000',
  },
  video: {
    backgroundColor: '#000',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});

export default VideoPlayer;
