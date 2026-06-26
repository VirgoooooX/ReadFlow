// 7. Images
async function loadImages() {
    const gallery = document.getElementById('images-gallery');
    if (!gallery) return;
    const imageSkeleton = `
    <div class="animate-pulse glass-card h-32 rounded-xl"></div>
    `;
    if (!gallery.innerHTML.trim() || gallery.innerHTML.includes('animate-pulse')) {
        gallery.innerHTML = imageSkeleton.repeat(6);
    }

    try {
        const res = await fetch(`${API_BASE}/cache/images?limit=200&offset=0`);
        const data = await res.json();
        const images = data.images || [];

        if (images.length === 0) {
            gallery.innerHTML = `
            <div class="col-span-full py-16 text-center">
                <div class="w-12 h-12 rounded-2xl bg-slate-950/60 flex items-center justify-center text-slate-500 mb-4 border border-white/5 mx-auto">
                    <i class="fa-regular fa-images text-xl"></i>
                </div>
                <p class="text-sm font-bold text-slate-400">缓存为空</p>
                <p class="text-xs mt-1 text-slate-500">目前没有任何图片缓存</p>
            </div>
            `;
            return;
        }

        gallery.innerHTML = images.map(img => `
        <div class="media-card group relative">
            <img src="/cache/${img.name}" alt="${img.name}" loading="lazy" class="w-full h-40 object-cover">
            <div class="media-info-overlay flex flex-col justify-end text-xs space-y-1 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent">
                <p class="font-mono text-[9px] text-white truncate" title="${img.name}">${img.name}</p>
                <div class="flex justify-between text-[10px] text-slate-400">
                    <span>${formatBytes(img.size)}</span>
                    <span>${new Date(img.mtimeMs).toLocaleDateString()}</span>
                </div>
                <div class="flex justify-between items-center pt-1 border-t border-white/10 mt-1">
                    <a href="/cache/${img.name}" target="_blank" rel="noreferrer noopener" class="text-[10px] text-indigo-400 hover:underline flex items-center">
                        <i class="fa-solid fa-up-right-from-square mr-1"></i>原图
                    </a>
                    <button onclick="deleteImage('${img.name}')" class="text-slate-400 hover:text-rose-400 transition">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
        `).join('');
    } catch (e) {
        console.error(e);
        showToast('加载图片缓存失败', 'error');
    }
}

window.deleteImage = async function (name) {
    if (!confirm('删除这张图片?')) return;
    await fetch(`${API_BASE}/cache/images/${encodeURIComponent(name)}`, { method: 'DELETE' });
    loadImages();
    showToast('图片已删除');
}
