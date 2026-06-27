// HIU-ACM 用户端 - 使用 Cloudflare Worker API
const App = {
  problems: [],
  stats: {},
  todayTasks: null,
  selected: [],
  showNewOnly: false,
  filterTag: "全部",
  searchQuery: "",
  selectionPhase: 0, // 0=新题阶段, 1=全部题目阶段
  _scrollTop: 0,

  async init() {
    Api.init();
    this.initTheme();
    const user = await Auth.checkSession();
    if (!user) { this.showView("login"); return; }

    if (user.isAdmin) {
      Admin.init();
      return;
    }

    this.user = user;
    await this.loadData();
    this.showView("dashboard");
    this.renderDashboard();
  },

  initTheme() {
    const saved = localStorage.getItem("hiu-acm-theme");
    if (saved === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else if (saved === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
    // else: follow system prefers-color-scheme (no attribute needed)
  },

  _currentView: null,

  toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("hiu-acm-theme");
    } else if (current === "dark") {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("hiu-acm-theme", "light");
    } else {
      // Currently following system, switch to dark explicitly
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("hiu-acm-theme", "dark");
    }
    this.refreshView();
  },

  refreshView() {
    if (!this._currentView) return;
    this[this._currentView]();
  },

  getThemeIcon() {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light") return "☀";
    if (current === "dark") return "🌙";
    return "⏾"; // system/auto
  },

  getNavHTML(activeLink) {
    return `
      <nav class="app-nav">
        <div class="nav-brand"><span style="font-size:20px">🏠</span> HIU-ACM</div>
        <div class="nav-links">
          <a class="nav-link ${activeLink === 'selection' || activeLink === 'today' ? 'active' : ''}" onclick="App.renderTodayTasksOrSelection()">${this.todayTasks ? '今日题单' : '选择题单'}</a>
          <a class="nav-link ${activeLink === 'bank' ? 'active' : ''}" onclick="App.renderBank()">题库浏览</a>
          <a class="nav-link ${activeLink === 'history' ? 'active' : ''}" onclick="App.renderHistory()">历史记录</a>
          <a class="nav-link ${activeLink === 'group' ? 'active' : ''}" onclick="App.renderGroup()">小组展示</a>
          <a class="nav-link ${activeLink === 'profile' ? 'active' : ''}" onclick="App.renderProfile()">个人信息</a>
        </div>
        <div class="nav-user">
          <button class="theme-toggle" onclick="App.toggleTheme()" title="切换亮/暗模式">${this.getThemeIcon()}</button>
          <div class="nav-user-avatar">${this.user.name[0]}</div>
          <span class="nav-user-name">${this.user.name}</span>
          <button class="btn-text" onclick="App.handleLogout()">退出</button>
        </div>
      </nav>`;
  },

  _saveScroll() {
    const main = document.querySelector(".app-main");
    if (main) this._scrollTop = main.scrollTop;
  },

  _restoreScroll() {
    const main = document.querySelector(".app-main");
    if (main && this._scrollTop > 0) {
      main.scrollTop = this._scrollTop;
    }
  },

  renderDashboard() {
    if (this.todayTasks) this.renderTodayTasks();
    else this.renderSelection();
  },

  renderTodayTasksOrSelection() {
    this.selectionPhase = 0;
    if (this.todayTasks) this.renderTodayTasks();
    else this.renderSelection();
  },

  async loadData() {
    const [problems, stats, todayTasks, me] = await Promise.all([
      Api.getProblems(),
      Api.getProblemStats(),
      Api.getTodayTasks(),
      Api.getMe().catch(() => null)
    ]);
    this.problems = problems;
    // 后端返回 selected_count/completed_count（下划线），统一映射为驼峰供前端使用
    const statMap = {};
    for (const s of stats) statMap[s.problem_id] = {
      selectedCount: s.selected_count ?? 0,
      completedCount: s.completed_count ?? 0
    };
    this.stats = statMap;
    this.todayTasks = todayTasks;
    if (me) this.user = { ...this.user, ...me };
  },

  showView(view) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    const target = document.getElementById(`view-${view}`);
    if (target) target.classList.remove("hidden");
  },

  // ==================== 登录页 ====================
  renderLogin() {
    const el = document.getElementById("view-login");
    el.innerHTML = `
      <div class="login-wrapper">
        <div class="bg-glow bg-glow-1"></div><div class="bg-glow bg-glow-2"></div>
        <div class="login-card glass-card">
          <div class="login-header">
            <div class="login-logo"><svg width="48" height="48" fill="none" stroke="#2DD4BF" stroke-width="2"><rect x="4" y="8" width="40" height="30" rx="4"/><line x1="12" y1="16" x2="22" y2="16"/><line x1="12" y1="22" x2="36" y2="22"/><line x1="12" y1="28" x2="30" y2="28"/><circle cx="36" cy="16" r="3"/></svg></div>
            <h1 class="login-title">HIU-ACM 算法集训</h1>
            <p class="login-subtitle">假期集训管理系统</p>
          </div>
          <div class="login-form">
            <div class="input-group">
              <label class="input-label">手机号</label>
              <div class="input-wrapper">
                <span class="input-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="12" height="10" rx="2"/><line x1="8" y1="11" x2="8" y2="13"/></svg></span>
                <input type="text" id="loginPhone" class="input-field" placeholder="输入手机号" autocomplete="off" style="padding-left:40px">
              </div>
            </div>
            <div class="input-group">
              <label class="input-label">校验码 / 密码</label>
              <div class="input-wrapper">
                <span class="input-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="10" height="8" rx="1"/><path d="M7 7V5a3 3 0 016 0v2"/></svg></span>
                <input type="password" id="loginCode" class="input-field" placeholder="输入校验码" style="padding-left:40px">
              </div>
            </div>
            <div id="loginError" class="login-error hidden"></div>
            <button id="loginBtn" class="btn-primary login-btn" onclick="App.handleLogin()">登 录</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("loginPhone").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("loginCode").focus(); });
    document.getElementById("loginCode").addEventListener("keydown", e => { if (e.key === "Enter") App.handleLogin(); });
  },

  async handleLogin() {
    const phone = document.getElementById("loginPhone").value.trim();
    const code = document.getElementById("loginCode").value.trim();
    const errorEl = document.getElementById("loginError");
    const btn = document.getElementById("loginBtn");
    if (!phone || !code) { errorEl.textContent = "请输入手机号和校验码"; errorEl.classList.remove("hidden"); return; }

    btn.disabled = true;
    btn.classList.add("loading");
    errorEl.classList.add("hidden");
    try {
      const user = await Auth.login(phone, code);
      if (user.isAdmin) { Admin.init(); return; }
      this.user = user;
      await this.showConfirm(user);
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.classList.remove("hidden");
    }
    btn.disabled = false;
    btn.classList.remove("loading");
  },

  async showConfirm(user) {
    const el = document.getElementById("view-login");
    el.innerHTML = `
      <div class="login-wrapper">
        <div class="login-card glass-card confirm-card">
          <div class="user-avatar-large">${user.name[0]}</div>
          <h3>${user.name}</h3>
          <div class="user-info-list">
            <div class="user-info-row"><span class="info-label">手机号</span><span class="info-value">${user.phone}</span></div>
            <div class="user-info-row"><span class="info-label">身份</span><span class="info-value">学员</span></div>
          </div>
          <p style="color:var(--text-secondary);font-size:13px;margin-top:8px">确认信息无误后登录</p>
          <div class="confirm-actions">
            <button class="btn-secondary" onclick="App.cancelLogin()">取消</button>
            <button class="btn-primary" onclick="App.confirmLogin()">确认登录</button>
          </div>
        </div>
      </div>
    `;
  },

  async confirmLogin() {
    await this.loadData();
    this.showView("dashboard");
    this.renderDashboard();
  },

  cancelLogin() {
    Auth.logout();
    this.renderLogin();
  },

  // ==================== 选择题单 ====================
  renderSelection() {
    this._currentView = 'renderSelection';
    this._saveScroll();
    const el = document.getElementById("view-dashboard");
    const tags = this.getAllTags();
    const isPhase1 = this.selectionPhase === 0;
    const newProblems = this.problems.filter(p => (this.stats[p.nowcoder_id]?.selectedCount || 0) < 1);
    const displayProblems = isPhase1 ? newProblems : this.getFilteredProblems();
    const newCount = this.selected.filter(id => (this.stats[id]?.selectedCount || 0) < 1).length;

    el.innerHTML = `
      <div class="app-layout">
        ${this.getNavHTML('selection')}
        <main class="app-main">
          <div class="section-header">
            <h2>${isPhase1 ? '第1步：选择新题目' : '第2步：选择全部题目'}</h2>
            <p>${isPhase1 ? '请优先从「被选择次数 < 1」的题目中选择至少 2 道' : '已选 ' + newCount + ' 道新题，可继续选择其他题目'}</p>
          </div>
          <div class="selection-rules glass-card">
            <h3>📋 选择规则</h3>
            <ul>
              <li>必须选择 <strong>2 道</strong>「被选择次数 < 1」的新题目</li>
              <li>可额外选择 <strong>3-18 道</strong>任意题目</li>
              <li>总共 5-20 道题目作为今日待完成题单</li>
            </ul>
          </div>
          ${!isPhase1 ? `
          <div class="filter-bar">
            <div class="filter-tags">
              <button class="tag-btn ${this.filterTag === '全部' ? 'active' : ''}" onclick="App.setFilter('全部')">全部</button>
              ${tags.map(t => `<button class="tag-btn ${this.filterTag === t ? 'active' : ''}" onclick="App.setFilter('${t}')">${t}</button>`).join("")}
            </div>
            <div class="search-box">
              <input class="input-field" placeholder="搜索题号/标题..." value="${this.searchQuery}" oninput="App.handleSearch(this.value)">
            </div>
          </div>` : ''}
          <div class="selection-stats">
            <span>已选 <strong>${this.selected.length}</strong> 道</span>
            <span class="stat-sep">|</span>
            <span>新题 <strong>${newCount}</strong>/2 道</span>
            ${!isPhase1 ? `<span class="stat-sep">|</span><span>剩余可选 <strong>${18 - this.selected.filter(id => (this.stats[id]?.selectedCount || 0) >= 1).length}</strong> 道</span>` : ''}
          </div>
          <div class="problem-grid" id="problemGrid">
            ${displayProblems.map(p => this.renderProblemCard(p)).join("") || '<p style="color:var(--text-secondary);text-align:center;padding:40px">🎉 所有题目都已被选择过！点击下方按钮进入全部题目选择。</p>'}
          </div>
          <div class="selection-footer">
            ${isPhase1 ? `
              <button class="btn-primary" onclick="App.finishPhase1()" ${newCount < 2 ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
                继续选择（已选 ${newCount} 道新题）→
              </button>` : `
              <button class="btn-secondary" onclick="App.selectionPhase=0;App.renderSelection()">返回新题选择</button>
              <button class="btn-primary" id="submitSelection" onclick="App.submitSelection()">确认题单（共 ${this.selected.length} 道）</button>
            `}
          </div>
        </main>
      </div>
    `;
    this._restoreScroll();
  },

  finishPhase1() {
    const newCount = this.selected.filter(id => (this.stats[id]?.selectedCount || 0) < 1).length;
    if (newCount < 2) { alert(`至少选择2道新题目（当前${newCount}道）`); return; }
    this.selectionPhase = 1;
    this.renderSelection();
  },

  renderProblemCard(p) {
    const stat = this.stats[p.nowcoder_id] || {};
    const isNew = (stat.selectedCount || 0) < 1;
    const isSelected = this.selected.includes(p.nowcoder_id);
    const tags = p.tags || [];
    return `
      <div class="problem-card glass-card ${isSelected ? 'selected' : ''} ${isNew ? 'new-problem' : ''}" onclick="App.toggleProblem('${p.nowcoder_id}')">
        <div class="prob-header">
          <span class="prob-id">#${p.nowcoder_id}</span>
          ${isNew ? '<span class="new-badge">新题</span>' : ''}
          ${isSelected ? '<span class="new-badge" style="background:rgba(45,212,191,0.2);color:var(--accent)">已选</span>' : ''}
        </div>
        <div class="prob-title">${p.title}</div>
        <div class="prob-tags">
          ${tags.length ? tags.map(t => `<span class="prob-tag">${t}</span>`).join("") : '<span class="prob-tag no-tag">未分类</span>'}
        </div>
        <div class="prob-stats">
          <span>被选 ${stat.selectedCount || 0} 次</span>
          <span>完成 ${stat.completedCount || 0} 次</span>
        </div>
      </div>
    `;
  },

  getFilteredProblems() {
    let list = this.problems;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(p => p.nowcoder_id.includes(q) || p.title.toLowerCase().includes(q));
    }
    if (this.filterTag !== "全部") {
      list = list.filter(p => (p.tags || []).includes(this.filterTag));
    }
    return list;
  },

  getAllTags() {
    const tags = new Set();
    this.problems.forEach(p => (p.tags || []).forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  },

  setFilter(tag) {
    this.filterTag = tag;
    this.renderSelection();
  },

  handleSearch(query) {
    this.searchQuery = query;
    // 仅刷新题目网格，避免整页 re-render 导致搜索框失焦
    this.renderProblemGridOnly('selection');
  },

  toggleProblem(id) {
    const idx = this.selected.indexOf(id);
    if (idx >= 0) { this.selected.splice(idx, 1); }
    else {
      const isNew = (this.stats[id]?.selectedCount || 0) < 1;
      const newCount = this.selected.filter(pid => (this.stats[pid]?.selectedCount || 0) < 1).length;
      if (isNew) {
        this.selected.push(id);
      } else {
        const existingCount = this.selected.filter(pid => (this.stats[pid]?.selectedCount || 0) >= 1).length;
        if (existingCount >= 18) { alert("最多选择18道非新题"); return; }
        this.selected.push(id);
      }
    }
    if (this.selected.length > 20) { this.selected.pop(); alert("最多20道题"); }
    this.renderSelection();
  },

  async submitSelection() {
    const newCount = this.selected.filter(id => (this.stats[id]?.selectedCount || 0) < 1).length;
    if (newCount < 2) { alert(`至少选择2道新题目（当前${newCount}道）`); return; }
    if (this.selected.length < 5) { alert("至少选择5道题目"); return; }

    const btn = document.getElementById("submitSelection");
    if (btn) { btn.disabled = true; btn.classList.add("loading"); }

    try {
      await Api.createDailyTasks(this.selected);
      this.todayTasks = { problems: this.selected, completed: [] };
      await this.loadData();
      this.selected = [];
      this.renderTodayTasks();
    } catch (e) {
      alert(e.message);
    }
    if (btn) { btn.disabled = false; btn.classList.remove("loading"); }
  },

  // ==================== 今日题单 ====================
  renderTodayTasks() {
    if (!this.todayTasks) { this.renderSelection(); return; }
    this._saveScroll();

    const tasks = this.todayTasks;
    const total = tasks.problems.length;
    const doneCount = tasks.completed.length;
    const pct = Math.round(doneCount / total * 100);
    const allDone = doneCount >= total;

    const el = document.getElementById("view-dashboard");
    el.innerHTML = `
      <div class="app-layout">
        ${this.getNavHTML('today')}
        <main class="app-main">
          <div class="section-header" style="display:flex;align-items:center;gap:20px">
            <div class="progress-ring-wrapper">
              <div class="progress-ring" style="--progress:${pct}">
                <span class="progress-text">${pct}%</span>
              </div>
            </div>
            <div>
              <h2>${allDone ? '🎉 今日已完成' : '今日题单'}</h2>
              <p style="color:var(--text-secondary);font-size:14px;margin-top:4px">${doneCount}/${total} 已完成</p>
            </div>
          </div>
          <div class="problem-grid">
            ${tasks.problems.map(id => this.renderTaskCard(id, tasks.completed.includes(id))).join("")}
          </div>
        </main>
      </div>
    `;
    this._restoreScroll();
  },

  renderTaskCard(id, done) {
    const p = this.problems.find(pp => pp.nowcoder_id === id);
    if (!p) return "";
    const stat = this.stats[id] || {};
    return `
      <div class="problem-card glass-card ${done ? 'completed' : ''}" style="cursor:pointer" onclick="App.markDone('${id}')">
        <div class="prob-header">
          <span class="prob-id">#${id}</span>
          ${done ? '<span class="done-badge">已完成</span>' : '<span class="pending-badge">待完成</span>'}
        </div>
        <div class="prob-title">${p.title}</div>
        <div class="prob-tags">${(p.tags || []).map(t => `<span class="prob-tag">${t}</span>`).join("")}</div>
        <button class="mark-done-btn" onclick="event.stopPropagation();App.markDone('${id}')">
          ${done ? '↩ 标记未完成' : '✓ 标记完成'}
        </button>
      </div>
    `;
  },

  async markDone(problemId) {
    try {
      const result = await Api.completeProblem(problemId);
      this.todayTasks.completed = result.completed;
      await this.loadData();
      this.renderTodayTasks();
    } catch (e) { alert(e.message); }
  },

  // ==================== 题库浏览 ====================
  renderBank() {
    this._saveScroll();
    this._currentView = 'renderBank';
    const tags = this.getAllTags();
    const el = document.getElementById("view-dashboard");
    el.innerHTML = `
      <div class="app-layout">
        ${this.getNavHTML('bank')}
        <main class="app-main">
          <div class="section-header"><h2>题库浏览</h2><p>共 ${this.problems.length} 道题目</p></div>
          <div class="filter-bar">
            <div class="filter-tags" id="viewFilterTags">
              <button class="tag-btn ${this.filterTag === '全部' ? 'active' : ''}" onclick="App.setFilterView('全部')">全部</button>
              ${tags.map(t => `<button class="tag-btn ${this.filterTag === t ? 'active' : ''}" onclick="App.setFilterView('${t}')">${t}</button>`).join("")}
            </div>
            <div class="search-box">
              <input class="input-field" placeholder="搜索..." value="${this.searchQuery}" oninput="App.searchView(this.value)">
            </div>
          </div>
          <div class="problem-grid">
            ${this.getFilteredProblems().map(p => this.renderStatCard(p)).join("")}
          </div>
        </main>
      </div>
    `;
    this._restoreScroll();
  },

  renderStatCard(p) {
    const stat = this.stats[p.nowcoder_id] || {};
    const inToday = this.todayTasks && this.todayTasks.problems.includes(p.nowcoder_id);
    return `
      <div class="problem-card glass-card ${inToday ? 'selected' : ''}">
        <div class="prob-header">
          <span class="prob-id">#${p.nowcoder_id}</span>
          ${inToday ? '<span class="new-badge" style="background:rgba(45,212,191,0.2);color:var(--accent)">已选</span>' : ''}
        </div>
        <div class="prob-title">${p.title}</div>
        <div class="prob-tags">${(p.tags || []).map(t => `<span class="prob-tag">${t}</span>`).join("") || '<span class="prob-tag no-tag">未分类</span>'}</div>
        <div class="prob-stats"><span>被选 ${stat.selectedCount || 0} 次</span><span>完成 ${stat.completedCount || 0} 次</span></div>
      </div>
    `;
  },

  setFilterView(tag) { this.filterTag = tag; this.renderBank(); },
  searchView(q) { this.searchQuery = q; this.renderProblemGridOnly('bank'); },

  // 只刷新题目网格（避免搜索/过滤时输入框失焦）
  renderProblemGridOnly(context) {
    const grid = document.getElementById("problemGrid");
    if (!grid) return;
    const list = this.getFilteredProblems();
    const emptyHtml = '<p style="color:var(--text-secondary);text-align:center;padding:40px">🎉 没有匹配的题目</p>';
    if (context === 'bank') {
      grid.innerHTML = list.map(p => this.renderStatCard(p)).join("") || emptyHtml;
    } else {
      grid.innerHTML = list.map(p => this.renderProblemCard(p)).join("") || emptyHtml;
    }
  },

  // ==================== 历史记录 ====================
  async renderHistory() {
    this._saveScroll();
    this._currentView = 'renderHistory';
    let history = [];
    try { history = await Api.getTaskHistory(); } catch (e) { }
    const el = document.getElementById("view-dashboard");
    el.innerHTML = `
      <div class="app-layout">
        ${this.getNavHTML('history')}
        <main class="app-main">
          <div class="section-header"><h2>历史记录</h2></div>
          ${history.length === 0 ? '<div class="empty-state">暂无历史记录</div>' : history.map(t => {
      const tTotal = t.problems.length;
      const pct = tTotal > 0 ? Math.round(t.completed.length / tTotal * 100) : 0;
      return `
              <div class="history-card glass-card">
                <div class="history-header">
                  <h4>${t.task_date}</h4>
                  <span class="history-progress">${pct}% (${t.completed.length}/${t.problems.length})</span>
                </div>
                <div class="progress-bar-wrapper">
                  <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                </div>
                <div class="history-problems">
                  ${t.problems.map(id => {
        const prob = this.problems.find(p => p.nowcoder_id === id);
        const done = t.completed.includes(id);
        return `<span class="history-prob ${done ? 'done' : ''}">#${id} ${prob?.title || ''}</span>`;
      }).join("")}
                </div>
              </div>
            `;
    }).join("")}
        </main>
      </div>
    `;
    this._restoreScroll();
  },

  // ==================== 个人信息 ====================
  renderProfile() {
    this._saveScroll();
    this._currentView = 'renderProfile';
    const groupInfo = this.user.group || "未分组";
    const avatarUrl = this.user.avatarUrl || "";
    const el = document.getElementById("view-dashboard");
    el.innerHTML = `
      <div class="app-layout">
        ${this.getNavHTML('profile')}
        <main class="app-main">
          <div class="section-header"><h2>个人信息</h2></div>
          <div class="profile-card glass-card">
            <div class="profile-avatar-section">
              <div class="profile-avatar-large" id="profileAvatarPreview">${avatarUrl ? `<img src="${avatarUrl}" alt="avatar">` : this.user.name[0]}</div>
              <div class="profile-avatar-actions">
                <input type="file" id="avatarFileInput" accept="image/*" style="display:none" onchange="App.handleAvatarFile(event)">
                <button class="btn-small" onclick="document.getElementById('avatarFileInput').click()">选择图片文件</button>
                <span style="font-size:11px;color:var(--text-secondary)">支持 JPG/PNG（自动压缩至 200x200）</span>
                <input type="text" id="avatarUrlInput" class="input-field" placeholder="或输入头像图片URL" value="${avatarUrl}" style="width:260px;font-size:13px;margin-top:6px">
                <button class="btn-small" onclick="App.saveAvatarUrl()">保存URL</button>
              </div>
            </div>
            <div class="profile-details">
              <div class="profile-row"><span class="p-label">姓名</span><span>${this.user.name}</span></div>
              <div class="profile-row"><span class="p-label">手机号</span><span>${this.user.phone}</span></div>
              <div class="profile-row"><span class="p-label">身份</span><span>${this.user.isLeader ? '组长' : '学员'}</span></div>
              <div class="profile-row"><span class="p-label">小组</span><span>${groupInfo}</span></div>
            </div>
          </div>
        </main>
      </div>
    `;
    this._restoreScroll();
  },

  handleAvatarFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("请选择图片文件"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = Math.min(200, img.width, img.height);
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
        const base64 = canvas.toDataURL("image/jpeg", 0.7);
        this.saveAvatarDataUrl(base64);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  },

  async saveAvatarDataUrl(dataUrl) {
    try {
      await Api.updateAvatar(dataUrl);
      this.user.avatarUrl = dataUrl;
      const preview = document.getElementById("profileAvatarPreview");
      if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="avatar">`;
      alert("头像已更新");
    } catch (e) { alert(e.message); }
  },

  async saveAvatarUrl() {
    const url = document.getElementById("avatarUrlInput").value.trim();
    try {
      await Api.updateAvatar(url);
      this.user.avatarUrl = url;
      alert("头像已更新");
      this.renderProfile();
    } catch (e) { alert(e.message); }
  },

  // ==================== 小组展示 (OPT4) ====================
  async loadGroup() {
    try {
      const data = await Api.getGroupDetail();
      const el = document.getElementById("groupPageContent");
      if (el) {
        App.renderGroupContent(data);
      }
    } catch (e) {
      const el = document.getElementById("groupPageContent");
      if (el) {
        el.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:40px">${e.message}</p>`;
      }
    }
  },

  async renderGroup() {
    this._saveScroll();
    this._currentView = 'renderGroup';
    const el = document.getElementById("view-dashboard");
    el.innerHTML = `<div class="app-layout">
      ${this.getNavHTML('group')}
      <main class="app-main">
        <div class="section-header"><h2>小组展示</h2></div>
        <div id="groupPageContent" class="glass-card" style="padding:24px"><p style="text-align:center;color:var(--text-secondary)">加载中...</p></div>
      </main>
    </div>`;
    try {
      const data = await Api.getGroupDetail();
      App.renderGroupContent(data);
    } catch (e) {
      document.getElementById("groupPageContent").innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:40px">${e.message}</p>`;
    }
    this._restoreScroll();
  },

  renderGroupContent(data) {
    const el = document.getElementById("groupPageContent");
    const rankMedals = ['🥇', '🥈', '🥉'];
    let rows = data.members.map((m, i) => {
      const medal = i < 3 ? rankMedals[i] : '';
      return `<tr class="group-rank-row ${m.isLeader ? 'leader-row' : ''}">
        <td>${medal} ${i + 1}</td>
        <td><strong>${m.name}</strong>${m.isLeader ? ' <span class="new-badge" style="background:rgba(255,193,7,0.2);color:#ffc107">组长</span>' : ''}</td>
        <td>${m.total}</td>
        <td>${m.done}</td>
        <td>
          <div class="progress-bar"><div class="progress-fill" style="width:${m.rate}%"></div></div>
          <span style="font-size:12px;color:var(--text-secondary)">${m.rate}%</span>
        </td>
      </tr>`;
    }).join("");

    el.innerHTML = `
      <div class="group-page-content">
        <div class="group-header" style="margin-bottom:20px">
          <h3 style="margin:0">${data.groupName}</h3>
          <p style="color:var(--text-secondary);margin:4px 0 0">组长: ${data.members.find(m => m.isLeader)?.name || "暂无"}</p>
        </div>
        <div class="table-wrapper" style="overflow-x:auto">
          <table class="data-table group-rank-table">
            <thead><tr><th>排名</th><th>姓名</th><th>总题数</th><th>已完成</th><th>完成率</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  handleLogout() {
    Auth.logout();
    this.showView("login");
    this.selected = [];
    this.todayTasks = null;
    this.renderLogin();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  App.renderLogin();
});
