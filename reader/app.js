/**
 * 星之海洋 · 在线阅读器
 * ──────────────────────────────────────────────────
 * 纯静态单页应用，加载 JSON 数据渲染阅读内容。
 */

(function () {
  'use strict';

  // ── DOM 引用 ─────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const readerEl = $('#reader');
  const tocEl = $('#toc');
  const searchInput = $('#searchInput');
  const progressBar = $('#progressBar');
  const chapterInfoEl = $('#chapterInfo');
  const sidebarFooterEl = $('#sidebarFooter');
  const sidebarEl = $('#sidebar');
  const sidebarOverlay = $('#sidebarOverlay');
  const menuBtn = $('#menuBtn');
  const themeBtn = $('#themeBtn');
  const themeIcon = $('#themeIcon');
  const loadingEl = $('#loading');

  // ── 全局状态 ─────────────────────────────────────
  let bookData = null;        // 全书数据
  let flatChapters = [];      // 扁平化章节列表 [{id, title, content, volumeName, volumeIndex, chapterIndex}]
  let currentChapterId = null; // 当前章节 ID

  // ── 数据加载 ─────────────────────────────────────
  async function loadData() {
    try {
      const resp = await fetch('data/chapters.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      bookData = await resp.json();
      flattenChapters();
      renderTOC();
      updateFooter();

      // 恢复阅读进度
      const saved = localStorage.getItem('xhry-chapter');
      if (saved && flatChapters.find(c => c.id === parseInt(saved))) {
        navigateTo(parseInt(saved));
      } else {
        showWelcome();
      }
    } catch (err) {
      readerEl.innerHTML = `
        <div class="welcome">
          <span class="welcome__icon">⚠️</span>
          <h1 class="welcome__title">加载失败</h1>
          <p class="welcome__subtitle">${err.message}</p>
          <p class="welcome__meta">请确保 data/chapters.json 文件存在</p>
        </div>`;
    }
  }

  function flattenChapters() {
    flatChapters = [];
    bookData.volumes.forEach((vol, vi) => {
      vol.chapters.forEach((ch, ci) => {
        flatChapters.push({
          ...ch,
          volumeName: vol.name,
          volumeIndex: vi,
          chapterIndex: ci
        });
      });
    });
  }

  // ── 目录渲染 ─────────────────────────────────────
  function renderTOC(filter = '') {
    const keyword = filter.trim().toLowerCase();
    let html = '';

    bookData.volumes.forEach((vol, vi) => {
      const filteredChapters = vol.chapters.filter(ch =>
        !keyword || ch.title.toLowerCase().includes(keyword) || vol.name.toLowerCase().includes(keyword)
      );

      if (filteredChapters.length === 0) return;

      const isCollapsed = !keyword && vi > 2; // 默认只展开前三个卷
      html += `
        <div class="volume ${isCollapsed ? 'collapsed' : ''}" data-volume="${vi}">
          <div class="volume__header" data-toggle-volume="${vi}">
            <svg class="volume__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <span>${vol.name}</span>
            <span class="volume__count">${vol.chapters.length}</span>
          </div>
          <div class="volume__chapters">
            ${filteredChapters.map(ch => `
              <a class="chapter-link ${ch.id === currentChapterId ? 'active' : ''}"
                 data-id="${ch.id}" title="${ch.title}">${ch.title}</a>
            `).join('')}
          </div>
        </div>`;
    });

    tocEl.innerHTML = html;

    // 绑定卷折叠事件
    tocEl.querySelectorAll('[data-toggle-volume]').forEach(header => {
      header.addEventListener('click', () => {
        const vol = header.closest('.volume');
        vol.classList.toggle('collapsed');
      });
    });

    // 绑定章节点击事件
    tocEl.querySelectorAll('.chapter-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const id = parseInt(link.dataset.id);
        navigateTo(id);
        closeSidebar();
      });
    });
  }

  // ── 章节渲染 ─────────────────────────────────────
  function navigateTo(chapterId) {
    const idx = flatChapters.findIndex(c => c.id === chapterId);
    if (idx === -1) return;

    const chapter = flatChapters[idx];
    currentChapterId = chapterId;

    // 保存进度
    localStorage.setItem('xhry-chapter', chapterId);

    // 渲染内容
    const paragraphs = chapter.content
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('\n');

    const prevChapter = idx > 0 ? flatChapters[idx - 1] : null;
    const nextChapter = idx < flatChapters.length - 1 ? flatChapters[idx + 1] : null;

    readerEl.innerHTML = `
      <article class="chapter">
        <header class="chapter__header">
          <span class="chapter__volume-tag">${chapter.volumeName}</span>
          <h1 class="chapter__title">${escapeHtml(chapter.title)}</h1>
        </header>
        <div class="chapter__content">${paragraphs}</div>
        <nav class="chapter-nav">
          <button class="chapter-nav__btn chapter-nav__btn--prev"
                  ${prevChapter ? `data-nav="${prevChapter.id}"` : 'disabled'}>
            <span class="chapter-nav__label">← 上一章</span>
            <span class="chapter-nav__title">${prevChapter ? escapeHtml(prevChapter.title) : '已是第一章'}</span>
          </button>
          <button class="chapter-nav__btn chapter-nav__btn--next"
                  ${nextChapter ? `data-nav="${nextChapter.id}"` : 'disabled'}>
            <span class="chapter-nav__label">下一章 →</span>
            <span class="chapter-nav__title">${nextChapter ? escapeHtml(nextChapter.title) : '已是最后一章'}</span>
          </button>
        </nav>
      </article>`;

    // 绑定导航按钮
    readerEl.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigateTo(parseInt(btn.dataset.nav));
      });
    });

    // 更新 UI
    updateChapterInfo(chapter);
    updateActiveTOC();
    scrollToTop();
    updateProgress();
  }

  function showWelcome() {
    if (loadingEl) loadingEl.remove();
    readerEl.innerHTML = `
      <div class="welcome">
        <span class="welcome__icon">🌌</span>
        <h1 class="welcome__title">${bookData.title}</h1>
        <p class="welcome__subtitle">${bookData.subtitle}</p>
        <p class="welcome__meta">作者：${bookData.author} · 共 ${bookData.totalChapters} 章</p>
        <p class="welcome__hint">
          从左侧目录选择章节开始阅读
          <span>·</span>
          <span class="welcome__kbd">←</span> <span class="welcome__kbd">→</span> 翻页
        </p>
      </div>`;
  }

  // ── 辅助函数 ─────────────────────────────────────
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function updateChapterInfo(chapter) {
    chapterInfoEl.textContent = `${chapter.volumeName} · ${chapter.title}`;
    document.title = `${chapter.title} · 星之海洋`;
  }

  function updateActiveTOC() {
    tocEl.querySelectorAll('.chapter-link').forEach(link => {
      const id = parseInt(link.dataset.id);
      link.classList.toggle('active', id === currentChapterId);
    });

    // 展开当前章节所在的卷
    const chapter = flatChapters.find(c => c.id === currentChapterId);
    if (chapter) {
      const volEl = tocEl.querySelector(`[data-volume="${chapter.volumeIndex}"]`);
      if (volEl && volEl.classList.contains('collapsed')) {
        volEl.classList.remove('collapsed');
      }
      // 滚动到可见
      const activeLink = tocEl.querySelector('.chapter-link.active');
      if (activeLink) {
        activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function updateFooter() {
    sidebarFooterEl.textContent = `${bookData.volumes.length} 卷 · ${bookData.totalChapters} 章`;
  }

  // ── 阅读进度条 ───────────────────────────────────
  function updateProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;
    progressBar.style.width = pct + '%';
  }

  window.addEventListener('scroll', updateProgress, { passive: true });

  // ── 搜索过滤 ─────────────────────────────────────
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderTOC(searchInput.value);
    }, 200);
  });

  // ── 键盘导航 ─────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // 搜索框聚焦时不响应
    if (document.activeElement === searchInput) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigatePrev();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      navigateNext();
    }
  });

  function navigatePrev() {
    if (!currentChapterId) return;
    const idx = flatChapters.findIndex(c => c.id === currentChapterId);
    if (idx > 0) navigateTo(flatChapters[idx - 1].id);
  }

  function navigateNext() {
    if (!currentChapterId) {
      if (flatChapters.length > 0) navigateTo(flatChapters[0].id);
      return;
    }
    const idx = flatChapters.findIndex(c => c.id === currentChapterId);
    if (idx < flatChapters.length - 1) navigateTo(flatChapters[idx + 1].id);
  }

  // ── 主题切换 ─────────────────────────────────────
  const THEME_KEY = 'xhry-theme';

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      // 跟随系统
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
    updateThemeIcon();
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeIcon();
    // 更新 meta theme-color
    document.querySelector('meta[name="theme-color"]').content =
      next === 'dark' ? '#0a0e1a' : '#f5f5f0';
  }

  function updateThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeIcon.innerHTML = isDark
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' // 月亮
      : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'; // 太阳
  }

  themeBtn.addEventListener('click', toggleTheme);
  initTheme();

  // ── 移动端侧栏 ───────────────────────────────────
  function openSidebar() {
    sidebarEl.classList.add('open');
    sidebarOverlay.classList.add('active');
    requestAnimationFrame(() => sidebarOverlay.classList.add('visible'));
  }

  function closeSidebar() {
    sidebarEl.classList.remove('open');
    sidebarOverlay.classList.remove('visible');
    setTimeout(() => sidebarOverlay.classList.remove('active'), 300);
  }

  menuBtn.addEventListener('click', () => {
    sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  sidebarOverlay.addEventListener('click', closeSidebar);

  // ── 启动 ─────────────────────────────────────────
  loadData();

})();
