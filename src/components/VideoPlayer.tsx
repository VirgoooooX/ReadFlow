import React, { useState } from 'react';
import { View, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useThemeContext } from '../theme';

const screenWidth = Dimensions.get('window').width;

interface VideoPlayerProps {
  src: string;
  maxWidth?: number;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, maxWidth = screenWidth - 32 }) => {
  const { theme } = useThemeContext();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return null; // 加载失败直接隐藏
  }

  return (
    <View style={[styles.container, { maxWidth }]}>
      <Video
        source={{ uri: src }}
        style={[styles.video, { width: maxWidth, height: maxWidth * 0.56 }]}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
        progressUpdateIntervalMillis={1000}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
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
