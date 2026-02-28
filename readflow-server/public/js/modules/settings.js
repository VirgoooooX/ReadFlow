// 2. Settings
function genId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function normalizeBaseUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function renderLlmProfiles(profiles) {
    const tbody = document.getElementById('llm-profiles-body');
    if (!tbody) return;
    const safe = Array.isArray(profiles) ? profiles : [];
    tbody.innerHTML = safe.map((p) => {
        const id = String(p.id || '').trim();
        const name = String(p.name || '');
        const provider = String(p.provider || 'openai-compatible');
        const baseUrl = String(p.baseUrl || '');
        const model = String(p.model || '');
        const hasApiKey = !!p.hasApiKey;
        const apiKeyHint = String(p.apiKeyHint || '');
        const temperature = (p.temperature ?? '') === 0 ? '0' : (p.temperature ?? '');
        const maxTokens = (p.maxTokens ?? '') === 0 ? '0' : (p.maxTokens ?? '');
        const topP = (p.topP ?? '') === 0 ? '0' : (p.topP ?? '');
        const isActive = p.isActive !== false;

        return `
            <tr data-profile-id="${id}">
                <td class="px-4 py-3">
                    <input type="checkbox" class="llm-isActive h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500" ${isActive ? 'checked' : ''}>
                </td>
                <td class="px-4 py-3">
                    <input type="text" class="llm-name w-40 px-3 py-2 bg-white border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500" value="${name.replace(/"/g, '&quot;')}">
                </td>
                <td class="px-4 py-3">
                    <select class="llm-provider w-44 px-3 py-2 bg-white border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500">
                        <option value="openai-compatible" ${provider === 'openai-compatible' ? 'selected' : ''}>openai-compatible</option>
                        <option value="anthropic" ${provider === 'anthropic' ? 'selected' : ''}>anthropic</option>
                    </select>
                </td>
                <td class="px-4 py-3">
                    <input type="text" class="llm-baseUrl w-72 px-3 py-2 bg-white border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500" value="${baseUrl.replace(/"/g, '&quot;')}">
                </td>
                <td class="px-4 py-3">
                    <input type="text" class="llm-model w-52 px-3 py-2 bg-white border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500" value="${model.replace(/"/g, '&quot;')}">
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <input type="password" class="llm-apiKey w-56 px-3 py-2 bg-white border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500" placeholder="${hasApiKey ? '已设置，留空不变' : '未设置'}">
                        <span class="text-xs text-slate-400">${apiKeyHint ? apiKeyHint : ''}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <input type="number" step="0.1" min="0" max="2" class="llm-temperature w-24 px-3 py-2 bg-white border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500" value="${temperature}">
                </td>
                <td class="px-4 py-3">
                    <input type="number" step="1" min="1" class="llm-maxTokens w-28 px-3 py-2 bg-white border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500" value="${maxTokens}">
                </td>
                <td class="px-4 py-3">
                    <input type="number" step="0.05" min="0" max="1" class="llm-topP w-24 px-3 py-2 bg-white border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-500" value="${topP}">
                </td>
                <td class="px-4 py-3 text-right">
                    <div class="flex justify-end gap-2">
                        <button class="llm-copy px-3 py-2 rounded-lg bg-slate-200/70 hover:bg-slate-300/70 text-slate-800 text-xs font-bold">复制</button>
                        <button class="llm-delete px-3 py-2 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold">删除</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function readLlmProfilesFromUI() {
    const tbody = document.getElementById('llm-profiles-body');
    if (!tbody) return [];
    const rows = Array.from(tbody.querySelectorAll('tr'));
    return rows.map((tr) => {
        const id = String(tr.getAttribute('data-profile-id') || '').trim();
        const isActiveEl = tr.querySelector('.llm-isActive');
        const isActive = !!(isActiveEl && isActiveEl.checked);
        const nameEl = tr.querySelector('.llm-name');
        const name = nameEl ? nameEl.value : '';
        const providerEl = tr.querySelector('.llm-provider');
        const provider = providerEl ? providerEl.value : 'openai-compatible';
        const baseUrlEl = tr.querySelector('.llm-baseUrl');
        const baseUrl = normalizeBaseUrl(baseUrlEl ? baseUrlEl.value : '');
        const modelEl = tr.querySelector('.llm-model');
        const model = modelEl ? modelEl.value : '';
        const apiKeyEl = tr.querySelector('.llm-apiKey');
        const apiKeyRaw = apiKeyEl ? apiKeyEl.value : '';
        const temperatureEl = tr.querySelector('.llm-temperature');
        const temperatureRaw = temperatureEl ? temperatureEl.value : undefined;
        const maxTokensEl = tr.querySelector('.llm-maxTokens');
        const maxTokensRaw = maxTokensEl ? maxTokensEl.value : undefined;
        const topPEl = tr.querySelector('.llm-topP');
        const topPRaw = topPEl ? topPEl.value : undefined;

        const p = { id, name, provider, baseUrl, model, isActive };

        const apiKey = String(apiKeyRaw).trim();
        if (apiKey) p.apiKey = apiKey;

        const temperature = parseFloat(String(temperatureRaw ?? ''));
        if (Number.isFinite(temperature)) p.temperature = temperature;

        const maxTokens = parseInt(String(maxTokensRaw ?? ''), 10);
        if (Number.isFinite(maxTokens)) p.maxTokens = maxTokens;

        const topP = parseFloat(String(topPRaw ?? ''));
        if (Number.isFinite(topP)) p.topP = topP;

        return p;
    }).filter((p) => p.id && p.baseUrl && p.model);
}

function renderLlmBindings(profiles, bindings) {
    const active = (Array.isArray(profiles) ? profiles : []).filter((p) => p && p.isActive !== false);
    const options = [`<option value="">(默认)</option>`].concat(active.map((p) => `<option value="${String(p.id)}">${String(p.name || p.id)}</option>`));
    const ids = {
        translation: 'llm-binding-translation',
        dictionary: 'llm-binding-dictionary',
        titleTranslation: 'llm-binding-titleTranslation',
        dailyReport: 'llm-binding-dailyReport'
    };
    Object.entries(ids).forEach(([feature, elId]) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.innerHTML = options.join('');
        const v = bindings && bindings[feature] ? String(bindings[feature]) : '';
        el.value = v;
    });
}

function attachLlmProfileEvents() {
    const tbody = document.getElementById('llm-profiles-body');
    if (!tbody) return;
    if (tbody.dataset.bound) return;
    tbody.dataset.bound = '1';
    tbody.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const tr = target.closest('tr');
        if (!tr) return;
        const id = tr.getAttribute('data-profile-id');
        if (!id) return;

        if (target.classList.contains('llm-delete')) {
            tr.remove();
            renderLlmBindings(readLlmProfilesFromUI(), {});
            return;
        }
        if (target.classList.contains('llm-copy')) {
            const profiles = readLlmProfilesFromUI();
            const found = profiles.find((p) => p.id === id);
            if (!found) return;
            const copy = { ...found, id: genId(), name: `${found.name || 'Profile'} Copy`, apiKey: '' };
            profiles.push(copy);
            renderLlmProfiles(profiles);
            renderLlmBindings(profiles, {});
            return;
        }
    });

    tbody.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.closest('tr')) return;
        const profiles = readLlmProfilesFromUI();
        renderLlmBindings(profiles, {});
    });

    const addBtn = document.getElementById('llm-add-profile');
    if (addBtn && !addBtn.dataset.bound) {
        addBtn.dataset.bound = '1';
        addBtn.addEventListener('click', () => {
            const profiles = readLlmProfilesFromUI();
            profiles.push({
                id: genId(),
                name: 'New Profile',
                provider: 'openai-compatible',
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-4o-mini',
                isActive: true
            });
            renderLlmProfiles(profiles);
            renderLlmBindings(profiles, {});
        });
    }
}

function readSelectValue(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    return String(el.value || '').trim();
}

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

        const llmProfiles = (data.llm && Array.isArray(data.llm.profiles)) ? data.llm.profiles : [];
        const llmBindings = (data.llm && typeof data.llm.bindings === 'object') ? data.llm.bindings : {};
        renderLlmProfiles(llmProfiles);
        renderLlmBindings(llmProfiles, llmBindings || {});
        attachLlmProfileEvents();
        attachLlmUsageEvents();
        loadLlmUsage().catch(() => { });
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

    const llmProfiles = readLlmProfilesFromUI();
    const llmBindings = {
        translation: readSelectValue('llm-binding-translation'),
        dictionary: readSelectValue('llm-binding-dictionary'),
        titleTranslation: readSelectValue('llm-binding-titleTranslation'),
        dailyReport: readSelectValue('llm-binding-dailyReport')
    };

    const bindingsFiltered = {};
    Object.entries(llmBindings).forEach(([k, v]) => {
        const s = String(v || '').trim();
        if (s) bindingsFiltered[k] = s;
    });

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
            dailyReportSystemPrompt,
            llm: {
                profiles: llmProfiles,
                bindings: bindingsFiltered
            }
        })
    });
    showToast('配置已成功保存并生效');
}

function llmFeatureLabel(feature) {
    const f = String(feature || '');
    if (f === 'translation') return '翻译';
    if (f === 'dictionary') return '查词';
    if (f === 'titleTranslation') return '标题翻译';
    if (f === 'dailyReport') return '日报';
    return f || '-';
}

function llmFormatDay(iso) {
    try {
        const d = new Date(iso);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    } catch {
        return String(iso || '');
    }
}

function renderLlmUsage(rangeDays, rows) {
    const tbody = document.getElementById('llm-usage-body');
    const summary = document.getElementById('llm-usage-summary');
    if (!tbody || !summary) return;
    const safe = Array.isArray(rows) ? rows : [];

    let totalRequests = 0;
    let totalOk = 0;
    let totalRateLimited = 0;
    let totalCacheHits = 0;
    let totalTokens = 0;
    safe.forEach((r) => {
        totalRequests += Number(r.requests || 0);
        totalOk += Number(r.ok || 0);
        totalRateLimited += Number(r.rateLimited || 0);
        totalCacheHits += Number(r.cacheHits || 0);
        totalTokens += Number(r.tokens || 0);
    });

    const range = Number(rangeDays || 0) || 7;
    const okRate = totalRequests > 0 ? Math.round((totalOk / totalRequests) * 100) : 0;
    const cacheRate = totalRequests > 0 ? Math.round((totalCacheHits / totalRequests) * 100) : 0;
    summary.textContent = `近 ${range} 天：请求 ${totalRequests}，成功 ${totalOk}（${okRate}%），限流 ${totalRateLimited}，缓存命中 ${totalCacheHits}（${cacheRate}%），Tokens ${totalTokens}`;

    if (safe.length === 0) {
        tbody.innerHTML = `<tr><td class="px-4 py-4 text-slate-400" colspan="9">暂无数据</td></tr>`;
        return;
    }

    tbody.innerHTML = safe.map((r) => {
        const day = llmFormatDay(r.day);
        const feature = llmFeatureLabel(r.feature);
        const requests = Number(r.requests || 0);
        const ok = Number(r.ok || 0);
        const rateLimited = Number(r.rateLimited || 0);
        const cacheHits = Number(r.cacheHits || 0);
        const avgMs = Number(r.avgMs || 0);
        const p95Ms = Number(r.p95Ms || 0);
        const tokens = Number(r.tokens || 0);
        return `
            <tr>
                <td class="px-4 py-3 text-left font-mono text-xs text-slate-700">${day}</td>
                <td class="px-4 py-3 text-left text-slate-800">${feature}</td>
                <td class="px-4 py-3 text-right font-mono text-xs text-slate-700">${requests}</td>
                <td class="px-4 py-3 text-right font-mono text-xs text-slate-700">${ok}</td>
                <td class="px-4 py-3 text-right font-mono text-xs text-slate-700">${rateLimited}</td>
                <td class="px-4 py-3 text-right font-mono text-xs text-slate-700">${cacheHits}</td>
                <td class="px-4 py-3 text-right font-mono text-xs text-slate-700">${avgMs}</td>
                <td class="px-4 py-3 text-right font-mono text-xs text-slate-700">${p95Ms}</td>
                <td class="px-4 py-3 text-right font-mono text-xs text-slate-700">${tokens}</td>
            </tr>
        `;
    }).join('');
}

async function loadLlmUsage() {
    const sel = document.getElementById('llm-usage-days');
    const days = sel ? (parseInt(String(sel.value || '7'), 10) || 7) : 7;
    const res = await fetch(`${API_BASE}/llm-usage?days=${encodeURIComponent(String(days))}`);
    const data = await res.json();
    renderLlmUsage(data.rangeDays ?? days, data.rows ?? []);
}

function attachLlmUsageEvents() {
    const refresh = document.getElementById('llm-usage-refresh');
    const sel = document.getElementById('llm-usage-days');
    if (refresh && !refresh.dataset.bound) {
        refresh.dataset.bound = '1';
        refresh.addEventListener('click', () => {
            loadLlmUsage().catch(() => { });
        });
    }
    if (sel && !sel.dataset.bound) {
        sel.dataset.bound = '1';
        sel.addEventListener('change', () => {
            loadLlmUsage().catch(() => { });
        });
    }
}
