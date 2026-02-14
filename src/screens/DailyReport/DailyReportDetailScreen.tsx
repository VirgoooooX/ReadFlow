import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    StyleSheet,
    ActivityIndicator,
    Text,
    useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useNavigation, useRoute } from '@react-navigation/native';
import { dailyReportApiService, DailyReportDetail } from '../../services/DailyReportApiService';
import { WebView } from 'react-native-webview';
import { marked } from 'marked';

// ─── CSS Template ────────────────────────────────────────────────────────────

const getHtmlTemplate = (htmlContent: string, isDark: boolean, primaryColor: string) => {
    const colors = isDark
        ? {
            bg: '#0f0f0f',
            surface: '#1a1a2e',
            surfaceAlt: '#16213e',
            text: '#e8e8e8',
            textSecondary: '#a0a0b0',
            primary: primaryColor,
            primaryLight: primaryColor, // specific light variant not available, fallback to primary
            accent: '#ff6b6b',
            border: '#2a2a3e',
            divider: '#2a2a3e',
            codeBg: '#1e1e2e',
            summaryBg: '#1e2030', /* Slightly lighter/more visible block in dark mode */
            summaryBorder: `${primaryColor}40`,
            h2Accent: primaryColor,
            h3Accent: '#ff6b6b',
            olNumberColor: primaryColor,
            strongColor: primaryColor,
            emColor: '#a0a0b0',
            hrGradient: `linear-gradient(to right, transparent, ${primaryColor}40, transparent)`,
        }
        : {
            bg: '#fafafa',
            surface: '#ffffff',
            surfaceAlt: '#f5f7ff',
            text: '#1a1a2e',
            textSecondary: '#666680',
            primary: primaryColor,
            primaryLight: primaryColor,
            accent: '#e74c3c',
            border: '#e8e8f0',
            divider: '#e0e0e8',
            codeBg: '#f0f0f5',
            summaryBg: '#eef2ff', /* Slightly darker/more visible blue-ish grey in light mode */
            summaryBorder: `${primaryColor}40`,
            h2Accent: primaryColor,
            h3Accent: '#e74c3c',
            olNumberColor: primaryColor,
            strongColor: primaryColor,
            emColor: '#888899',
            hrGradient: `linear-gradient(to right, transparent, ${primaryColor}40, transparent)`,
        };

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700;900&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background-color: ${colors.bg};
            color: ${colors.text};
            line-height: 1.8;
            padding: 20px 16px 60px;
            font-size: 15px;
            -webkit-font-smoothing: antialiased;
            -webkit-text-size-adjust: 100%;
        }

        /* ─── H1 Title (Daily Insights) ─── */
        h1 {
            font-size: 28px;
            font-weight: 800;
            line-height: 1.25;
            margin: 0 0 24px 0;
            letter-spacing: -0.8px;
            color: ${colors.text};
            padding-bottom: 12px;
            position: relative;
            /* Gradient Underline Effect */
            background: linear-gradient(120deg, ${colors.primary} 0%, ${colors.primary}40 100%);
            background-size: 100% 4px;
            background-position: 0 100%;
            background-repeat: no-repeat;
        }

        /* ─── Lead Paragraph (Insight Text) ─── */
        h1 + p {
            font-size: 15px;
            line-height: 1.6;
            color: ${colors.text};
            margin-bottom: 20px;
            font-weight: 400;
        }

        /* Drop Cap for Lead Paragraph */
        h1 + p::first-letter {
            float: left;
            font-size: 3.2em;
            line-height: 0.8;
            padding-top: 4px;
            padding-right: 8px;
            padding-left: 0;
            color: ${colors.primary};
            font-weight: 800;
        }

        /* ─── H2 Section Headers (Category) ─── */
        h2 {
            font-size: 20px;
            font-weight: 700;
            margin: 32px 0 16px 0;
            padding: 10px 16px;
            
            /* Solid Strip Style */
            background: ${colors.summaryBg};
            border-left: 4px solid ${colors.h2Accent};
            border-radius: 0 8px 8px 0; /* "Tag" shape attached to left */
            
            color: ${colors.text};
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
        }

        /* Special styling for summary section remains similar but updated */
        h2:first-of-type + p,
        h2:nth-of-type(1) + p {
            background: ${colors.summaryBg};
            border: 1px solid ${colors.summaryBorder};
            border-radius: 8px; /* Consistent radius */
            padding: 16px 20px;
            margin: 8px 0 24px 0;
            font-size: 15px;
            line-height: 1.7;
            color: ${colors.textSecondary};
            font-style: italic; /* Editorial touch */
        }

        /* ─── H3 Sub-headers (Topic) ─── */
        h3 {
            font-size: 17px;
            font-weight: 700;
            margin: 28px 0 10px 0; /* Distinct separation */
            padding: 0;
            border: none;
            color: ${colors.text};
            line-height: 1.4;
            display: flex;
            align-items: center;
            letter-spacing: -0.2px;
        }

        /* Geometric Marker (Square) */
        h3::before {
            content: '';
            display: inline-block;
            width: 8px;
            height: 8px;
            background: ${colors.primary};
            margin-right: 12px;
            border-radius: 1px; /* Slightly rounded square */
            transform: rotate(45deg); /* Diamond shape for dynamic look */
        }

        /* H3 后面的正文缩进 - Removed for cleaner look with new header style */
        h3 + p,
        h3 + p + p {
            padding-left: 0;
        }

        /* ─── Paragraphs ─── */
        p {
            margin: 6px 0; /* Reduced from 10px 0 */
            line-height: 1.75;
            font-size: 15px;
            color: ${colors.text};
            letter-spacing: 0.2px;
        }

        /* ─── Bold ─── */
        strong {
            font-weight: 600;
            color: ${colors.strongColor};
        }

        /* ─── Italic (source references) ─── */
        em {
            font-style: italic;
            font-size: 13px;
            color: ${colors.emColor};
            opacity: 0.85;
        }

        /* ─── Ordered Lists ─── */
        ol {
            margin: 8px 0; /* Reduced from 12px */
            padding-left: 0;
            counter-reset: item;
            list-style: none;
        }

        ol > li {
            counter-increment: item;
            margin: 2px 0; /* Minimal margin */
            padding: 6px 12px 6px 44px; /* Tighter padding */
            position: relative;
            background: ${colors.surface};
            border: 1px solid ${colors.border};
            border-radius: 8px; /* Slightly smaller radius */
            line-height: 1.5;
            font-size: 14.5px;
            transition: background 0.2s;
        }

        ol > li::before {
            content: counter(item);
            position: absolute;
            left: 12px;
            top: 6px; /* Adjusted for smaller padding */
            width: 22px; /* Smaller circle */
            height: 22px;
            background: ${colors.olNumberColor};
            color: #fff;
            border-radius: 50%;
            font-size: 11px; /* Smaller font */
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
        }

        /* ─── Unordered Lists ─── */
        ul {
            margin: 8px 0; /* Reduced from 12px */
            padding-left: 0;
            list-style: none;
        }

        ul > li {
            margin: 0; /* Removed margin */
            padding: 2px 14px 2px 24px; /* Minimal padding */
            position: relative;
            line-height: 1.5; /* Slightly tighter line height */
            font-size: 14.5px;
            color: ${colors.text};
        }

        ul > li::before {
            content: '';
            position: absolute;
            left: 8px; /* Adjusted position */
            top: 11px; /* Adjusted for new line-height and padding */
            width: 5px; /* Slightly smaller dot */
            height: 5px;
            background: ${colors.primary};
            border-radius: 50%;
        }

        /* ─── Fix for loose lists (markdown with newlines between items) ─── */
        li > p {
            margin: 0;
            display: inline; /* Force inline to avoid block spacing if possible */
        }
        
        li > p + p {
            margin-top: 4px; /* Spacing only between paragraphs inside same list item */
            display: block;
        }

        /* ─── Horizontal Rule ─── */
        hr {
            border: none;
            height: 1px;
            background: ${colors.hrGradient};
            margin: 28px 0;
        }

        /* ─── Code blocks ─── */
        code {
            background: ${colors.codeBg};
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 13px;
            font-family: 'SF Mono', 'Fira Code', monospace;
        }

        pre {
            background: ${colors.codeBg};
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 12px 0;
        }

        pre code {
            background: none;
            padding: 0;
        }

        /* ─── Links ─── */
        a {
            color: ${colors.primary};
            text-decoration: none;
            border-bottom: 1px solid ${colors.primary}40;
        }

        /* ─── Blockquote ─── */
        blockquote {
            margin: 14px 0;
            padding: 12px 16px;
            border-left: 3px solid ${colors.primary};
            background: ${colors.surfaceAlt};
            border-radius: 0 8px 8px 0;
            color: ${colors.textSecondary};
            font-size: 14px;
        }

        /* ─── Scrollbar (WebKit) ─── */
        ::-webkit-scrollbar {
            width: 4px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: ${colors.border};
            border-radius: 2px;
        }
    </style>
