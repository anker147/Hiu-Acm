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
// IP 归属地简易映射（中国主要省市）
function ipToRegion(ip) {
  if (!ip) return "未知";
  // 内网 IP
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/.test(ip)) return "局域网";
  // 简易省份映射（基于常见运营商IP段首段）
  const map = {
    "1": "北京", "14": "北京", "27": "北京", "36": "北京", "39": "北京", "49": "北京",
    "42": "湖北", "58": "湖北", "59": "湖北", "60": "湖北", "61": "湖北",
    "101": "北京", "103": "北京", "106": "北京", "110": "北京", "111": "北京",
    "112": "北京", "113": "北京", "114": "北京", "115": "北京", "116": "北京",
    "117": "北京", "118": "北京", "119": "北京", "120": "北京", "121": "北京",
    "122": "北京", "123": "北京", "124": "北京", "125": "北京", "126": "北京",
    "171": "广东", "175": "广东", "180": "广东", "182": "广东", "183": "广东",
    "202": "广东", "203": "广东", "210": "广东", "211": "广东", "218": "广东",
    "219": "广东", "220": "广东", "221": "广东", "222": "广东", "223": "广东",
    "114": "广东", "116": "广东", "119": "广东", "121": "广东",
    "58": "上海", "61": "上海", "101": "上海", "112": "上海", "114": "上海",
    "116": "上海", "117": "上海", "118": "上海", "124": "上海", "180": "上海",
    "202": "上海", "203": "上海", "210": "上海", "211": "上海", "218": "上海",
    "219": "上海", "220": "上海", "221": "上海", "222": "上海",
    "60": "浙江", "61": "浙江", "115": "浙江", "122": "浙江", "123": "浙江",
    "125": "浙江", "183": "浙江", "202": "浙江", "218": "浙江",
    "114": "江苏", "117": "江苏", "121": "江苏", "122": "江苏", "180": "江苏",
    "218": "江苏", "221": "江苏", "222": "江苏", "223": "江苏",
    "61": "四川", "110": "四川", "117": "四川", "118": "四川", "119": "四川",
    "125": "四川", "171": "四川", "175": "四川", "182": "四川",
    "113": "福建", "117": "福建", "120": "福建", "121": "福建", "125": "福建",
    "175": "福建", "218": "福建", "220": "福建", "222": "福建",
    "42": "湖南", "58": "湖南", "61": "湖南", "110": "湖南", "113": "湖南",
    "118": "湖南", "119": "湖南", "175": "湖南", "222": "湖南",
    "111": "山东", "112": "山东", "113": "山东", "119": "山东", "123": "山东",
    "124": "山东", "182": "山东", "218": "山东",
    "115": "河南", "123": "河南", "125": "河南", "171": "河南", "182": "河南",
    "1": "河北", "27": "河北", "60": "河北", "101": "河北", "106": "河北",
    "110": "河北", "111": "河北", "120": "河北", "121": "河北", "124": "河北",
  };
  const first = ip.split(".")[0];
  return map[first] || "中国";
}
// UA 解析设备类型
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
  if (!problemId) return err("题目ID不能为空");
  const date = taskDate || beijingDateStr();

  const task = await db.prepare(
    "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
  ).bind(authPayload.phone, date).first();
  if (!task) return err("未找到题单");

  const problems = JSON.parse(task.problems);
  if (!problems.includes(problemId)) return err("该题目不在题单中");

  let completed = JSON.parse(task.completed);
  if (completed.includes(problemId)) {
    // 取消完成：移除并减计数
    completed = completed.filter(id => id !== problemId);
  } else {
    // 新标记完成：先加入列表
    completed = [...completed, problemId];
  }

  await db.prepare("UPDATE daily_tasks SET completed = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(completed), task.id).run();

  // 更新题目完成统计（仅在首次标记完成时递增）
  const oldCompleted = JSON.parse(task.completed);
  if (!oldCompleted.includes(problemId)) {
    // 新标记完成 → 递增
    await db.prepare(
      "UPDATE problem_stats SET completed_count = completed_count + 1 WHERE problem_id = ?"
    ).bind(problemId).run();
  } else {
    // 取消完成 → 递减（不低于0）
    await db.prepare(
      "UPDATE problem_stats SET completed_count = MAX(0, completed_count - 1) WHERE problem_id = ?"
    ).bind(problemId).run();
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

  // 今日统计
  const today = beijingDateStr();
  const todayTasks = await db.prepare("SELECT * FROM daily_tasks WHERE task_date = ?").bind(today).all();
  const todayStats = { total: todayTasks.results.length, completed: 0 };
  for (const t of todayTasks.results) {
    const completed = JSON.parse(t.completed);
    const total = JSON.parse(t.problems);
    if (completed.length >= total.length) todayStats.completed++;
  }

  // 完成率排行
  const allUsers = await db.prepare("SELECT phone, name FROM users WHERE is_admin = 0").all();
  const ranking = [];
  for (const u of allUsers.results) {
    const tasks = await db.prepare(
      "SELECT problems, completed FROM daily_tasks WHERE phone = ?"
    ).bind(u.phone).all();
    let total = 0, done = 0;
    for (const t of tasks.results) {
      const p = JSON.parse(t.problems);
      const c = JSON.parse(t.completed);
      total += p.length;
      done += c.length;
    }
    ranking.push({ phone: u.phone, name: u.name, total, done, rate: total > 0 ? Math.round(done / total * 100) : 0 });
  }
  ranking.sort((a, b) => b.rate - a.rate);

  // 小组统计
  const groups = await db.prepare("SELECT * FROM groups_table").all();
  const groupStats = [];
  for (const g of groups.results) {
    const members = await db.prepare("SELECT phone FROM group_members WHERE group_id = ?").bind(g.id).all();
    let total = 0, done = 0;
    for (const m of members.results) {
      const tasks = await db.prepare("SELECT problems, completed FROM daily_tasks WHERE phone = ?").bind(m.phone).all();
      for (const t of tasks.results) {
        total += JSON.parse(t.problems).length;
        done += JSON.parse(t.completed).length;
      }
    }
    groupStats.push({ id: g.id, name: g.name, memberCount: members.results.length, total, done, rate: total > 0 ? Math.round(done / total * 100) : 0 });
  }

  // 热门题目
  const hotProblems = await db.prepare(
    "SELECT ps.*, p.title FROM problem_stats ps JOIN problems p ON ps.problem_id = p.nowcoder_id ORDER BY ps.selected_count DESC LIMIT 10"
  ).all();

  // 今日题单详情
  const todayDetails = [];
  for (const t of todayTasks.results) {
    const user = await db.prepare("SELECT name FROM users WHERE phone = ?").bind(t.phone).first();
    todayDetails.push({
      phone: t.phone, name: user?.name || t.phone,
      problems: JSON.parse(t.problems), completed: JSON.parse(t.completed)
    });
  }

  return json({
    userCount: userCount.c, groupCount: groupCount.c, problemCount: problemCount.c,
    todayStats, ranking, groupStats, hotProblems: hotProblems.results, todayDetails
  });
}

async function handleAdminUsers(db, method, url, body) {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/");
  // 排除特殊路径词
  const specialPaths = ["users", "simple", "batch", "tasks", "complete-all"];
  const userId = (() => {
    const last = pathParts[pathParts.length - 1];
    if (!last || specialPaths.includes(last)) return null;
    return last;
  })();

  // 子路由优先匹配（tasks 等特殊路径必须在通用 /users 匹配之前）
  if (method === "GET" && pathParts.includes("tasks")) {
    const tasksPhone = pathParts[pathParts.indexOf("tasks") - 1];
    const tasks = await db.prepare(
      "SELECT * FROM daily_tasks WHERE phone = ? ORDER BY task_date DESC"
    ).bind(tasksPhone).all();
    return json(tasks.results.map(t => ({
      ...t, problems: JSON.parse(t.problems), completed: JSON.parse(t.completed)
    })));
  }

  if (method === "GET" && !userId) {
    // 简化用户列表（供选择框使用）
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

  if (method === "GET" && userId && userId !== "tasks") {
    const user = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(userId).first();
    if (!user) return err("用户不存在", 404);
    return json({
      phone: user.phone, name: user.name, codeType: user.code_type,
      codeExpiry: user.code_expiry, avatarUrl: user.avatar_url, createdAt: user.created_at
    });
  }

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
          // 分配小组
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

  if (method === "POST" && pathParts.includes("complete-all")) {
    // 批量标记完成：POST /api/admin/users/:phone/complete-all
    const targetPhone = pathParts[pathParts.indexOf("complete-all") - 1];
    const { problemIds, taskDate } = body;
    if (!problemIds || !Array.isArray(problemIds)) return err("题目ID列表不能为空");
    const date = taskDate || beijingDateStr();
    const results = { success: [], skipped: [] };

    for (const problemId of problemIds) {
      const task = await db.prepare(
        "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
      ).bind(targetPhone, date).first();
      if (!task) continue;

      const problems = JSON.parse(task.problems);
      if (!problems.includes(problemId)) continue;

      let completed = JSON.parse(task.completed);
      if (completed.includes(problemId)) {
        results.skipped.push(problemId);
        continue;
      }
      completed = [...completed, problemId];
      await db.prepare("UPDATE daily_tasks SET completed = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(completed), task.id).run();
      await db.prepare(
        "UPDATE problem_stats SET completed_count = completed_count + 1 WHERE problem_id = ?"
      ).bind(problemId).run();
      results.success.push(problemId);
    }
    return json(results);
  }

  if (method === "PUT" && !pathParts.includes("tasks")) {
    const { name, code, codeType, codeExpiry, completedDate, problemId, completed: isCompleted } = body;

    if (completedDate && problemId) {
      // 手动修改完成状态
      const task = await db.prepare(
        "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
      ).bind(userId, completedDate).first();
      if (!task) return err("未找到题单");
      let completed = JSON.parse(task.completed);
      if (isCompleted) {
        if (!completed.includes(problemId)) completed.push(problemId);
      } else {
        completed = completed.filter(id => id !== problemId);
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

  // 删除题单中某道题：DELETE /api/admin/users/:phone/tasks/:taskDate/problems/:problemId
  if (method === "DELETE" && pathParts.includes("problems")) {
    const probIdx = pathParts.indexOf("problems");
    const taskDate = pathParts[probIdx - 1];
    const targetPhone = pathParts[probIdx - 2];
    const problemId = parseInt(pathParts[probIdx + 1]);
    if (!taskDate || !targetPhone || isNaN(problemId)) return err("参数不完整", 400);

    const task = await db.prepare(
      "SELECT * FROM daily_tasks WHERE phone = ? AND task_date = ?"
    ).bind(targetPhone, taskDate).first();
    if (!task) return err("未找到题单", 404);

    let problems = JSON.parse(task.problems);
    let completed = JSON.parse(task.completed);
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

  if (method === "DELETE") {
    await db.prepare("DELETE FROM users WHERE phone = ?").bind(userId).run();
    await db.prepare("DELETE FROM daily_tasks WHERE phone = ?").bind(userId).run();
    await db.prepare("DELETE FROM group_members WHERE phone = ?").bind(userId).run();
    return json({ success: true });
  }

  return err("未知操作", 404);
}

async function handleAdminGroups(db, method, url, body) {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/").filter(Boolean);
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

async function handleAdminLoginLogs(db, url) {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  // path: /api/admin/login-logs 或 /api/admin/login-logs/:phone
  const phone = pathParts.length >= 4 ? pathParts[3] : null;

  if (phone) {
    // 单用户日志详情
    const logs = await db.prepare(
      "SELECT * FROM login_logs WHERE phone = ? ORDER BY login_at DESC LIMIT 200"
    ).bind(phone).all();
    return json(logs.results.map(l => ({
      phone: l.phone,
      ip: l.ip || "-",
      region: ipToRegion(l.ip),
      device: parseUA(l.user_agent || ""),
      userAgent: l.user_agent || "-",
      loginAt: l.login_at || "-"
    })));
  }

  const logs = await db.prepare(
    "SELECT * FROM login_logs ORDER BY login_at DESC LIMIT 100"
  ).all();
  return json(logs.results.map(l => ({
    phone: l.phone,
    ip: l.ip || "-",
    region: ipToRegion(l.ip),
    device: parseUA(l.user_agent || ""),
    userAgent: l.user_agent || "-",
    loginAt: l.login_at || "-"
  })));
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

  // 记录登录日志
  if (path === "/api/login" && method === "POST") {
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const ua = request.headers.get("User-Agent") || "";
    try {
      const result = await handleLogin(db, body);
      // 异步记录日志
      const resp = result.clone();
      const data = await resp.json();
      if (data.token && body.phone) {
        await db.prepare("INSERT INTO login_logs (phone, ip, user_agent, login_at) VALUES (?, ?, ?, ?)")
          .bind(body.phone, ip, ua, beijingTime()).run();
      }
      return result;
    } catch {
      return handleLogin(db, body);
    }
  }

  // 健康检查
  if (path === "/api/health") return json({ status: "ok", db: !!db, time: Date.now() });

  // 不需要认证的路由
  if (path === "/api/login" && method === "POST") return handleLogin(db, body);

  // 需要认证的路由
  const authPayload = await auth(request);
  if (!authPayload) return err("未登录或令牌已过期", 401);

  // 记录普通用户登录日志（GET /api/me 视为登录确认）
  if (path === "/api/me" && method === "GET") {
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const ua = request.headers.get("User-Agent") || "";
    await db.prepare("INSERT INTO login_logs (phone, ip, user_agent, login_at) VALUES (?, ?, ?, ?)")
      .bind(authPayload.phone, ip, ua.slice(0, 500), beijingTime()).run();
  }

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

  return err("接口不存在", 404);
}

export default {
  async fetch(request, env) {
    try {
      if (env.JWT_SECRET) JWT_SECRET = env.JWT_SECRET;
      return await handleRequest(request, env.DB);
    } catch (e) {
      return err("服务器内部错误: " + e.message, 500);
    }
  }
};
