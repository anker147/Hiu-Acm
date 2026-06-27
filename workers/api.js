// HIU-ACM 集训管理系统 Cloudflare Worker API
// 部署: wrangler deploy

// ==================== 工具函数 ====================
let JWT_SECRET = "hiu-acm-2026-secret-key-change-in-production";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// 北京时间工具函数（Cloudflare Worker 运行在 UTC）
function beijingDateStr() {
  const d = new Date(Date.now() + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}
function beijingTime() {
  const d = new Date(Date.now() + 8 * 3600000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}
function beijingTimeISO() {
  const d = new Date(Date.now() + 8 * 3600000);
  return d.toISOString().replace("Z", "+08:00");
}
// IP 归属地查询 — 多源 fallback，提升稳定性
// 顺序：ip-api.com（中文）→ ipapi.co（英文）→ "未知"
async function ipToLocation(ip) {
  if (!ip) return "未知";
  // 内网 IP
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/.test(ip)) return "局域网";

  // 源 1：ip-api.com（429/限制较严但中文友好）
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data.status === "success") {
        return [data.country, data.regionName, data.city].filter(Boolean).join("-") || "未知";
      }
    }
  } catch { /* 继续尝试 fallback */ }

  // 源 2：ipapi.co（HTTPS，英文，无中文但稳定）
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && !data.error && data.country_name) {
        return [data.country_name, data.region, data.city].filter(Boolean).join("-") || "未知";
      }
    }
  } catch { /* 继续尝试 fallback */ }

  return "未知";
}
// UA 解析设备类型（简短，用于 device 列）
function parseUA(ua) {
  if (!ua) return "未知设备";
  const s = ua.toLowerCase();
  if (s.includes("iphone") || s.includes("ipad")) return "iOS设备";
  if (s.includes("android")) return "Android设备";
  if (s.includes("windows nt")) return "Windows电脑";
  if (s.includes("mac os")) return "Mac电脑";
  if (s.includes("linux")) return "Linux设备";
  if (s.includes("micromessenger")) return "微信内置浏览器";
  if (s.includes("chrome")) return "Chrome浏览器";
  if (s.includes("firefox")) return "Firefox浏览器";
  if (s.includes("safari")) return "Safari浏览器";
  return "其他设备";
}

// UA 详细解析：返回 { os, browser, device }，组合成易读字符串
function parseUADetail(ua) {
  if (!ua) return { os: "未知", browser: "未知", device: "未知" };
  const s = ua.toLowerCase();
  // OS
  let os = "未知";
  if (s.includes("windows nt 10")) os = "Windows 10/11";
  else if (s.includes("windows nt 6.3")) os = "Windows 8.1";
  else if (s.includes("windows nt 6.2")) os = "Windows 8";
  else if (s.includes("windows nt 6.1")) os = "Windows 7";
  else if (s.includes("windows")) os = "Windows";
  else if (s.includes("iphone") || s.includes("ipad")) {
    const m = ua.match(/OS (\d+[_\d]*)/i);
    os = "iOS " + (m ? m[1].replace(/_/g, ".") : "?");
  }
  else if (s.includes("android")) {
    const m = ua.match(/Android (\d+[\.\d]*)/i);
    os = "Android " + (m ? m[1] : "?");
  }
  else if (s.includes("mac os x")) {
    const m = ua.match(/Mac OS X (\d+[_\d]*)/i);
    os = "macOS " + (m ? m[1].replace(/_/g, ".") : "?");
  }
  else if (s.includes("mac os")) os = "macOS";
  else if (s.includes("linux")) os = "Linux";
  // Browser
  let browser = "未知";
  if (s.includes("micromessenger")) browser = "微信内置";
  else if (s.includes("edg/")) browser = "Edge";
  else if (s.includes("chrome/") && !s.includes("chromium")) browser = "Chrome";
  else if (s.includes("firefox/")) browser = "Firefox";
  else if (s.includes("safari/") && !s.includes("chrome")) browser = "Safari";
  else if (s.includes("opr/") || s.includes("opera")) browser = "Opera";
  // Browser version
  let browserVer = "";
  if (browser === "Chrome") { const m = ua.match(/Chrome\/([\d.]+)/); if (m) browserVer = m[1]; }
  else if (browser === "Edge") { const m = ua.match(/Edg\/([\d.]+)/); if (m) browserVer = m[1]; }
  else if (browser === "Firefox") { const m = ua.match(/Firefox\/([\d.]+)/); if (m) browserVer = m[1]; }
  else if (browser === "Safari") { const m = ua.match(/Version\/([\d.]+)/); if (m) browserVer = m[1]; }
  // Device
  let device = "桌面端";
  if (s.includes("iphone")) device = "iPhone";
  else if (s.includes("ipad")) device = "iPad";
  else if (s.includes("android")) {
    if (s.includes("mobile")) device = "Android手机";
    else device = "Android平板";
  }
  else if (s.includes("mobile")) device = "移动设备";
  return {
    os,
    browser: browser + (browserVer ? " " + browserVer.split(".").slice(0, 2).join(".") : ""),
    device,
    summary: `${device} / ${os} / ${browser}`
  };
}

