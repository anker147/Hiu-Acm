// HIU-ACM 用户端 - 使用 Cloudflare Worker API
const App = {
  problems: [],
  stats: {},
  todayTasks: null,
  selected: [],
  showNewOnly: false,
  filterTag: "全部",
  searchQuery: "",

  async init() {
    Api.init();
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

  async loadData() {
    const [problems, stats, todayTasks, me] = await Promise.all([
      Api.getProblems(),
      Api.getProblemStats(),
      Api.getTodayTasks(),
      Api.getMe().catch(() => null)
    ]);
    this.problems = problems;
    const statMap = {};
    for (const s of stats) statMap[s.problem_id] = s;
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
                <input type="text" id="loginPhone" class="input-field" placeholder="输入手机号 或 admin" autocomplete="off" style="padding-left:40px">
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
          <p class="login-footer">管理员使用 admin + 密码登录</p>
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

  // ==================== 仪表盘 ====================
  renderDashboard() {
    if (this.todayTasks) return this.renderTodayTasks();
    this.renderSelection();
  },

  renderSelection() {
    const el = document.getElementById("view-dashboard");
    const tags = this.getAllTags();
    el.innerHTML = `
      <div class="app-layout">
        <nav class="app-nav">
          <div class="nav-brand"><span style="font-size:20px">🏠</span> HIU-ACM</div>
          <div class="nav-links">
            <a class="nav-link active" onclick="App.renderSelection()">选择题单</a>
            <a class="nav-link" onclick="App.renderBank()">题库浏览</a>
            <a class="nav-link" onclick="App.renderHistory()">历史记录</a>
            <a class="nav-link" onclick="App.renderProfile()">个人信息</a>
          </div>
          <div class="nav-user">
            <div class="nav-user-avatar">${this.user.name[0]}</div>
            <span class="nav-user-name">${this.user.name}</span>
            <button class="btn-text" onclick="App.handleLogout()">退出</button>
          </div>
        </nav>
        <main class="app-main">
          <div class="section-header">
            <h2>设置今日题单</h2>
            <p>首次登录，请选择今日要完成的题目</p>
          </div>
          <div class="selection-rules glass-card">
            <h3>📋 选择规则</h3>
            <ul>
              <li>必须选择 <strong>2 道</strong>「被选择次数 < 1」的新题目</li>
              <li>可额外选择 <strong>3-18 道</strong>任意题目</li>
              <li>总共 5-20 道题目作为今日待完成题单</li>
            </ul>
          </div>
          <div class="filter-bar">
            <div class="filter-tags">
              <button class="tag-btn ${this.filterTag === '全部' ? 'active' : ''}" onclick="App.setFilter('全部')">全部</button>
              ${tags.map(t => `<button class="tag-btn ${this.filterTag === t ? 'active' : ''}" onclick="App.setFilter('${t}')">${t}</button>`).join("")}
            </div>
            <div class="search-box">
              <input class="input-field" placeholder="搜索题号/标题..." value="${this.searchQuery}" oninput="App.handleSearch(this.value)">
            </div>
          </div>
          <div class="selection-stats">
            <span>已选 <strong>${this.selected.length}</strong> 道</span>
            <span class="stat-sep">|</span>
            <span>新题 <strong>${this.selected.filter(id => (this.stats[id]?.selectedCount || 0) < 1).length}</strong>/2 道</span>
            <span class="stat-sep">|</span>
            <span>剩余可选 <strong>${18 - this.selected.filter(id => (this.stats[id]?.selectedCount || 0) >= 1).length}</strong> 道</span>
          </div>
          <div class="problem-grid" id="problemGrid">
            ${this.getFilteredProblems().map(p => this.renderProblemCard(p)).join("")}
          </div>
          <div class="selection-footer">
            <button class="btn-primary" id="submitSelection" onclick="App.submitSelection()">确认题单</button>
          </div>
        </main>
      </div>
    `;
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
    this.renderSelection();
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
    if (this.selected.length > 20) { this.selected.shift(); alert("最多20道题"); }
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

    const tasks = this.todayTasks;
    const total = tasks.problems.length;
    const doneCount = tasks.completed.length;
    const pct = Math.round(doneCount / total * 100);
    const allDone = doneCount >= total;

    const el = document.getElementById("view-dashboard");
    el.innerHTML = `
      <div class="app-layout">
        <nav class="app-nav">
          <div class="nav-brand"><span style="font-size:20px">🏠</span> HIU-ACM</div>
          <div class="nav-links">
            <a class="nav-link active" onclick="App.renderTodayTasks()">今日题单</a>
            <a class="nav-link" onclick="App.renderBank()">题库浏览</a>
            <a class="nav-link" onclick="App.renderHistory()">历史记录</a>
            <a class="nav-link" onclick="App.renderProfile()">个人信息</a>
          </div>
          <div class="nav-user">
            <div class="nav-user-avatar">${this.user.name[0]}</div>
            <span class="nav-user-name">${this.user.name}</span>
            <button class="btn-text" onclick="App.handleLogout()">退出</button>
          </div>
        </nav>
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
    const tags = this.getAllTags();
    const el = document.getElementById("view-dashboard");
    el.innerHTML = `
      <div class="app-layout">
        <nav class="app-nav">
          <div class="nav-brand"><span style="font-size:20px">🏠</span> HIU-ACM</div>
          <div class="nav-links">
            <a class="nav-link" onclick="App.renderTodayTasksOrSelection()">${this.todayTasks ? '今日题单' : '选择题单'}</a>
            <a class="nav-link active" onclick="App.renderBank()">题库浏览</a>
            <a class="nav-link" onclick="App.renderHistory()">历史记录</a>
            <a class="nav-link" onclick="App.renderProfile()">个人信息</a>
          </div>
          <div class="nav-user">
            <div class="nav-user-avatar">${this.user.name[0]}</div>
            <span class="nav-user-name">${this.user.name}</span>
            <button class="btn-text" onclick="App.handleLogout()">退出</button>
          </div>
        </nav>
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
  },

  renderStatCard(p) {
    const stat = this.stats[p.nowcoder_id] || {};
    // BUG1: 题库浏览中标记已选题
    const inToday = this.todayTasks && this.todayTasks.problems.includes(p.nowcoder_id);
    return `
      <div class="problem-card glass-card ${inToday ? 'selected' : ''}">
        <div class="prob-header">
          <span class="prob-id">#${p.nowcoder_id}</span>
          ${inToday ? '<span class="new-badge" style="background:rgba(45,212,191,0.2);color:var(--accent)">已选</span>' : ''}
        </div>
        <div class="prob-title">${p.title}</div>
        <div class="prob-tags">${(p.tags || []).map(t => `<span class="prob-tag">${t}</span>`).join("") || '<span class="prob-tag no-tag">未分类</span>'}</div>
        <div class="prob-stats"><span>被选 ${stat.selectedCount||0} 次</span><span>完成 ${stat.completedCount||0} 次</span></div>
      </div>
    `;
  },

  setFilterView(tag) { this.filterTag = tag; this.renderBank(); },
  searchView(q) { this.searchQuery = q; this.renderBank(); },
  renderTodayTasksOrSelection() {
    if (this.todayTasks) this.renderTodayTasks();
    else this.renderSelection();
  },

  // ==================== 历史记录 ====================
  async renderHistory() {
    let history = [];
    try { history = await Api.getTaskHistory(); } catch (e) {}
    const el = document.getElementById("view-dashboard");
    el.innerHTML = `
      <div class="app-layout">
        <nav class="app-nav">
          <div class="nav-brand"><span style="font-size:20px">🏠</span> HIU-ACM</div>
          <div class="nav-links">
            <a class="nav-link" onclick="App.renderTodayTasksOrSelection()">${this.todayTasks ? '今日题单' : '选择题单'}</a>
            <a class="nav-link" onclick="App.renderBank()">题库浏览</a>
            <a class="nav-link active" onclick="App.renderHistory()">历史记录</a>
            <a class="nav-link" onclick="App.renderProfile()">个人信息</a>
          </div>
          <div class="nav-user">
            <div class="nav-user-avatar">${this.user.name[0]}</div>
            <span class="nav-user-name">${this.user.name}</span>
            <button class="btn-text" onclick="App.handleLogout()">退出</button>
          </div>
        </nav>
        <main class="app-main">
          <div class="section-header"><h2>历史记录</h2></div>
          ${history.length === 0 ? '<div class="empty-state">暂无历史记录</div>' : history.map(t => {
            const pct = Math.round(t.completed.length / t.problems.length * 100);
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
  },

  // ==================== 个人信息 ====================
  renderProfile() {
    const groupInfo = this.user.group || "未分组";
    const avatarUrl = this.user.avatarUrl || "";
    const el = document.getElementById("view-dashboard");
    el.innerHTML = `
      <div class="app-layout">
        <nav class="app-nav">
          <div class="nav-brand"><span style="font-size:20px">🏠</span> HIU-ACM</div>
          <div class="nav-links">
            <a class="nav-link" onclick="App.renderTodayTasksOrSelection()">${this.todayTasks ? '今日题单' : '选择题单'}</a>
            <a class="nav-link" onclick="App.renderBank()">题库浏览</a>
            <a class="nav-link" onclick="App.renderHistory()">历史记录</a>
            <a class="nav-link" onclick="App.renderGroup()">小组展示</a>
            <a class="nav-link active" onclick="App.renderProfile()">个人信息</a>
          </div>
          <div class="nav-user">
            <div class="nav-user-avatar">${this.user.name[0]}</div>
            <span class="nav-user-name">${this.user.name}</span>
            <button class="btn-text" onclick="App.handleLogout()">退出</button>
          </div>
        </nav>
        <main class="app-main">
          <div class="section-header"><h2>个人信息</h2></div>
          <div class="profile-card glass-card">
            <div class="profile-avatar-section">
              <div class="profile-avatar-large">${avatarUrl ? `<img src="${avatarUrl}" alt="avatar">` : this.user.name[0]}</div>
              <div class="profile-avatar-actions">
                <input type="text" id="avatarUrlInput" class="input-field" placeholder="输入头像图片URL" value="${avatarUrl}" style="width:260px;font-size:13px">
                <button class="btn-small" onclick="App.saveAvatar()">保存头像</button>
                <span style="font-size:11px;color:var(--text-secondary)">支持任意图片URL</span>
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
  },

  async saveAvatar() {
    const url = document.getElementById("avatarUrlInput").value.trim();
    try {
      await Api.updateAvatar(url);
      this.user.avatarUrl = url;
      alert("头像已更新");
      this.renderProfile();
    } catch (e) { alert(e.message); }
  },

  // ==================== 小组展示 (OPT4) ====================
  async renderGroup() {
    const el = document.getElementById("view-dashboard");
    el.innerHTML = `<div class="app-layout">
      <nav class="app-nav">
        <div class="nav-brand"><span style="font-size:20px">🏠</span> HIU-ACM</div>
        <div class="nav-links">
          <a class="nav-link" onclick="App.renderTodayTasksOrSelection()">${this.todayTasks ? '今日题单' : '选择题单'}</a>
          <a class="nav-link" onclick="App.renderBank()">题库浏览</a>
          <a class="nav-link" onclick="App.renderHistory()">历史记录</a>
          <a class="nav-link active" onclick="App.renderGroup()">小组展示</a>
          <a class="nav-link" onclick="App.renderProfile()">个人信息</a>
        </div>
        <div class="nav-user">
          <div class="nav-user-avatar">${this.user.name[0]}</div>
          <span class="nav-user-name">${this.user.name}</span>
          <button class="btn-text" onclick="App.handleLogout()">退出</button>
        </div>
      </nav>
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
          <p style="color:var(--text-secondary);margin:4px 0 0">组长: ${data.members.find(m=>m.isLeader)?.name||"暂无"}</p>
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
