// HIU-ACM API Client - 替代本地 IndexedDB
// 所有数据操作通过 Cloudflare Pages Functions 反代到 Worker
// 生产环境：前端 + /api/* 同源（Cloudflare Pages），走 Pages CDN，国内可达性更好
// 本地调试：直连 Worker（localhost/127.0.0.1 时自动切换）
// 注意：前端调用方写的是 this.fetch("/api/login")，所以生产环境 API_BASE 必须是空串，
//       否则会拼成 /api/api/login（双层 /api 前缀 bug）
const API_BASE = (location.hostname === "127.0.0.1" || location.hostname === "localhost")
  ? "https://hiu-acm-api.wangyiyouxiang0719.workers.dev"
  : "";

const Api = {
  token: null,

  init() {
    this.token = localStorage.getItem("hiu_token");
  },

  setToken(t) {
    this.token = t;
    if (t) localStorage.setItem("hiu_token", t);
    else localStorage.removeItem("hiu_token");
  },

  async fetch(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...options, headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") throw new Error("请求超时，请检查网络后重试");
      throw new Error("网络连接失败，请检查网络");
    }
    clearTimeout(timeoutId);
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`服务器响应异常（HTTP ${res.status}）`);
    }
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  },

  // ============ 认证 ============
  async login(phone, code, meta = {}) {
    const data = await this.fetch("/api/login", {
      method: "POST",
      body: { phone, code, fingerprint: meta.fingerprint || "", fpDetail: meta.fpDetail || null }
    });
    this.setToken(data.token);
    return data.user;
  },

  async getMe() {
    return this.fetch("/api/me");
  },

  logout() {
    this.setToken(null);
  },

  // ============ 题库 ============
  async getProblems() {
    return this.fetch("/api/problems");
  },

  async getProblemStats() {
    return this.fetch("/api/problem-stats");
  },

  // ============ 每日题单 ============
  async getTodayTasks() {
    return this.fetch("/api/daily-tasks/today");
  },

  async createDailyTasks(problemIds) {
    return this.fetch("/api/daily-tasks", {
      method: "POST",
      body: { problemIds }
    });
  },

  async completeProblem(problemId, taskDate) {
    return this.fetch("/api/daily-tasks/complete", {
      method: "PUT",
      body: { problemId, taskDate }
    });
  },

  async getTaskHistory(limit = 30) {
    return this.fetch(`/api/daily-tasks/history?limit=${limit}`);
  },

  // ============ 个人信息 ============
  async updateAvatar(avatarUrl) {
    return this.fetch("/api/me", { method: "PUT", body: { avatarUrl } });
  },

  // ============ 小组展示 ============
  async getGroupDetail() {
    return this.fetch("/api/group");
  },

  // ============ 管理端 ============
  async adminDashboard() {
    return this.fetch("/api/admin/dashboard");
  },

  async adminUsers() {
    return this.fetch("/api/admin/users");
  },

  async adminCreateUser(userData) {
    return this.fetch("/api/admin/users", {
      method: "POST",
      body: userData
    });
  },

  async adminUpdateUser(phone, data) {
    return this.fetch(`/api/admin/users/${phone}`, {
      method: "PUT",
      body: data
    });
  },

  async adminDeleteUser(phone) {
    return this.fetch(`/api/admin/users/${phone}`, {
      method: "DELETE"
    });
  },

  async adminUserTasks(phone) {
    return this.fetch(`/api/admin/users/${phone}/tasks`);
  },

  async adminGroups() {
    return this.fetch("/api/admin/groups");
  },

  async adminCreateGroup(data) {
    return this.fetch("/api/admin/groups", {
      method: "POST",
      body: data
    });
  },

  async adminUpdateGroup(id, data) {
    return this.fetch(`/api/admin/groups/${id}`, {
      method: "PUT",
      body: data
    });
  },

  async adminDeleteGroup(id) {
    return this.fetch(`/api/admin/groups/${id}`, {
      method: "DELETE"
    });
  },

  async adminUsersSimple() {
    return this.fetch("/api/admin/users/simple");
  },

  async adminBatchUsers(users) {
    return this.fetch("/api/admin/users/batch", {
      method: "POST",
      body: users
    });
  },

  async adminCompleteAll(phone, problemIds, taskDate) {
    return this.fetch(`/api/admin/users/${phone}/complete-all`, {
      method: "POST",
      body: { problemIds, taskDate }
    });
  },

  async adminUserLoginLogs(phone) {
    return this.fetch(`/api/admin/login-logs/${phone}`);
  },

  async adminDeleteTaskProblem(phone, taskDate, problemId) {
    return this.fetch(`/api/admin/users/${phone}/tasks/${taskDate}/problems/${problemId}`, {
      method: "DELETE"
    });
  },

  async adminDeleteUserTasks(phone, taskDate) {
    return this.fetch(`/api/admin/users/${phone}/tasks/${taskDate}`, {
      method: "DELETE"
    });
  },

  async adminDeleteUserAccount(phone) {
    return this.fetch(`/api/admin/users/${phone}/account`, {
      method: "DELETE"
    });
  },

  async adminBatchDeleteProblems(phone, taskDate, problemIds) {
    return this.fetch(`/api/admin/users/${phone}/tasks/batch-delete`, {
      method: "POST",
      body: { taskDate, problemIds }
    });
  },

  async adminLoginLogs() {
    return this.fetch("/api/admin/login-logs");
  },

  async adminSettings() {
    return this.fetch("/api/admin/settings");
  },

  async adminUpdateSettings(settings) {
    return this.fetch("/api/admin/settings", {
      method: "PUT",
      body: settings
    });
  },

  async adminResetData(scope = "all") {
    return this.fetch("/api/admin/reset-data", {
      method: "POST",
      body: { scope }
    });
  }
};
