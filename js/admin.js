// HIU-ACM 管理端 - 使用 Cloudflare Worker API
const Admin = {
  dashboard: null,
  page: "dashboard",

  async init() {
    this.showView("admin");
    this.renderLayout();
    this.renderDashboard();
  },

  showView(view) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`view-${view}`).classList.remove("hidden");
  },

  renderLayout() {
    const el = document.getElementById("view-admin");
    el.innerHTML = `
      <div class="app-layout admin-nav">
        <nav class="app-nav">
          <div class="nav-brand"><span>HIU-ACM</span> <span class="admin-badge">管理端</span></div>
          <div class="nav-links">
            <a class="nav-link" id="nav-dashboard" onclick="Admin.switchPage('dashboard')">数据面板</a>
            <a class="nav-link" id="nav-users" onclick="Admin.switchPage('users')">用户管理</a>
            <a class="nav-link" id="nav-groups" onclick="Admin.switchPage('groups')">组织管理</a>
            <a class="nav-link" id="nav-logs" onclick="Admin.switchPage('logs')">登录日志</a>
            <a class="nav-link" id="nav-settings" onclick="Admin.switchPage('settings')">系统设置</a>
          </div>
          <div class="nav-user">
            <button class="theme-toggle" onclick="App.toggleTheme()" title="切换亮/暗模式">${App.getThemeIcon()}</button>
            <span class="nav-user-name">系统管理员</span>
            <button class="btn-text" onclick="Admin.handleLogout()">退出</button>
          </div>
        </nav>
        <main class="app-main" id="adminContent"></main>
      </div>
    `;
  },

  switchPage(page) {
    this.page = page;
    document.querySelectorAll(".nav-link").forEach(a => a.classList.remove("active"));
    const nav = document.getElementById(`nav-${page}`);
    if (nav) nav.classList.add("active");
    this[`render${page.charAt(0).toUpperCase() + page.slice(1)}`]();
  },

  // ==================== 数据面板 ====================
  async renderDashboard() {
    const content = document.getElementById("adminContent");
    content.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-secondary)">加载中...</div>';
    try { this.dashboard = await Api.adminDashboard(); } catch (e) { content.innerHTML = `<div class="empty-state">加载失败: ${e.message}</div>`; return; }

    const d = this.dashboard;
    content.innerHTML = `
      <div class="admin-dashboard">
        <h2>数据总览</h2>
        <div class="stat-cards">
          <div class="stat-card glass-card"><div class="stat-number">${d.userCount}</div><div class="stat-label">学员总数</div></div>
          <div class="stat-card glass-card"><div class="stat-number">${d.groupCount}</div><div class="stat-label">小组数</div></div>
          <div class="stat-card glass-card"><div class="stat-number">${d.problemCount}</div><div class="stat-label">题库</div></div>
          <div class="stat-card glass-card"><div class="stat-number">${d.todayStats.total}</div><div class="stat-label">今日已选题单</div></div>
          <div class="stat-card glass-card"><div class="stat-number">${d.todayStats.completed}</div><div class="stat-label">今日已完成</div></div>
          <div class="stat-card glass-card"><div class="stat-number">${Math.round(d.todayStats.total > 0 ? d.todayStats.completed / d.todayStats.total * 100 : 0)}%</div><div class="stat-label">今日完成率</div></div>
        </div>

        <div class="dashboard-grid">
          <div class="dash-section glass-card">
            <h3>完成率排行</h3>
            <table class="data-table">
              <thead><tr><th>排名</th><th>姓名</th><th>已完成</th><th>总计</th><th>完成率</th></tr></thead>
              <tbody>
                ${d.ranking.map((r, i) => `
                  <tr>
                    <td>#${i+1}</td>
                    <td>${r.name}</td>
                    <td>${r.done}</td>
                    <td>${r.total}</td>
                    <td><span class="rate-badge ${r.rate>=80?'high':r.rate>=50?'mid':'low'}">${r.rate}%</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <div class="dash-section glass-card">
            <h3>小组统计</h3>
            <table class="data-table">
              <thead><tr><th>小组</th><th>人数</th><th>完成率</th><th>进度</th></tr></thead>
              <tbody>
                ${d.groupStats.map(g => `
                  <tr>
                    <td>${g.name}</td><td>${g.memberCount}</td>
                    <td><span class="rate-badge ${g.rate>=80?'high':g.rate>=50?'mid':'low'}">${g.rate}%</span></td>
                    <td><div class="mini-progress"><div class="mini-fill" style="width:${g.rate}%"></div></div></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <div class="dash-section glass-card">
            <h3>热门题目 TOP10</h3>
            <table class="data-table">
              <thead><tr><th>ID</th><th>标题</th><th>被选</th><th>完成</th></tr></thead>
              <tbody>
                ${d.hotProblems.map(p => `
                  <tr><td>#${p.problem_id}</td><td>${p.title}</td><td>${p.selected_count}</td><td>${p.completed_count}</td></tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <div class="dash-section glass-card">
            <h3>今日题单详情</h3>
            <table class="data-table">
              <thead><tr><th>学员</th><th>题目数</th><th>已完成</th></tr></thead>
              <tbody>
                ${d.todayDetails.map(t => `
                  <tr><td>${t.name}</td><td>${t.problems.length}</td><td>${t.completed.length}</td></tr>
                `).join("")}
                ${d.todayDetails.length === 0 ? '<tr><td colspan="3" class="empty-text">今日暂无题单</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // ==================== 用户管理 ====================
  async renderUsers() {
    const content = document.getElementById("adminContent");
    content.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-secondary)">加载中...</div>';
    let users = [];
    try { users = await Api.adminUsers(); } catch (e) { content.innerHTML = `<div class="empty-state">加载失败: ${e.message}</div>`; return; }

    content.innerHTML = `
      <div class="admin-section">
        <h2>用户管理</h2>
        <div class="section-toolbar">
          <button class="btn-primary" onclick="Admin.showAddUser()">+ 添加用户</button>
          <button class="btn-primary" onclick="Admin.showBatchImport()">+ 批量导入</button>
        </div>
        <div id="batchImportPanel"></div>
        <div style="overflow-x:auto">
          <table class="data-table full-width">
            <thead>
              <tr><th>手机号</th><th>姓名</th><th>校验码类型</th><th>有效期</th><th>注册时间</th><th>操作</th></tr>
            </thead>
            <tbody id="usersTableBody">
              ${users.map(u => `
                <tr id="user-row-${u.phone}">
                  <td>${u.phone}</td>
                  <td>${u.name}</td>
                  <td>${u.codeType === 'temporary' ? '临时' : '永久'}</td>
                  <td>${u.codeExpiry || '-'}</td>
                  <td>${(u.createdAt||'').slice(0,10)}</td>
                  <td class="action-cell">
                    <button class="btn-small" onclick="Admin.showEditUser('${u.phone}','${u.name}','${u.codeType}')">编辑</button>
                    <button class="btn-small" onclick="Admin.showUserTasks('${u.phone}','${u.name}')">题单</button>
                    <button class="btn-small btn-danger" onclick="Admin.deleteUser('${u.phone}')">删除</button>
                  </td>
                </tr>
              `).join("")}
              ${users.length === 0 ? '<tr><td colspan="6" class="empty-text">暂无用户</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        <div id="editUserPanel" class="edit-panel"></div>
        <div id="userTasksPanel" class="edit-panel"></div>
      </div>
    `;
  },

  showAddUser() {
    const panel = document.getElementById("editUserPanel");
    if (!panel) return;
    panel.innerHTML = `
      <div class="edit-form glass-card">
        <h3>添加用户</h3>
        <div class="input-group"><label class="input-label">手机号</label><input id="newPhone" class="input-field" placeholder="11位手机号"></div>
        <div class="input-group"><label class="input-label">姓名</label><input id="newName" class="input-field" placeholder="姓名"></div>
        <div class="input-group"><label class="input-label">校验码</label><input id="newCode" class="input-field" placeholder="默认123456"></div>
        <div class="form-actions">
          <button class="btn-primary" onclick="Admin.addUser()">确认添加</button>
          <button class="btn-secondary" onclick="document.getElementById('editUserPanel').innerHTML=''">取消</button>
        </div>
      </div>
    `;
  },

  async addUser() {
    const phone = document.getElementById("newPhone").value.trim();
    const name = document.getElementById("newName").value.trim();
    const code = document.getElementById("newCode").value.trim() || "123456";
    if (!phone || !name) { alert("手机号和姓名不能为空"); return; }
    if (!/^\d{11}$/.test(phone)) { alert("请输入11位手机号"); return; }
    try {
      await Api.adminCreateUser({ phone, name, code, codeType: "permanent" });
      document.getElementById("editUserPanel").innerHTML = '<p style="color:var(--success);padding:10px">添加成功</p>';
      setTimeout(() => this.renderUsers(), 500);
    } catch (e) { alert(e.message); }
  },

  showEditUser(phone, name, codeType) {
    const panel = document.getElementById("editUserPanel");
    if (!panel) return;
    panel.innerHTML = `
      <div class="edit-form glass-card">
        <h3>编辑用户 - ${phone}</h3>
        <div class="input-group"><label class="input-label">姓名</label><input id="editName" class="input-field" value="${name}"></div>
        <div class="input-group"><label class="input-label">新校验码（留空不修改）</label><input id="editCode" class="input-field" placeholder="输入新校验码"></div>
        <div class="input-group">
          <label class="input-label">校验码类型</label>
          <select id="editCodeType" class="input-field">
            <option value="permanent" ${codeType==='permanent'?'selected':''}>永久</option>
            <option value="temporary" ${codeType==='temporary'?'selected':''}>临时</option>
          </select>
        </div>
        <div class="input-group"><label class="input-label">临时有效期（临时类型必填）</label><input id="editExpiry" class="input-field" type="datetime-local"></div>
        <div class="form-actions">
          <button class="btn-primary" onclick="Admin.saveUser('${phone}')">保存</button>
          <button class="btn-secondary" onclick="document.getElementById('editUserPanel').innerHTML=''">取消</button>
        </div>
      </div>
    `;
  },

  async saveUser(phone) {
    const data = {};
    const name = document.getElementById("editName").value.trim();
    const code = document.getElementById("editCode").value.trim();
    const codeType = document.getElementById("editCodeType").value;
    const expiry = document.getElementById("editExpiry").value;
    if (name) data.name = name;
    if (code) data.code = code;
    data.codeType = codeType;
    if (codeType === "temporary" && expiry) data.codeExpiry = expiry;
    try {
      await Api.adminUpdateUser(phone, data);
      alert("保存成功");
      this.renderUsers();
    } catch (e) { alert(e.message); }
  },

  async deleteUser(phone) {
    if (!confirm(`确定删除用户 ${phone} ？`)) return;
    try {
      await Api.adminDeleteUser(phone);
      this.renderUsers();
    } catch (e) { alert(e.message); }
  },

  async showUserTasks(phone, name) {
    const panel = document.getElementById("userTasksPanel");
    if (!panel) return;
    panel.innerHTML = '<div style="padding:10px;color:var(--text-secondary)">加载中...</div>';
    try {
      const tasks = await Api.adminUserTasks(phone);
      const safeTasks = Array.isArray(tasks) ? tasks : [];
      panel.innerHTML = `
        <div class="edit-form glass-card" style="max-width:780px">
          <h3>${name} 的题单记录</h3>
          <div style="margin-bottom:12px">
            <button class="btn-small" onclick="Admin.batchCompleteAll('${phone}')">一键标记所选完成</button>
            <button class="btn-small" onclick="Admin.selectAllProblems('${phone}')">全选</button>
            <button class="btn-small" onclick="Admin.deselectAllProblems('${phone}')">取消全选</button>
          </div>
          ${safeTasks.length === 0 ? '<p class="empty-text">暂无记录</p>' : safeTasks.map(t => `
            <div class="task-record" style="margin-bottom:12px;padding:12px;background:var(--surface-subtle);border-radius:8px">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <strong>${t.task_date || '-'}</strong>
                <span>${(t.completed || []).length}/${(t.problems || []).length}</span>
              </div>
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">
                ${(t.problems || []).map(id => `
                  <span style="display:inline-flex;align-items:center;gap:2px;margin-right:8px;margin-bottom:4px">
                    <label class="task-check-label" style="cursor:pointer;color:${(t.completed || []).includes(id)?'var(--success)':'inherit'}">
                      <input type="checkbox" class="task-prob-check" value="${id}" data-date="${t.task_date}" ${(t.completed || []).includes(id)?'disabled':''}>
                      #${id}
                    </label>
                    <button class="btn-small btn-danger" style="padding:1px 6px;font-size:10px;line-height:1.4" onclick="Admin.deleteTaskProblem('${phone}','${t.task_date}',${id})" title="删除此题">×</button>
                  </span>
                `).join("")}
              </div>
            </div>
          `).join("")}
          <button class="btn-secondary" style="margin-top:8px" onclick="document.getElementById('userTasksPanel').innerHTML=''">关闭</button>
        </div>
      `;
    } catch (e) { panel.innerHTML = `<p style="color:var(--danger)">加载失败: ${e.message}</p>`; }
  },

  selectAllProblems(phone) {
    document.querySelectorAll('.task-prob-check:not([disabled])').forEach(cb => cb.checked = true);
  },
  deselectAllProblems(phone) {
    document.querySelectorAll('.task-prob-check:not([disabled])').forEach(cb => cb.checked = false);
  },

  async batchCompleteAll(phone) {
    const checked = document.querySelectorAll('.task-prob-check:checked');
    if (checked.length === 0) { alert("请先勾选题目"); return; }
    // 按日期分组
    const byDate = {};
    checked.forEach(cb => {
      const date = cb.dataset.date;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(parseInt(cb.value));
    });
    try {
      let totalSuccess = 0, totalSkipped = 0;
      for (const [date, ids] of Object.entries(byDate)) {
        const res = await Api.adminCompleteAll(phone, ids, date);
        totalSuccess += res.success.length;
        totalSkipped += res.skipped.length;
      }
      alert(`完成 ${totalSuccess} 题${totalSkipped > 0 ? `，跳过 ${totalSkipped} 题（已标记）` : ''}`);
      this.showUserTasks(phone, "");
    } catch (e) { alert(e.message); }
  },

  async deleteTaskProblem(phone, taskDate, problemId) {
    if (!confirm(`确定删除 ${phone} 在 ${taskDate} 的题目 #${problemId}?`)) return;
    try {
      await Api.adminDeleteTaskProblem(phone, taskDate, problemId);
      this.showUserTasks(phone, "");
    } catch (e) { alert(e.message); }
  },

  // ==================== 组织管理 ====================
  async renderGroups() {
    const content = document.getElementById("adminContent");
    content.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-secondary)">加载中...</div>';
    let groups = [];
    try { groups = await Api.adminGroups(); } catch (e) { content.innerHTML = `<div class="empty-state">加载失败: ${e.message}</div>`; return; }

    content.innerHTML = `
      <div class="admin-section">
        <h2>组织管理</h2>
        <div class="section-toolbar">
          <button class="btn-primary" onclick="Admin.showAddGroup()">+ 新建小组</button>
        </div>
        <div class="group-cards">
          ${groups.map(g => `
            <div class="group-card glass-card">
              <h3>${g.name}</h3>
              <div class="group-info">
                <p>组长: <strong>${g.leader_phone || '未设置'}</strong></p>
                <p>成员: ${g.members.map(m => `${m.phone}(${m.name})`).join(" / ") || '无'}</p>
                <p>人数: <strong>${g.members.length}</strong></p>
              </div>
              <div class="group-actions">
                <button class="btn-small" onclick="Admin.editGroup(${JSON.stringify(g).replace(/"/g,'&quot;')})">编辑</button>
              </div>
            </div>
          `).join("")}
          ${groups.length === 0 ? '<div class="empty-state">暂无小组</div>' : ''}
        </div>
        <div id="groupEditPanel" class="edit-panel"></div>
      </div>
    `;
  },

  async showAddGroup() {
    const panel = document.getElementById("groupEditPanel");
    if (!panel) return;
    let users = [];
    try { users = await Api.adminUsersSimple(); } catch (e) { /* ignore */ }
    const uOpts = users.map(u => `<option value="${u.phone}">${u.name} (${u.phone})</option>`).join("");
    panel.innerHTML = `
      <div class="edit-form glass-card">
        <h3>新建小组</h3>
        <div class="input-group"><label class="input-label">小组名称</label><input id="newGroupName" class="input-field" placeholder="如：第四组"></div>
        <div class="input-group"><label class="input-label">组长</label><select id="newGroupLeader" class="input-field"><option value="">-- 选择组长 --</option>${uOpts}</select></div>
        <div class="input-group"><label class="input-label">组员（可多选）</label><select id="newGroupMembers" class="input-field" multiple style="min-height:120px">${uOpts}</select></div>
        <div class="form-actions">
          <button class="btn-primary" onclick="Admin.createGroup()">确认创建</button>
          <button class="btn-secondary" onclick="document.getElementById('groupEditPanel').innerHTML=''">取消</button>
        </div>
      </div>
    `;
  },

  async createGroup() {
    const name = document.getElementById("newGroupName").value.trim();
    const leader = document.getElementById("newGroupLeader").value;
    const sel = document.getElementById("newGroupMembers");
    const memberPhones = Array.from(sel.selectedOptions).map(o => o.value);
    if (!name) { alert("请输入小组名称"); return; }
    try {
      await Api.adminCreateGroup({ name, leaderPhone: leader, memberPhones });
      alert("创建成功");
      this.renderGroups();
    } catch (e) { alert(e.message); }
  },

  async editGroup(g) {
    const panel = document.getElementById("groupEditPanel");
    if (!panel) return;
    let users = [];
    try { users = await Api.adminUsersSimple(); } catch (e) { /* ignore */ }
    const uOpts = users.map(u => `<option value="${u.phone}" ${g.members.some(m=>m.phone===u.phone)?'selected':''}>${u.name} (${u.phone})</option>`).join("");
    panel.innerHTML = `
      <div class="edit-form glass-card">
        <h3>编辑小组 - ${g.name}</h3>
        <div class="input-group"><label class="input-label">小组名称</label><input id="editGroupName" class="input-field" value="${g.name}"></div>
        <div class="input-group"><label class="input-label">组长</label><select id="editGroupLeader" class="input-field"><option value="">-- 选择组长 --</option>${users.map(u => `<option value="${u.phone}" ${u.phone===g.leader_phone?'selected':''}>${u.name} (${u.phone})</option>`).join("")}</select></div>
        <div class="input-group"><label class="input-label">组员（可多选）</label><select id="editGroupMembers" class="input-field" multiple style="min-height:120px">${uOpts}</select></div>
        <div class="form-actions">
          <button class="btn-primary" onclick="Admin.saveGroup(${g.id})">保存</button>
          <button class="btn-danger" onclick="Admin.deleteGroup(${g.id},'${g.name}')">删除小组</button>
          <button class="btn-secondary" onclick="document.getElementById('groupEditPanel').innerHTML=''">取消</button>
        </div>
      </div>
    `;
  },

  async saveGroup(id) {
    const name = document.getElementById("editGroupName").value.trim();
    const leaderPhone = document.getElementById("editGroupLeader").value;
    const sel = document.getElementById("editGroupMembers");
    const memberPhones = Array.from(sel.selectedOptions).map(o => o.value);
    try {
      await Api.adminUpdateGroup(id, { name, leaderPhone, memberPhones });
      alert("保存成功");
      this.renderGroups();
    } catch (e) { alert(e.message); }
  },

  async deleteGroup(id, name) {
    if (!confirm(`确定要删除小组「${name}」吗？`)) return;
    try {
      await Api.adminDeleteGroup(id);
      alert("已删除");
      this.renderGroups();
    } catch (e) { alert(e.message); }
  },
  // ==================== 登录日志 ====================
  async renderLogs() {
    const content = document.getElementById("adminContent");
    content.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-secondary)">加载中...</div>';
    let logs = [];
    try { logs = await Api.adminLoginLogs(); } catch (e) { content.innerHTML = `<div class="empty-state">加载失败: ${e.message}</div>`; return; }

    content.innerHTML = `
      <div class="admin-section">
        <h2>登录日志</h2>
        <div style="overflow-x:auto">
          <table class="data-table full-width">
            <thead><tr><th>手机号</th><th>IP</th><th>归属地</th><th>设备</th><th>登录时间</th><th></th></tr></thead>
            <tbody>
              ${logs.map((l,i) => `
                <tr class="log-row" onclick="Admin.toggleLogDetail(${i})" style="cursor:pointer">
                  <td>${l.phone}</td>
                  <td>${l.ip || '-'}</td>
                  <td>${l.region || '-'}</td>
                  <td>${l.device || '-'}</td>
                  <td>${l.loginAt || '-'}</td>
                  <td style="font-size:12px;color:var(--text-secondary)">▸</td>
                </tr>
                <tr class="log-detail-row" id="logDetail_${i}" style="display:none">
                  <td colspan="6" style="padding:12px 16px;background:var(--log-detail-bg);border-bottom:1px solid var(--border)">
                    <div style="display:grid;gap:6px;font-size:12px;color:var(--text-secondary)">
                      <div><strong>手机号:</strong> ${l.phone}</div>
                      <div><strong>IP:</strong> ${l.ip}</div>
                      <div><strong>归属地:</strong> ${l.region}</div>
                      <div><strong>设备:</strong> ${l.device}</div>
                      <div><strong>登录时间:</strong> ${l.loginAt}</div>
                      <div style="color:var(--text-secondary);word-break:break-all"><strong>UA:</strong> ${l.userAgent || '-'}</div>
                    </div>
                    <button class="btn-small" style="margin-top:8px" onclick="event.stopPropagation();Admin.viewUserLogs('${l.phone}')">查看该用户全部日志</button>
                  </td>
                </tr>
              `).join("")}
              ${logs.length === 0 ? '<tr><td colspan="6" class="empty-text">暂无记录</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  toggleLogDetail(i) {
    const row = document.getElementById("logDetail_" + i);
    if (row) row.style.display = row.style.display === "none" ? "" : "none";
  },

  async viewUserLogs(phone) {
    const content = document.getElementById("adminContent");
    content.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-secondary)">加载中...</div>';
    try {
      const logs = await Api.adminUserLoginLogs(phone);
      content.innerHTML = `
        <div class="admin-section">
          <h2>用户 ${phone} 的登录日志</h2>
          <button class="btn-secondary" style="margin-bottom:12px" onclick="Admin.renderLogs()">← 返回全部日志</button>
          <div style="overflow-x:auto">
            <table class="data-table full-width">
              <thead><tr><th>IP</th><th>归属地</th><th>设备</th><th>登录时间</th><th>User-Agent</th></tr></thead>
              <tbody>
                ${logs.map(l => `
                  <tr>
                    <td>${l.ip}</td>
                    <td>${l.region}</td>
                    <td>${l.device}</td>
                    <td>${l.loginAt}</td>
                    <td class="ua-cell" title="${(l.userAgent||'').replace(/"/g,'')}">${l.userAgent || '-'}</td>
                  </tr>
                `).join("")}
                ${logs.length === 0 ? '<tr><td colspan="5" class="empty-text">暂无记录</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (e) { content.innerHTML = `<div class="empty-state">加载失败: ${e.message}</div>`; }
  },

  // ==================== 系统设置 ====================
  async renderSettings() {
    const content = document.getElementById("adminContent");
    content.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-secondary)">加载中...</div>';
    let settings = {};
    try { settings = await Api.adminSettings(); } catch (e) { content.innerHTML = `<div class="empty-state">加载失败: ${e.message}</div>`; return; }

    content.innerHTML = `
      <div class="admin-section">
        <h2>系统设置</h2>
        <div class="settings-card glass-card">
          <div class="setting-item">
            <label>管理员密码</label>
            <div class="setting-input-row">
              <input id="setAdminPwd" type="password" class="input-field" placeholder="输入新密码">
              <button class="btn-primary" onclick="Admin.saveSettings()">修改密码</button>
            </div>
          </div>
          <div class="setting-item">
            <label>每日必选题数</label>
            <input id="setMandatory" type="number" class="input-field" value="${settings.daily_mandatory_count || '2'}" style="width:100px">
          </div>
          <div class="setting-item">
            <label>每日最大自选题数</label>
            <input id="setMaxRandom" type="number" class="input-field" value="${settings.daily_max_random || '18'}" style="width:100px">
          </div>
          <div class="setting-item">
            <label>新题阈值（被选次数<此值）</label>
            <input id="setThreshold" type="number" class="input-field" value="${settings.mandatory_threshold || '1'}" style="width:100px">
          </div>
          <button class="btn-primary" onclick="Admin.saveSettings()">保存设置</button>
        </div>
      </div>
    `;
  },

  async saveSettings() {
    const settings = {};
    const pwd = document.getElementById("setAdminPwd");
    if (pwd && pwd.value) settings.admin_password = pwd.value;
    const mandatory = document.getElementById("setMandatory");
    if (mandatory) settings.daily_mandatory_count = mandatory.value;
    const maxRandom = document.getElementById("setMaxRandom");
    if (maxRandom) settings.daily_max_random = maxRandom.value;
    const threshold = document.getElementById("setThreshold");
    if (threshold) settings.mandatory_threshold = threshold.value;
    try {
      await Api.adminUpdateSettings(settings);
      alert("保存成功");
      if (pwd) pwd.value = "";
    } catch (e) { alert(e.message); }
  },

  showBatchImport() {
    const panel = document.getElementById("batchImportPanel");
    panel.innerHTML = `
      <div class="edit-form glass-card" style="max-width:700px">
        <h3>批量导入用户</h3>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px">粘贴表格数据，每行一个用户：手机号,姓名,校验码,小组名（逗号或制表符分隔）</p>
        <textarea id="batchImportText" class="input-field" rows="8" placeholder="13800001111,张三,123456,第一组&#10;13800002222,李四,123456,第一组&#10;13800003333,王五,123456,第二组" style="font-family:monospace;font-size:13px"></textarea>
        <div class="form-actions" style="margin-top:12px">
          <button class="btn-primary" onclick="Admin.executeBatchImport()">确认导入</button>
          <button class="btn-secondary" onclick="document.getElementById('batchImportPanel').innerHTML=''">取消</button>
        </div>
      </div>
    `;
  },

  async executeBatchImport() {
    const text = document.getElementById("batchImportText").value.trim();
    if (!text) { alert("请输入数据"); return; }
    const lines = text.split("\n").filter(l => l.trim());
    const users = lines.map(line => {
      const parts = line.split(/[\t,]/).map(s => s.trim());
      return { phone: parts[0]||"", name: parts[1]||"", code: parts[2]||"", group_name: parts[3]||"" };
    });
    try {
      const result = await Api.adminBatchUsers(users);
      alert(`导入完成: 成功 ${result.success.length} 人，失败 ${result.failed.length} 人`);
      if (result.failed.length > 0) {
        console.log("失败详情:", result.failed);
      }
      document.getElementById("batchImportPanel").innerHTML = "";
      this.renderUsers();
    } catch (e) { alert(e.message); }
  },

  handleLogout() {
    Auth.logout();
    document.getElementById("view-admin").classList.add("hidden");
    document.getElementById("view-login").classList.remove("hidden");
    App.renderLogin();
  }
};
