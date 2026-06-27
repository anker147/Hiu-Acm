// HIU-ACM 认证模块 - 使用 Cloudflare Worker API

// base64url / 去除 padding 的 base64 安全解码（补齐 padding 后 atob）
function decodeJwtPayload(part) {
  let s = part.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return JSON.parse(atob(s));
}

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
      const payload = decodeJwtPayload(parts[1]);
      return !!payload.isAdmin;
    } catch { return false; }
  },

  getPhone() {
    try {
      const token = sessionStorage.getItem("hiu_token");
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = decodeJwtPayload(parts[1]);
      return payload.phone;
    } catch { return null; }
  }
};