async function hmacSign(payload, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function createJWT(phone, isAdmin) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "");
  const payload = btoa(JSON.stringify({ phone, isAdmin: !!isAdmin, exp: Math.floor(Date.now() / 1000) + 86400 })).replace(/=/g, "");
  const sig = await hmacSign(`${header}.${payload}`, JWT_SECRET);
  return `${header}.${payload}.${sig}`;
}

async function verifyJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const expectedSig = await hmacSign(`${parts[0]}.${parts[1]}`, JWT_SECRET);
    if (expectedSig !== parts[2]) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function auth(request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return verifyJWT(authHeader.slice(7));
}

// ==================== 路由处理 ====================

async function handleLogin(db, body) {
  const { phone, code } = body;
  if (!phone || !code) return err("手机号和校验码不能为空");

  // 管理员登录
  if (phone === "admin") {
    const setting = await db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password_hash'").first();
    const codeHash = await sha256(code);
    if (!setting || setting.value !== codeHash) return err("管理员密码错误", 401);

    // 确保管理员用户存在
    let admin = await db.prepare("SELECT * FROM users WHERE phone = 'admin'").first();
    if (!admin) {
      await db.prepare("INSERT INTO users (phone, name, is_admin) VALUES ('admin', '系统管理员', 1)").run();
    }

    const token = await createJWT("admin", true);
    return json({ token, user: { phone: "admin", name: "系统管理员", isAdmin: true } });
  }

  // 学员登录
  const user = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(phone).first();
  if (!user) return err("用户不存在", 404);

  const codeHash = await sha256(code);
  if (user.code_hash !== codeHash) return err("校验码错误", 401);

  if (user.code_type === "temporary" && user.code_expiry) {
    const expiryBeijing = new Date(user.code_expiry + "T00:00:00+08:00");
    const nowBeijing = new Date(Date.now() + 8 * 3600000);
    if (expiryBeijing < nowBeijing) return err("临时校验码已过期", 401);
  }

  const token = await createJWT(phone, false);
  return json({ token, user: { phone: user.phone, name: user.name, isAdmin: false, avatarUrl: user.avatar_url } });
}

async function handleMe(db, authPayload, method, body) {
  if (method === "PUT") {
    const { avatarUrl } = body;
    if (avatarUrl !== undefined) {
      await db.prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE phone = ?")
        .bind(avatarUrl, authPayload.phone).run();
    }
    return json({ success: true });
  }

  const user = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(authPayload.phone).first();
  if (!user) return err("用户不存在", 404);

  // 查询小组信息
  let groupName = null, isLeader = false;
  const memberRow = await db.prepare(
    "SELECT gm.group_id, g.name as group_name, g.leader_phone FROM group_members gm JOIN groups_table g ON gm.group_id = g.id WHERE gm.phone = ?"
  ).bind(authPayload.phone).first();
  if (memberRow) {
    groupName = memberRow.group_name;
    isLeader = (memberRow.leader_phone === authPayload.phone);
  }

  return json({
    phone: user.phone, name: user.name, isAdmin: !!user.isAdmin,
    avatarUrl: user.avatar_url, codeType: user.code_type,
    group: groupName, isLeader
  });
}

async function handleGetProblems(db) {
  const problems = await db.prepare("SELECT * FROM problems ORDER BY cast(nowcoder_id as integer)").all();
  return json(problems.results.map(p => ({
    ...p, tags: JSON.parse(p.tags || "[]")
  })));
}

async function handleGetProblemStats(db) {
  const stats = await db.prepare(
    "SELECT ps.*, p.title FROM problem_stats ps JOIN problems p ON ps.problem_id = p.nowcoder_id ORDER BY cast(ps.problem_id as integer)"
  ).all();
  return json(stats.results);
}

async function handleGetDailyTasks(db, authPayload) {
  const today = beijingDateStr();
  const task = await db.prepare(
    "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
  ).bind(authPayload.phone, today).first();
  if (!task) return json(null);
  return json({
    ...task, problems: JSON.parse(task.problems), completed: JSON.parse(task.completed)
  });
}

async function handleCreateDailyTasks(db, authPayload, body) {
  const { problemIds } = body;
  if (!problemIds || !Array.isArray(problemIds)) return err("题目列表无效");
  if (problemIds.length < 5 || problemIds.length > 20) return err("题目数量需在5-20之间");

  const today = beijingDateStr();

  // 检查是否已有今日题单
  const existing = await db.prepare(
    "SELECT id FROM daily_tasks WHERE phone = ? AND task_date = ?"
  ).bind(authPayload.phone, today).first();
  if (existing) return err("今日题单已设置");

  // 检查2道必选题（被选择次数<1）
  const stats = await db.prepare("SELECT problem_id, selected_count FROM problem_stats").all();
  const statMap = {};
  for (const s of stats.results) statMap[s.problem_id] = s.selected_count;
  const newProblems = problemIds.filter(id => (statMap[id] || 0) < 1);
  if (newProblems.length < 2) return err(`至少选择2道新题目（当前只选了${newProblems.length}道）`);

  // 创建题单
  const problems = JSON.stringify(problemIds);
  const completed = JSON.stringify([]);
  await db.prepare(
    "INSERT INTO daily_tasks (phone, task_date, problems, completed) VALUES (?, ?, ?, ?)"
  ).bind(authPayload.phone, today, problems, completed).run();

  // 更新题目被选次数
  for (const pid of problemIds) {
    await db.prepare(
      "INSERT INTO problem_stats (problem_id, selected_count, completed_count) VALUES (?, 1, 0) ON CONFLICT(problem_id) DO UPDATE SET selected_count = selected_count + 1"
    ).bind(pid).run();
  }

  return json({ success: true, problemIds });
}

