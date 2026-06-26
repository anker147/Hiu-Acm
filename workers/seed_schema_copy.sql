-- HIU-ACM 集训管理系统 D1 数据库表结构
-- Cloudflare D1 使用 SQLite 引擎

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT DEFAULT '',
  code_hash TEXT DEFAULT '',
  code_type TEXT DEFAULT 'permanent',  -- permanent | temporary
  code_expiry TEXT DEFAULT NULL,
  avatar_url TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 小组表
CREATE TABLE IF NOT EXISTS groups_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  leader_phone TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 小组成员关系
CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL,
  phone TEXT NOT NULL,
  PRIMARY KEY (group_id, phone),
  FOREIGN KEY (group_id) REFERENCES groups_table(id) ON DELETE CASCADE
);

-- 题库
CREATE TABLE IF NOT EXISTS problems (
  nowcoder_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  difficulty TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 题目统计
CREATE TABLE IF NOT EXISTS problem_stats (
  problem_id TEXT PRIMARY KEY,
  selected_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  FOREIGN KEY (problem_id) REFERENCES problems(nowcoder_id)
);

-- 每日题单
CREATE TABLE IF NOT EXISTS daily_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  task_date TEXT NOT NULL,
  problems TEXT NOT NULL DEFAULT '[]',
  completed TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(phone, task_date)
);

-- 登录日志
CREATE TABLE IF NOT EXISTS login_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  login_at TEXT DEFAULT (datetime('now'))
);

-- 系统设置
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- 默认设置
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('admin_password_hash', '');
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('daily_mandatory_count', '2');
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('daily_max_random', '18');
INSERT OR IGNORE INTO admin_settings (key, value) VALUES ('mandatory_threshold', '1');
