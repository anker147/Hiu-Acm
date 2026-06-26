// HIU-ACM 认证模块 - 使用 Cloudflare Worker API
const Auth = {
  async login(phone, code) {
    try {
      const user = await Api.login(phone, code);
      return user;
    } catch (e) {
      throw new Error(e.message || "登录失败");
    }
  },

  async checkSession() {
    const token = sessionStorage.getItem("hiu_token");
    if (!token) return null;
    try {
      Api.setToken(token);
      const user = await Api.getMe();
      return user;
    } catch {
      sessionStorage.removeItem("hiu_token");
      return null;
    }
  },

  logout() {
    Api.logout();
    sessionStorage.removeItem("hiu_token");
  },

  isAdmin() {
    try {
      const token = sessionStorage.getItem("hiu_token");
      if (!token) return false;
      const parts = token.split(".");
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1]));
      return !!payload.isAdmin;
    } catch { return false; }
  },

  getPhone() {
    try {
      const token = sessionStorage.getItem("hiu_token");
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload.phone;
    } catch { return null; }
  }
};