async function handleCompleteProblem(db, authPayload, body) {
  const { problemId, taskDate } = body;
  if (problemId === undefined || problemId === null) return err("题目ID不能为空");
  const pid = String(problemId); // 统一字符串比较
  const date = taskDate || beijingDateStr();

  const task = await db.prepare(
    "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
  ).bind(authPayload.phone, date).first();
  if (!task) return err("未找到题单");

  const problems = JSON.parse(task.problems).map(id => String(id));
  if (!problems.includes(pid)) return err("该题目不在题单中");

  let completed = JSON.parse(task.completed).map(id => String(id));
  if (completed.includes(pid)) {
    // 取消完成：移除并减计数
    completed = completed.filter(id => id !== pid);
  } else {
    // 新标记完成：先加入列表
    completed = [...completed, pid];
  }

  await db.prepare("UPDATE daily_tasks SET completed = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(completed), task.id).run();

  // 更新题目完成统计（仅在首次标记完成时递增）
  const oldCompleted = JSON.parse(task.completed).map(id => String(id));
  if (!oldCompleted.includes(pid)) {
    // 新标记完成 → 递增
    await db.prepare(
      "UPDATE problem_stats SET completed_count = completed_count + 1 WHERE problem_id = ?"
    ).bind(pid).run();
  } else {
    // 取消完成 → 递减（不低于0）
    await db.prepare(
      "UPDATE problem_stats SET completed_count = MAX(0, completed_count - 1) WHERE problem_id = ?"
    ).bind(pid).run();
  }

  return json({ completed });
}

async function handleGetTaskHistory(db, authPayload, url) {
  const params = new URL(url).searchParams;
  const limit = parseInt(params.get("limit") || "30");
  const tasks = await db.prepare(
    "SELECT * FROM daily_tasks WHERE phone = ? ORDER BY task_date DESC LIMIT ?"
  ).bind(authPayload.phone, limit).all();
  return json(tasks.results.map(t => ({
    ...t, problems: JSON.parse(t.problems), completed: JSON.parse(t.completed)
  })));
}

// ==================== 小组展示（用户端） ====================

async function handleGroupDetail(db, authPayload) {
  const memberRow = await db.prepare(
    "SELECT gm.group_id, g.name as group_name, g.leader_phone FROM group_members gm JOIN groups_table g ON gm.group_id = g.id WHERE gm.phone = ?"
  ).bind(authPayload.phone).first();
  if (!memberRow) return err("未加入任何小组", 404);

  const members = await db.prepare(
    "SELECT gm.phone, u.name FROM group_members gm JOIN users u ON gm.phone = u.phone WHERE gm.group_id = ?"
  ).bind(memberRow.group_id).all();

  // 每个成员的完成统计
  const memberStats = [];
  for (const m of members.results) {
    const tasks = await db.prepare(
      "SELECT problems, completed FROM daily_tasks WHERE phone = ?"
    ).bind(m.phone).all();
    let total = 0, done = 0;
    for (const t of tasks.results) {
      total += JSON.parse(t.problems).length;
      done += JSON.parse(t.completed).length;
    }
    memberStats.push({
      phone: m.phone, name: m.name,
      total, done,
      rate: total > 0 ? Math.round(done / total * 100) : 0,
      isLeader: m.phone === memberRow.leader_phone
    });
  }
  memberStats.sort((a, b) => b.rate - a.rate);

  return json({
    groupId: memberRow.group_id,
    groupName: memberRow.group_name,
    leaderPhone: memberRow.leader_phone,
    isLeader: memberRow.leader_phone === authPayload.phone,
    members: memberStats
  });
}

// ==================== 管理端接口 ====================

async function handleAdminDashboard(db) {
  const [userCount, groupCount, problemCount] = await Promise.all([
    db.prepare("SELECT COUNT(*) as c FROM users WHERE is_admin = 0").first(),
    db.prepare("SELECT COUNT(*) as c FROM groups_table").first(),
    db.prepare("SELECT COUNT(*) as c FROM problems").first(),
  ]);

  const today = beijingDateStr();

  // 一次性并行拉取所有用户、全部题单、全部小组、全部成员关系，避免 N+1 查询
  const [allUsers, allTasks, allGroups, allMembers] = await Promise.all([
    db.prepare("SELECT phone, name FROM users WHERE is_admin = 0").all(),
    db.prepare("SELECT phone, task_date, problems, completed FROM daily_tasks").all(),
    db.prepare("SELECT id, name, leader_phone FROM groups_table").all(),
    db.prepare("SELECT group_id, phone FROM group_members").all(),
  ]);

  // 预解析题单，按手机号分组
  const tasksByPhone = {};
  for (const t of allTasks.results) {
    if (!tasksByPhone[t.phone]) tasksByPhone[t.phone] = [];
    tasksByPhone[t.phone].push({
      task_date: t.task_date,
      problems: JSON.parse(t.problems),
      completed: JSON.parse(t.completed)
    });
  }

  // 用户名映射
  const userName = {};
  for (const u of allUsers.results) userName[u.phone] = u.name;

  // 完成率排行
  const ranking = allUsers.results.map(u => {
    const tasks = tasksByPhone[u.phone] || [];
    let total = 0, done = 0;
    for (const t of tasks) { total += t.problems.length; done += t.completed.length; }
    return { phone: u.phone, name: u.name, total, done, rate: total > 0 ? Math.round(done / total * 100) : 0 };
  });
  ranking.sort((a, b) => b.rate - a.rate);

  // 今日统计 + 今日题单详情（从已聚合数据中筛当日）
  const todayTasks = [];
  for (const u of allUsers.results) {
    const tasks = tasksByPhone[u.phone] || [];
    for (const t of tasks) {
      if (t.task_date === today) {
        todayTasks.push({ phone: u.phone, problems: t.problems, completed: t.completed });
      }
    }
  }
  const todayStats = { total: todayTasks.length, completed: 0 };
  for (const t of todayTasks) {
    if (t.completed.length >= t.problems.length) todayStats.completed++;
  }
  const todayDetails = todayTasks.map(t => ({
    phone: t.phone, name: userName[t.phone] || t.phone,
    problems: t.problems, completed: t.completed
  }));

  // 小组统计
  const membersByGroup = {};
  for (const m of allMembers.results) {
    if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
    membersByGroup[m.group_id].push(m.phone);
  }
  const groupStats = allGroups.results.map(g => {
    const members = membersByGroup[g.id] || [];
    let total = 0, done = 0;
    for (const phone of members) {
      const tasks = tasksByPhone[phone] || [];
      for (const t of tasks) { total += t.problems.length; done += t.completed.length; }
    }
    return { id: g.id, name: g.name, memberCount: members.length, total, done, rate: total > 0 ? Math.round(done / total * 100) : 0 };
  });

  // 热门题目
  const hotProblems = await db.prepare(
    "SELECT ps.*, p.title FROM problem_stats ps JOIN problems p ON ps.problem_id = p.nowcoder_id ORDER BY ps.selected_count DESC LIMIT 10"
  ).all();

  return json({
    userCount: userCount.c, groupCount: groupCount.c, problemCount: problemCount.c,
    todayStats, ranking, groupStats, hotProblems: hotProblems.results, todayDetails
  });
}

async function handleAdminUsers(db, method, url, body) {
  // 安全获取 pathname：url 可能是 URL 对象或字符串
  const pathname = url instanceof URL ? url.pathname : new URL(url).pathname;
  const pathParts = pathname.split("/").filter(Boolean);
  // pathParts: ["api","admin","users", ...]

  // 正则快速匹配子路由（problemId 用 [^\/]+ 兼容非纯数字题号）
  const problemsMatch = pathname.match(/\/api\/admin\/users\/([^\/]+)\/tasks\/([^\/]+)\/problems\/([^\/]+)\/?$/);
  const tasksOnlyMatch = pathname.match(/\/api\/admin\/users\/([^\/]+)\/tasks\/([^\/]+)\/?$/);
  const tasksListMatch = pathname.match(/\/api\/admin\/users\/([^\/]+)\/tasks\/?$/);
  const accountMatch = pathname.match(/\/api\/admin\/users\/([^\/]+)\/account\/?$/);
  const completeAllMatch = pathname.match(/\/api\/admin\/users\/([^\/]+)\/complete-all\/?$/);
  const batchDeleteMatch = pathname.match(/\/api\/admin\/users\/([^\/]+)\/tasks\/batch-delete\/?$/);

  // 排除特殊路径词
  const specialPaths = ["users", "simple", "batch", "tasks", "complete-all"];
  const userId = (() => {
    if (pathParts.length < 4) return null;
    const last = pathParts[pathParts.length - 1];
    if (!last || specialPaths.includes(last)) return null;
    return last;
  })();

  // ==================== DELETE 路由（优先匹配，避免 userId 干扰） ====================

  // DELETE 删除题单中某道题: /api/admin/users/:phone/tasks/:date/problems/:id
  if (method === "DELETE" && problemsMatch) {
    const targetPhone = problemsMatch[1];
    const taskDate = problemsMatch[2];
    const problemId = problemsMatch[3]; // 保持字符串，与 daily_tasks.problems 存储类型一致
    if (!taskDate || !targetPhone || !problemId) return err("参数不完整", 400);

    const task = await db.prepare(
      "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
    ).bind(targetPhone, taskDate).first();
    if (!task) return err("未找到题单", 404);

    // 统一转为字符串比较，避免 "1001" !== 1001 的类型陷阱
    let problems = JSON.parse(task.problems).map(id => String(id));
    let completed = JSON.parse(task.completed).map(id => String(id));
    const wasCompleted = completed.includes(problemId);
    problems = problems.filter(id => id !== problemId);
    completed = completed.filter(id => id !== problemId);

    if (problems.length === 0) {
      await db.prepare("DELETE FROM daily_tasks WHERE id = ?").bind(task.id).run();
    } else {
      await db.prepare("UPDATE daily_tasks SET problems = ?, completed = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(problems), JSON.stringify(completed), task.id).run();
    }

    await db.prepare(
      "UPDATE problem_stats SET selected_count = MAX(0, selected_count - 1), completed_count = MAX(0, completed_count - ?) WHERE problem_id = ?"
    ).bind(wasCompleted ? 1 : 0, problemId).run();

    return json({ success: true, removed: problemId, wasCompleted });
  }

  // DELETE 清空某天全部题单: /api/admin/users/:phone/tasks/:date
  if (method === "DELETE" && tasksOnlyMatch) {
    const targetPhone = tasksOnlyMatch[1];
    const taskDate = tasksOnlyMatch[2];
    if (!taskDate || !targetPhone) return err("参数不完整", 400);
    const result = await db.prepare("DELETE FROM daily_tasks WHERE phone = ? AND task_date = ?")
      .bind(targetPhone, taskDate).run();
    return json({ success: true, phone: targetPhone, taskDate, deleted: result.meta?.changes || 0 });
  }

  // DELETE 删除账号: /api/admin/users/:phone/account
  if (method === "DELETE" && accountMatch) {
    const targetPhone = accountMatch[1];
    if (!targetPhone) return err("参数不完整", 400);
    await db.prepare("DELETE FROM daily_tasks WHERE phone = ?").bind(targetPhone).run();
    await db.prepare("DELETE FROM group_members WHERE phone = ?").bind(targetPhone).run();
    await db.prepare("DELETE FROM login_logs WHERE phone = ?").bind(targetPhone).run();
    await db.prepare("DELETE FROM users WHERE phone = ?").bind(targetPhone).run();
    return json({ success: true, phone: targetPhone });
  }

  // ==================== GET 路由 ====================

  // GET 用户题单列表: /api/admin/users/:phone/tasks
  if (method === "GET" && tasksListMatch) {
    const tasksPhone = tasksListMatch[1];
    const tasks = await db.prepare(
      "SELECT * FROM daily_tasks WHERE phone = ? ORDER BY task_date DESC"
    ).bind(tasksPhone).all();
    return json(tasks.results.map(t => ({
      ...t, problems: JSON.parse(t.problems), completed: JSON.parse(t.completed)
    })));
  }

  // GET 用户列表
  if (method === "GET" && !userId) {
    if (pathParts.includes("simple")) {
      const users = await db.prepare("SELECT phone, name FROM users WHERE is_admin = 0 ORDER BY name").all();
      return json(users.results);
    }
    const users = await db.prepare("SELECT * FROM users WHERE is_admin = 0 ORDER BY created_at DESC").all();
    return json(users.results.map(u => ({
      phone: u.phone, name: u.name, codeType: u.code_type,
      codeExpiry: u.code_expiry, avatarUrl: u.avatar_url, createdAt: u.created_at
    })));
  }

  // GET 单个用户
  if (method === "GET" && userId) {
    const user = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(userId).first();
    if (!user) return err("用户不存在", 404);
    return json({
      phone: user.phone, name: user.name, codeType: user.code_type,
      codeExpiry: user.code_expiry, avatarUrl: user.avatar_url, createdAt: user.created_at
    });
  }

  // ==================== POST 路由 ====================

  if (method === "POST") {
    // 批量导入
    if (pathParts.includes("batch")) {
      const users = body;
      if (!Array.isArray(users) || users.length === 0) return err("用户列表不能为空");
      const results = { success: [], failed: [] };
      for (const u of users) {
        const { phone, name, code, group_name } = u;
        if (!phone || !name) { results.failed.push({ phone, reason: "手机号或姓名为空" }); continue; }
        try {
          const existing = await db.prepare("SELECT phone FROM users WHERE phone = ?").bind(phone).first();
          if (existing) { results.failed.push({ phone, reason: "已存在" }); continue; }
          const codeHash = await sha256(code || "123456");
          await db.prepare(
            "INSERT INTO users (phone, name, code_hash, code_type) VALUES (?, ?, ?, 'permanent')"
          ).bind(phone, name, codeHash).run();
          if (group_name) {
            let group = await db.prepare("SELECT id FROM groups_table WHERE name = ?").bind(group_name).first();
            if (!group) {
              const gr = await db.prepare("INSERT INTO groups_table (name) VALUES (?)").bind(group_name).run();
              group = { id: gr.meta.last_row_id };
            }
            await db.prepare("INSERT OR IGNORE INTO group_members (group_id, phone) VALUES (?, ?)").bind(group.id, phone).run();
          }
          results.success.push(phone);
        } catch (e) {
          results.failed.push({ phone, reason: e.message });
        }
      }
      return json(results);
    }

    // 单个创建用户
    const { phone, name, code, codeType, codeExpiry } = body;
    if (!phone || !name) return err("手机号和姓名不能为空");
    const existing = await db.prepare("SELECT phone FROM users WHERE phone = ?").bind(phone).first();
    if (existing) return err("该手机号已存在");
    const codeHash = code ? await sha256(code) : "";
    await db.prepare(
      "INSERT INTO users (phone, name, code_hash, code_type, code_expiry) VALUES (?, ?, ?, ?, ?)"
    ).bind(phone, name, codeHash, codeType || "permanent", codeExpiry || null).run();
    return json({ success: true, phone });
  }

  // POST 批量标记完成: /api/admin/users/:phone/complete-all
  if (method === "POST" && completeAllMatch) {
    const targetPhone = completeAllMatch[1];
    const { problemIds, taskDate } = body;
    if (!problemIds || !Array.isArray(problemIds)) return err("题目ID列表不能为空");
    const date = taskDate || beijingDateStr();
    const results = { success: [], skipped: [] };

    // 一次性查出该天题单，避免循环内反复查询
    const task = await db.prepare(
      "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
    ).bind(targetPhone, date).first();
    if (!task) return json(results);

    let problems = JSON.parse(task.problems).map(id => String(id));
    let completed = JSON.parse(task.completed).map(id => String(id));
    let changed = false;

    for (const rawId of problemIds) {
      const pid = String(rawId);
      if (!problems.includes(pid)) continue;
      if (completed.includes(pid)) { results.skipped.push(pid); continue; }
      completed.push(pid);
      results.success.push(pid);
      changed = true;
    }

    if (changed) {
      await db.prepare("UPDATE daily_tasks SET completed = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(completed), task.id).run();
      // 批量更新统计
      for (const pid of results.success) {
        await db.prepare(
          "UPDATE problem_stats SET completed_count = completed_count + 1 WHERE problem_id = ?"
        ).bind(pid).run();
      }
    }
    return json(results);
  }

  // POST 批量删除题单中的题目: /api/admin/users/:phone/tasks/batch-delete
  if (method === "POST" && batchDeleteMatch) {
    const targetPhone = batchDeleteMatch[1];
    const { taskDate, problemIds } = body;
    if (!taskDate || !problemIds || !Array.isArray(problemIds)) return err("taskDate 和 problemIds 不能为空");
    const date = taskDate || beijingDateStr();

    const task = await db.prepare(
      "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
    ).bind(targetPhone, date).first();
    if (!task) return err("未找到题单", 404);

    const pids = problemIds.map(id => String(id));
    let problems = JSON.parse(task.problems).map(id => String(id));
    let completed = JSON.parse(task.completed).map(id => String(id));

    let removedCount = 0;
    for (const pid of pids) {
      if (!problems.includes(pid)) continue;
      const wasCompleted = completed.includes(pid);
      problems = problems.filter(id => id !== pid);
      completed = completed.filter(id => id !== pid);
      removedCount++;
      // 更新统计
      await db.prepare(
        "UPDATE problem_stats SET selected_count = MAX(0, selected_count - 1), completed_count = MAX(0, completed_count - ?) WHERE problem_id = ?"
      ).bind(wasCompleted ? 1 : 0, pid).run();
    }

    if (problems.length === 0) {
      await db.prepare("DELETE FROM daily_tasks WHERE id = ?").bind(task.id).run();
    } else {
      await db.prepare("UPDATE daily_tasks SET problems = ?, completed = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(problems), JSON.stringify(completed), task.id).run();
    }

    return json({ success: true, removed: removedCount });
  }

  // ==================== PUT 路由 ====================

  if (method === "PUT" && !pathParts.includes("tasks")) {
    // PUT /api/admin/users/:phone — 更新用户信息或修改完成状态
    const { name, code, codeType, codeExpiry, completedDate, problemId, completed: isCompleted } = body;

    if (completedDate && problemId) {
      const pid = String(problemId);
      const task = await db.prepare(
        "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
      ).bind(userId, completedDate).first();
      if (!task) return err("未找到题单");
      let completed = JSON.parse(task.completed).map(id => String(id));
      if (isCompleted) {
        if (!completed.includes(pid)) completed.push(pid);
      } else {
        completed = completed.filter(id => id !== pid);
      }
      await db.prepare("UPDATE daily_tasks SET completed = ? WHERE id = ?")
        .bind(JSON.stringify(completed), task.id).run();
      return json({ completed });
    }

    const updates = [];
    const bindings = [];
    if (name !== undefined) { updates.push("name = ?"); bindings.push(name); }
    if (code !== undefined) {
      updates.push("code_hash = ?");
      bindings.push(await sha256(code));
    }
    if (codeType !== undefined) { updates.push("code_type = ?"); bindings.push(codeType); }
    if (codeExpiry !== undefined) { updates.push("code_expiry = ?"); bindings.push(codeExpiry); }
    if (updates.length === 0) return err("无更新字段");
    updates.push("updated_at = datetime('now')");
    bindings.push(userId);
    await db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE phone = ?`).bind(...bindings).run();
    return json({ success: true });
  }

  return err("未知操作", 404);
}

async function handleAdminGroups(db, method, url, body) {
  const pathname = url instanceof URL ? url.pathname : new URL(url).pathname;
  const pathParts = pathname.split("/").filter(Boolean);
  // path: /api/admin/groups 或 /api/admin/groups/:id
  const groupId = pathParts.length >= 4 ? pathParts[3] : null;

  if (method === "GET") {
    const groups = await db.prepare("SELECT * FROM groups_table ORDER BY id").all();
    const result = [];
    for (const g of groups.results) {
      const members = await db.prepare("SELECT gm.phone, u.name FROM group_members gm JOIN users u ON gm.phone = u.phone WHERE gm.group_id = ?").bind(g.id).all();
      result.push({ ...g, members: members.results });
    }
    return json(result);
  }

  if (method === "POST") {
    const { name, leaderPhone, memberPhones } = body;
    if (!name) return err("小组名称不能为空");
    const result = await db.prepare("INSERT INTO groups_table (name, leader_phone) VALUES (?, ?)").bind(name, leaderPhone || "").run();
    const groupId = result.meta.last_row_id;
    const phones = memberPhones || (leaderPhone ? [leaderPhone] : []);
    for (const p of phones) {
      await db.prepare("INSERT OR IGNORE INTO group_members (group_id, phone) VALUES (?, ?)").bind(groupId, p).run();
    }
    return json({ success: true, id: groupId });
  }

  if (!groupId) return err("缺少小组ID", 400);

  if (method === "PUT") {
    const { name, leaderPhone, memberPhones } = body;
    const updates = [];
    const bindings = [];
    if (name !== undefined) { updates.push("name = ?"); bindings.push(name); }
    if (leaderPhone !== undefined) { updates.push("leader_phone = ?"); bindings.push(leaderPhone); }
    if (updates.length > 0) {
      bindings.push(groupId);
      await db.prepare(`UPDATE groups_table SET ${updates.join(", ")} WHERE id = ?`).bind(...bindings).run();
    }
    // 更新成员列表
    if (memberPhones !== undefined) {
      await db.prepare("DELETE FROM group_members WHERE group_id = ?").bind(groupId).run();
      for (const p of memberPhones) {
        await db.prepare("INSERT OR IGNORE INTO group_members (group_id, phone) VALUES (?, ?)").bind(groupId, p).run();
      }
    }
    return json({ success: true });
  }

  if (method === "DELETE") {
    await db.prepare("DELETE FROM group_members WHERE group_id = ?").bind(groupId).run();
    await db.prepare("DELETE FROM groups_table WHERE id = ?").bind(groupId).run();
    return json({ success: true });
  }

  return err("未知操作", 404);
}

// 单条日志富化：优先用已缓存的 region/device，缺失时实时查并回写（避免重复调用外部 API）
async function enrichLog(db, l) {
  let region = l.region || "";
  if (!region && l.ip) {
    region = await ipToLocation(l.ip);
    try {
      await db.prepare("UPDATE login_logs SET region = ? WHERE id = ?").bind(region, l.id).run();
    } catch { /* 回写失败忽略 */ }
  }
  // 历史记录的 ua_parsed 可能为空，按需补全
  let uaParsed = l.ua_parsed || "";
  if (!uaParsed && l.user_agent) {
    uaParsed = parseUADetail(l.user_agent).summary;
    try {
      await db.prepare("UPDATE login_logs SET ua_parsed = ? WHERE id = ?").bind(uaParsed, l.id).run();
    } catch { /* 回写失败忽略 */ }
  }
  let fpDetail = null;
  if (l.fp_detail) {
    try { fpDetail = JSON.parse(l.fp_detail); } catch { fpDetail = null; }
  }
  return {
    id: l.id,
    phone: l.phone,
    ip: l.ip || "-",
    region,
    device: l.device || parseUA(l.user_agent || ""),
    uaParsed,
    fingerprint: l.fingerprint || "",
    fpDetail,
    userAgent: l.user_agent || "-",
    loginAt: l.login_at || "-"
  };
}

async function handleAdminLoginLogs(db, url) {
  const pathname = url instanceof URL ? url.pathname : new URL(url).pathname;
  const pathParts = pathname.split("/").filter(Boolean);
  // path: /api/admin/login-logs 或 /api/admin/login-logs/:phone
  const phone = pathParts.length >= 4 ? pathParts[3] : null;

  if (phone) {
    const logs = await db.prepare(
      "SELECT * FROM login_logs WHERE phone = ? ORDER BY login_at DESC LIMIT 200"
    ).bind(phone).all();
    return json(await Promise.all(logs.results.map(l => enrichLog(db, l))));
  }

  const logs = await db.prepare(
    "SELECT * FROM login_logs ORDER BY login_at DESC LIMIT 100"
  ).all();
  return json(await Promise.all(logs.results.map(l => enrichLog(db, l))));
}

async function handleAdminSettings(db, method, body) {
  if (method === "GET") {
    const settings = await db.prepare("SELECT * FROM admin_settings").all();
    const obj = {};
    for (const s of settings.results) obj[s.key] = s.value;
    return json(obj);
  }
  if (method === "PUT") {
    for (const [key, value] of Object.entries(body)) {
      if (key === "admin_password") {
        // 管理员密码特殊处理：哈希存储
        const hash = await sha256(String(value));
        await db.prepare(
          "INSERT INTO admin_settings (key, value) VALUES ('admin_password_hash', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
        ).bind(hash, hash).run();
        continue;
      }
      await db.prepare(
        "INSERT INTO admin_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?"
      ).bind(key, String(value), String(value)).run();
    }
    return json({ success: true });
  }
  return err("未知操作", 404);
}

// 重置题库统计 + 清空所有题单
async function handleAdminResetData(db, body) {
  const { scope } = body || {};
  const result = { stats: 0, tasks: 0 };

  if (!scope || scope === "stats" || scope === "all") {
    // 重置所有题目的被选/完成计数为 0
    const r = await db.prepare(
      "UPDATE problem_stats SET selected_count = 0, completed_count = 0"
    ).run();
    result.stats = r.meta?.changes || 0;
  }

  if (!scope || scope === "tasks" || scope === "all") {
    // 清空所有用户的每日题单（题集选择）
    const r = await db.prepare("DELETE FROM daily_tasks").run();
    result.tasks = r.meta?.changes || 0;
  }

  return json({ success: true, ...result });
}

// ==================== 请求处理 ====================

async function handleRequest(request, db) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS 预检
  if (method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  // 解析请求体
  let body = {};
  if (method === "POST" || method === "PUT") {
    try { body = await request.json(); } catch { /* no body */ }
  }

  // 登录：只调用一次 handleLogin，登录成功后记录日志（含 IP 归属地/设备/指纹）
  if (path === "/api/login" && method === "POST") {
    // 取真实客户端 IP
    // 优先级：X-Real-Client-IP（Pages Function 反代透传）> CF-Connecting-IP（直连场景）> X-Forwarded-For
    const ip = request.headers.get("X-Real-Client-IP")
      || request.headers.get("CF-Connecting-IP")
      || request.headers.get("X-Real-IP")
      || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
      || "";
    const ua = request.headers.get("User-Agent") || "";
    const fingerprint = body.fingerprint || "";
    const fpDetail = body.fpDetail || null;
    const result = await handleLogin(db, body);
    // 日志记录：失败时打印错误到 console.error，便于排查（不再静默吞）
    try {
      const resp = result.clone();
      const data = await resp.json();
      if (data.token && body.phone) {
        const uaDetail = parseUADetail(ua);
        const device = parseUA(ua);
        const region = await ipToLocation(ip);
        await db.prepare(
          "INSERT INTO login_logs (phone, ip, user_agent, login_at, region, device, fingerprint, fp_detail, ua_parsed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          body.phone, ip, ua, beijingTime(), region, device,
          fingerprint,
          fpDetail ? JSON.stringify(fpDetail) : "",
          uaDetail.summary
        ).run();
      }
    } catch (logErr) {
      // 日志记录失败不影响登录返回，但要打印错误便于排查
      console.error("[login_logs] INSERT 失败:", logErr?.message || logErr);
    }
    return result;
  }

  // 健康检查
  if (path === "/api/health") return json({ status: "ok", db: !!db, time: Date.now() });

  // 需要认证的路由
  const authPayload = await auth(request);
  if (!authPayload) return err("未登录或令牌已过期", 401);

  // 路由分发
  if (path === "/api/me") return handleMe(db, authPayload, method, body);
  if (path === "/api/group") return handleGroupDetail(db, authPayload);
  if (path === "/api/problems") return handleGetProblems(db);
  if (path === "/api/problem-stats") return handleGetProblemStats(db);
  if (path === "/api/daily-tasks/today") return handleGetDailyTasks(db, authPayload);
  if (path === "/api/daily-tasks" && method === "POST") return handleCreateDailyTasks(db, authPayload, body);
  if (path === "/api/daily-tasks/complete" && method === "PUT") return handleCompleteProblem(db, authPayload, body);
  if (path === "/api/daily-tasks/history") return handleGetTaskHistory(db, authPayload, url);

  // 管理端路由
  if (!authPayload.isAdmin && path.startsWith("/api/admin")) return err("权限不足", 403);

  if (path === "/api/admin/dashboard") return handleAdminDashboard(db);
  if (path.startsWith("/api/admin/users")) return handleAdminUsers(db, method, url, body);
  if (path.startsWith("/api/admin/groups")) return handleAdminGroups(db, method, url, body);
  if (path.startsWith("/api/admin/login-logs")) return handleAdminLoginLogs(db, url);
  if (path === "/api/admin/settings") return handleAdminSettings(db, method, body);
  if (path === "/api/admin/reset-data" && method === "POST") return handleAdminResetData(db, body);

  return err("接口不存在", 404);
}

export default {
  async fetch(request, env) {
    // 处理 CORS 预检请求（移动端等跨域场景必需）
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    try {
      if (env.JWT_SECRET) JWT_SECRET = env.JWT_SECRET;
      return await handleRequest(request, env.DB);
    } catch (e) {
      return err("服务器内部错误: " + e.message, 500);
    }
  }
};
