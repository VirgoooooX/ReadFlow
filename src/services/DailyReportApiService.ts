import { cloudConfigService } from './CloudConfigService';
import AuthService from './AuthService';

export interface DailyReportSummary {
    id: number;
    title: string;
    content: string;
    articleCount: number;
    groupNames: any;
    generatedAt: string;
    isRead?: boolean;
}

export interface DailyReportDetail extends DailyReportSummary {
    sourceUrls: string[];
    createdAt: string;
}

class DailyReportApiService {
    private async getServerUrl(): Promise<string> {
        const config = await cloudConfigService.getConfig();
        if (!config.serverUrl) throw new Error('Server URL not configured');
        return config.serverUrl.replace(/\/$/, '');
    }

    private getAuthHeaders(): Record<string, string> {
        const token = AuthService.getAuthToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    private async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
        const config = await cloudConfigService.getConfig();
        const headers: Record<string, string> = {
            ...this.getAuthHeaders(),
            ...(config.serverAccessKey ? { 'x-server-token': config.serverAccessKey, 'x-server-access-key': config.serverAccessKey } : {}),
            ...(options.headers as Record<string, string> || {}),
        };
        return fetch(url, { ...options, headers });
    }

    async getLatestReport(): Promise<DailyReportSummary | null> {
        try {
            const serverUrl = await this.getServerUrl();
            const resp = await this.authenticatedFetch(`${serverUrl}/api/rss/daily-reports/latest`);
            if (resp.status === 404) return null;
            if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
            const data = await resp.json();
            return data?.report || null;
        } catch (error) {
            console.warn('[DailyReportApi] getLatestReport failed:', error);
            return null;
        }
    }

    async getReports(limit = 10, offset = 0): Promise<DailyReportSummary[]> {
        try {
            const serverUrl = await this.getServerUrl();
            const resp = await this.authenticatedFetch(`${serverUrl}/api/rss/daily-reports?limit=${limit}&offset=${offset}`);
            if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
            const data = await resp.json();
            return data?.reports || [];
        } catch (error) {
            console.warn('[DailyReportApi] getReports failed:', error);
            return [];
        }
    }

    async getReportById(id: number): Promise<DailyReportDetail | null> {
        try {
            const serverUrl = await this.getServerUrl();
            const resp = await this.authenticatedFetch(`${serverUrl}/api/rss/daily-reports/${id}`);
            if (resp.status === 404) return null;
            if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
            const data = await resp.json();
            return data?.report || null;
        } catch (error) {
            console.warn('[DailyReportApi] getReportById failed:', error);
            return null;
        }
    }

    async generateReport(): Promise<{ id: number; title: string } | null> {
        try {
            const serverUrl = await this.getServerUrl();
            const resp = await this.authenticatedFetch(`${serverUrl}/api/rss/daily-reports/generate`, {
                method: 'POST',
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                throw new Error(data?.error || `Server error: ${resp.status}`);
            }
            const data = await resp.json();
            return data?.report || null;
        } catch (error) {
            console.warn('[DailyReportApi] generateReport failed:', error);
            throw error;
        }
    }

    async markAsRead(id: number): Promise<boolean> {
        try {
            const serverUrl = await this.getServerUrl();
            const resp = await this.authenticatedFetch(`${serverUrl}/api/rss/daily-reports/${id}/read`, {
                method: 'POST',
            });
            return resp.ok;
        } catch (error) {
            console.warn('[DailyReportApi] markAsRead failed:', error);
            return false;
        }
    }
}

export const dailyReportApiService = new DailyReportApiService();
