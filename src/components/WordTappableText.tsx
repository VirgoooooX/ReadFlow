import React, { useMemo, useRef, memo } from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';

/**
 * 可点击的文本组件 - 支持单词点击和双击选句
 */
interface WordTappableTextProps {
  text: string;
  style?: TextStyle;
  onWordPress: (word: string, sentence: string) => void;
  onSentenceDoubleTap: (sentence: string) => void;
  enableTapping?: boolean; // 是否启用取词功能
  highlightedWords?: Set<string>; // 需要高亮的单词设置
}

const WordTappableText: React.FC<WordTappableTextProps> = memo(({
  text,
  style,
  onWordPress,
  onSentenceDoubleTap,
  enableTapping = true, // 默认启用
  highlightedWords = new Set(), // 高亮字段
}) => {
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastWordRef = useRef('');

  /**
   * 判断是否为有效单词
   */
  const isWord = (str: string): boolean => {
    return /^[a-zA-Z]+$/.test(str);
  };

  /**
   * 提取包含单词的句子
   * 优化了小数点、缩写等特殊情况的识别
   */
  const extractSentence = (fullText: string, word: string): string => {
    // 优化的句子分隔正则：
    // 1. 不在数字之间的点 (避免 "26.2" 被分割)
    // 2. 不在缩写之间的点 (避免 "U.S." 被分割)
    // 3. 句子结束符（. ! ?）后跟空格或结束
    const sentencePattern = /(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])$/g;
    
    // 先尝试用优化后的正则分割
    let sentences = fullText.split(sentencePattern).filter(s => s && s.trim().length > 0);
    
    // 如果优化后的分割失败（可能是整段都是小写），使用备用方案
    if (sentences.length === 0) {
      // 备用方案：仅在非数字后的句子结束符分割
      sentences = fullText.split(/(?<![0-9])[.!?]+(?=\s|$)/).filter(s => s && s.trim().length > 0);
    }
    
    // 查找包含目标单词的句子
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(word.toLowerCase())) {
        return sentence.trim();
      }
    }
    
    // 如果找不到，返回第一句或前100个字符
    return sentences[0]?.trim() || fullText.substring(0, 100);
  };

  /**
   * 处理单词点击
   */
  const handleWordPress = (word: string) => {
    const cleanWord = word.replace(/[^\w]/g, '');
    
    if (!isWord(cleanWord)) {
      return;
    }

    // 如果点击了不同的单词，重置计数
    if (lastWordRef.current !== cleanWord) {
      tapCountRef.current = 0;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
      }
    }

    lastWordRef.current = cleanWord;
    tapCountRef.current += 1;

    // 清除之前的定时器
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    // 如果是第二次点击，立即触发双击
    if (tapCountRef.current === 2) {
      const sentence = extractSentence(text, cleanWord);
      onSentenceDoubleTap(sentence);
      tapCountRef.current = 0;
      lastWordRef.current = '';
      return;
    }

    // 设置定时器，300ms后如果没有第二次点击，则触发单击
    tapTimerRef.current = setTimeout(() => {
      if (tapCountRef.current === 1) {
        const sentence = extractSentence(text, cleanWord);
        onWordPress(cleanWord, sentence);
      }
      tapCountRef.current = 0;
      lastWordRef.current = '';
    }, 300);
  };

  /**
   * 将文本分割成单词和空白符 - 使用useMemo缓存
   */
  const tokens = useMemo(() => {
    // 匹配单词和非单词字符
    return text.split(/(\s+|[^\w\s]+)/g).filter(token => token.length > 0);
  }, [text]);

  // 如果未启用取词，直接返回纯文本（最快）
  if (!enableTapping) {
    return <Text style={style}>{text}</Text>;
  }

  // 缓存渲染结果
  const renderedContent = useMemo(() => {
    return tokens.map((token, index) => {
      const cleanToken = token.replace(/[^\w]/g, '');
      const isClickable = isWord(cleanToken);
      const isHighlighted = isClickable && highlightedWords.has(cleanToken.toLowerCase());
      
      return (
        <Text
          key={index}
          onPress={isClickable ? () => handleWordPress(token) : undefined}
          style={isHighlighted ? styles.highlightedWord : undefined}
        >
          {token}
        </Text>
      );
    });
  }, [tokens, highlightedWords]);

  return (
    <Text style={style}>
      {renderedContent}
    </Text>
  );
});

const styles = StyleSheet.create({
  highlightedWord: {
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    paddingHorizontal: 2,
    borderRadius: 3,
  },
});

export default WordTappableText;
