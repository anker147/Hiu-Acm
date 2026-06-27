// HIU-ACM 认证模块 - 使用 Cloudflare Worker API
// 注意：token 改用 localStorage 持久化（移动端 sessionStorage 不可靠：
//       iOS 私密浏览/微信内置/Android 切后台均可能清空，导致 "已登录又掉线"）

// base64url / 去除 padding 的 base64 安全解码（补齐 padding 后 atob）
function decodeJwtPayload(part) {
  let s = part.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return JSON.parse(atob(s));
}

// 统一存储抽象：localStorage（移动端可靠）
const tokenStore = {
  get() { return localStorage.getItem("hiu_token"); },
  set(t) { if (t) localStorage.setItem("hiu_token", t); else localStorage.removeItem("hiu_token"); },
  remove() { localStorage.removeItem("hiu_token"); }
};

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
    const token = tokenStore.get();
    if (!token) return null;
    try {
      Api.setToken(token);
      const user = await Api.getMe();
      return user;
    } catch {
      tokenStore.remove();
      return null;
    }
  },

  logout() {
    Api.logout();
    tokenStore.remove();
  },

  isAdmin() {
    try {
      const token = tokenStore.get();
      if (!token) return false;
      const parts = token.split(".");
      if (parts.length !== 3) return false;
      const payload = decodeJwtPayload(parts[1]);
      return !!payload.isAdmin;
    } catch { return false; }
  },

  getPhone() {
    try {
      const token = tokenStore.get();
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = decodeJwtPayload(parts[1]);
      return payload.phone;
    } catch { return null; }
  }
};
