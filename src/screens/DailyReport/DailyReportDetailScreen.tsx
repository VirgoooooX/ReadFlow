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
            summaryBg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
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
            summaryBg: 'linear-gradient(135deg, #f5f7ff 0%, #eef1ff 100%)',
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

        /* ─── H1 Title ─── */
        h1 {
            font-size: 26px;
            font-weight: 900;
            line-height: 1.3;
            margin: 0 0 16px 0; /* Reduced from 24px */
            letter-spacing: -0.5px;
            color: ${colors.text};
            padding-bottom: 12px; /* Reduced from 16px */
            border-bottom: 3px solid ${colors.primary};
        }

        /* ─── H2 Section Headers ─── */
        h2 {
            font-size: 20px;
            font-weight: 700;
            margin: 24px 0 12px 0; /* Reduced from 32px 0 16px 0 */
            padding: 10px 14px; /* Reduced from 12px 16px */
            background: ${colors.summaryBg};
            border-left: 4px solid ${colors.h2Accent};
            border-radius: 0 8px 8px 0;
            color: ${colors.text};
            letter-spacing: 0.3px;
        }

        /* Special styling for summary section */
        h2:first-of-type + p,
        h2:nth-of-type(1) + p {
            background: ${colors.summaryBg};
            border: 1px solid ${colors.summaryBorder};
            border-radius: 12px;
            padding: 14px 16px; /* Reduced padding */
            margin: 6px 0 16px 0; /* Reduced margin */
            font-size: 14.5px;
            line-height: 1.8;
            color: ${colors.textSecondary};
        }

        /* ─── H3 Sub-headers ─── */
        h3 {
            font-size: 17px;
            font-weight: 600;
            margin: 16px 0 8px 0; /* Reduced from 24px 0 10px 0 */
            padding-left: 12px;
            border-left: 3px solid ${colors.h3Accent};
            color: ${colors.text};
            line-height: 1.4;
        }

        /* H3 后面的正文缩进 */
        h3 + p,
        h3 + p + p {
            padding-left: 16px;
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
            margin: 6px 0; /* Reduced from 10px */
            padding: 10px 12px 10px 44px; /* Reduced vertical padding */
            position: relative;
            background: ${colors.surface};
            border: 1px solid ${colors.border};
            border-radius: 10px;
            line-height: 1.6;
            font-size: 14.5px;
            transition: background 0.2s;
        }

        ol > li::before {
            content: counter(item);
            position: absolute;
            left: 12px;
            top: 10px; /* Adjusted for smaller padding */
            width: 24px;
            height: 24px;
            background: ${colors.olNumberColor};
            color: #fff;
            border-radius: 50%;
            font-size: 12px;
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
            margin: 4px 0; /* Reduced from 8px */
            padding: 6px 14px 6px 24px; /* Reduced vertical padding */
            position: relative;
            line-height: 1.6;
            font-size: 14.5px;
            color: ${colors.text};
        }

        ul > li::before {
            content: '';
            position: absolute;
            left: 8px; /* Adjusted position */
            top: 15px; /* Adjusted position roughly center of line-height */
            width: 6px;
            height: 6px;
            background: ${colors.primary};
            border-radius: 50%;
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
