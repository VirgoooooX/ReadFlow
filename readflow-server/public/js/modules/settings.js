// 2. Settings
async function loadSettings() {
    try {
        const res = await fetch(`${API_BASE}/settings`);
        const data = await res.json();
        document.getElementById('setting-quality').value = data.imageQuality || 80;
        document.getElementById('setting-image-transcode-enabled').checked = data.imageTranscodeEnabled !== false;
        document.getElementById('setting-refresh-interval').value = data.rssDefaultRefreshIntervalSeconds ?? data.rssRefreshIntervalSeconds ?? 900;
        document.getElementById('setting-refresh-cron').value = data.rssDefaultRefreshCron ?? data.rssRefreshCron ?? '';
        document.getElementById('setting-max-articles').value = data.rssMaxItemsPerFetch ?? data.rssMaxArticlesPerFeed ?? data.fetchParseItemCap ?? 1000;
        document.getElementById('setting-max-blocks').value = data.syncPageSizeMax ?? data.syncMaxPageSize ?? data.rssSyncMaxBlocksPerFeed ?? 2000;
        document.getElementById('setting-fetch-timeout').value = data.rssFetchTimeoutMs ?? data.fetchTimeoutMs ?? 15000;
        document.getElementById('setting-sync-default-page').value = data.syncPageSizeDefault ?? data.syncDefaultPageSize ?? 200;
        document.getElementById('setting-retention-days').value = data.retentionDays ?? data.articleRetentionDays ?? 0;
        document.getElementById('setting-max-count-per-feed').value = data.retentionMaxArticlesPerFeed ?? data.articleMaxCountPerFeed ?? 0;
        document.getElementById('setting-cleanup-interval').value = data.cleanupIntervalHours ?? 24;
        document.getElementById('setting-password').value = data.adminPassword || '';
        document.getElementById('setting-system-prompt').value = data.dailyReportSystemPrompt || '';
    } catch (e) { console.error(e); }
}

async function saveSettings() {
    const quality = parseInt(document.getElementById('setting-quality').value);
    const imageTranscodeEnabled = !!document.getElementById('setting-image-transcode-enabled').checked;
    const rssDefaultRefreshIntervalSeconds = parseInt(document.getElementById('setting-refresh-interval').value);
    const rssDefaultRefreshCronRaw = document.getElementById('setting-refresh-cron').value;
    const rssDefaultRefreshCron = (rssDefaultRefreshCronRaw || '').trim();
    const rssMaxItemsPerFetch = parseInt(document.getElementById('setting-max-articles').value);
    const syncPageSizeMax = parseInt(document.getElementById('setting-max-blocks').value);
    const rssFetchTimeoutMs = parseInt(document.getElementById('setting-fetch-timeout').value);
    const syncPageSizeDefault = parseInt(document.getElementById('setting-sync-default-page').value);
    const retentionDays = parseInt(document.getElementById('setting-retention-days').value);
    const retentionMaxArticlesPerFeed = parseInt(document.getElementById('setting-max-count-per-feed').value);
    const cleanupIntervalHours = parseInt(document.getElementById('setting-cleanup-interval').value);
    const adminPassword = document.getElementById('setting-password').value;
    const dailyReportSystemPrompt = document.getElementById('setting-system-prompt').value;

    if (rssDefaultRefreshCron && !isLikelyValidCronExpression(rssDefaultRefreshCron)) {
        return showToast('默认刷新 Cron 格式不正确（需5或6段，用空格分隔）', 'error');
    }

    await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            imageQuality: quality,
            imageTranscodeEnabled,
            rssDefaultRefreshIntervalSeconds,
            rssDefaultRefreshCron: rssDefaultRefreshCron ? rssDefaultRefreshCron : null,
            rssFetchTimeoutMs,
            rssMaxItemsPerFetch,
            retentionDays,
            retentionMaxArticlesPerFeed,
            cleanupIntervalHours,
            syncPageSizeDefault,
            syncPageSizeMax,
            adminPassword,
            dailyReportSystemPrompt
        })
    });
    showToast('配置已成功保存并生效');
}
