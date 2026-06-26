// 8. Logs
let _allLogs = [];
let _currentLogFilter = 'ALL';
let _currentLogSearch = '';

async function loadLogs() {
    try {
        const res = await fetch(`${API_BASE}/logs?limit=500`);
        _allLogs = (await res.json()).reverse();
        renderLogs();
    } catch (e) {
        console.error(e);
        showToast('日志加载失败', 'error');
    }
}

function filterLogs(level) {
    _currentLogFilter = level;
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        if (btn.dataset.level === level) {
            btn.classList.replace('text-slate-500', 'text-slate-700');
            btn.classList.add('bg-white', 'shadow-sm');
        } else {
            btn.classList.replace('text-slate-700', 'text-slate-500');
            btn.classList.remove('bg-white', 'shadow-sm');
        }
    });
    renderLogs();
}

function searchLogs(query) {
    _currentLogSearch = query.trim().toLowerCase();
    renderLogs();
}

function downloadLogs() {
    if (_allLogs.length === 0) return showToast('暂无日志可下载', 'info');
    const text = _allLogs.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `readflow-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

function renderLogs() {
    const containers = [
        document.getElementById('logs-container'),
        document.getElementById('settings-logs-container')
    ].filter(Boolean);
    if (containers.length === 0) return;

    if (_allLogs.length === 0) {
        containers.forEach(container => {
            container.innerHTML = '<div class="text-slate-500 italic p-4 text-center mt-10">暂无日志数据</div>';
        });
        return;
    }

    let filtered = _allLogs;

    // Filter by level
    if (_currentLogFilter !== 'ALL') {
        filtered = filtered.filter(line => line.includes(`[${_currentLogFilter}]`));
    }

    // Filter by search query
    if (_currentLogSearch) {
        filtered = filtered.filter(line => line.toLowerCase().includes(_currentLogSearch));
    }

    if (filtered.length === 0) {
        containers.forEach(container => {
            container.innerHTML = '<div class="text-slate-500 italic p-4 text-center mt-10">无匹配的日志记录</div>';
        });
        return;
    }

    const html = filtered.map(line => {
        let colorClass = 'text-slate-300';
        if (line.includes('[ERROR]')) colorClass = 'text-red-400 font-bold';
        else if (line.includes('[WARN]')) colorClass = 'text-yellow-400';
        else if (line.includes('[INFO]')) colorClass = 'text-emerald-300';

        let resultHtml = '';
        if (_currentLogSearch) {
            const regex = new RegExp(`(${_currentLogSearch.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')})`, 'gi');
            const parts = line.split(regex);
            resultHtml = parts.map(part => {
                if (part.toLowerCase() === _currentLogSearch) {
                    return `<mark class="bg-blue-500/40 text-blue-100 rounded px-1">${escapeHtml(part)}</mark>`;
                } else {
                    return escapeHtml(part);
                }
            }).join('');
        } else {
            resultHtml = escapeHtml(line);
        }

        return `<div class="${colorClass} mb-1 whitespace-pre-wrap font-mono leading-relaxed">${resultHtml}</div>`;
    }).join('');

    containers.forEach(container => {
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    });
}
