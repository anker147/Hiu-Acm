// HIU-ACM API Client - 替代本地 IndexedDB
// 所有数据操作通过 Cloudflare Worker API
const API_BASE = "https://hiu-acm-api.wangyiyouxiang0719.workers.dev";

const Api = {
  token: null,

  init() {
    this.token = sessionStorage.getItem("hiu_token");
  },

  setToken(t) {
    this.token = t;
    if (t) sessionStorage.setItem("hiu_token", t);
    else sessionStorage.removeItem("hiu_token");
  },

  async fetch(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      ...options, headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  },

  // ============ 认证 ============
  async login(phone, code) {
    const data = await this.fetch("/api/login", {
      method: "POST",
      body: { phone, code }
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
  }
};