</head>
<body>
    ${htmlContent}
    <script>
        // Auto-adjust height for RN WebView
        function notifyHeight() {
            const height = document.documentElement.scrollHeight;
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', value: height }));
        }
        window.addEventListener('load', notifyHeight);
        new MutationObserver(notifyHeight).observe(document.body, { childList: true, subtree: true });
        // Initial notification
        setTimeout(notifyHeight, 100);
        setTimeout(notifyHeight, 500);
    </script>
</body>
</html>`;
};

// ─── Component ───────────────────────────────────────────────────────────────

const DailyReportDetailScreen: React.FC = () => {
    const { theme, isDark } = useThemeContext();
    const navigation = useNavigation();
    const route = useRoute<any>();
    const reportId = route.params?.reportId;
    const { width } = useWindowDimensions();

    const [report, setReport] = useState<DailyReportDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [webViewHeight, setWebViewHeight] = useState(800);

    useEffect(() => {
        const fetchReport = async () => {
            try {
                setLoading(true);
                const data = await dailyReportApiService.getReportById(reportId);
                if (data) {
                    setReport(data);
                } else {
                    setError('日报未找到');
                }
            } catch (e) {
                setError('加载失败');
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [reportId]);

    // Mark as read
    useEffect(() => {
        if (reportId) {
            dailyReportApiService.markAsRead(reportId).catch(() => { });
        }
    }, [reportId]);

    useEffect(() => {
        navigation.setOptions({
            title: report?.title || 'AI 日报',
        });
    }, [navigation, report?.title]);

    // Convert markdown to HTML
    const htmlContent = useMemo(() => {
        if (!report?.content) return '';
        try {
            const html = marked(report.content, { breaks: true }) as string;
            return getHtmlTemplate(html, isDark, theme.colors.primary);
        } catch (e) {
            console.warn('[DailyReportDetail] Failed to parse markdown:', e);
            return getHtmlTemplate(`<p>${report.content}</p>`, isDark, theme.colors.primary);
        }
    }, [report?.content, isDark, theme.colors.primary]);

    const onWebViewMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'height' && data.value) {
                setWebViewHeight(Math.max(data.value, 300));
            }
        } catch (e) {
            // ignore
        }
    };

    if (loading) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>加载中...</Text>
            </View>
        );
    }

    if (error || !report) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
                <MaterialIcons name="error-outline" size={48} color={theme.colors.onSurfaceVariant} />
                <Text style={[styles.errorText, { color: theme.colors.onSurfaceVariant }]}>
                    {error || '日报未找到'}
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <WebView
                originWhitelist={['*']}
                source={{ html: htmlContent }}
                style={[styles.webView, { height: webViewHeight, width: width }]}
                scrollEnabled={true}
                showsVerticalScrollIndicator={false}
                onMessage={onWebViewMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={false}
                scalesPageToFit={false}
                mixedContentMode="always"
                textZoom={100}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    webView: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        lineHeight: 20,
        includeFontPadding: false,
        marginTop: 8,
    },
    errorText: {
        fontSize: 16,
        lineHeight: 24,
        includeFontPadding: false,
        marginTop: 8,
    },
});

export default DailyReportDetailScreen;
