# 语音中转站 · Vercel 部署说明

## 它解决什么问题

你的网页在 `khaki-one-11.vercel.app`，语音接口在 `api.mosi.cn`，属于两个不同域名。
浏览器规定网页不能随便访问别的域名，对方没点头（没给跨域许可），请求在门口就被掐断，
前端只能看到一句 `Failed to fetch`。

这个项目就是一个「代收代发」的中转站：

```
你的网页 → 中转站（给了许可） → api.mosi.cn → 中转站 → 你的网页
```

浏览器只跟中转站打交道，就不会再拦。

---

## 部署步骤 A：有电脑 + 有 GitHub 账号（推荐，约 10 分钟）

1. 打开 https://github.com ，登录或注册（免费）
2. 右上角 **+** → **New repository**
3. 名字填 `moss-tts-proxy`，选 **Public**，点 **Create repository**
4. 页面里点 **uploading an existing file**（或 Add file → Upload files）
5. 把本压缩包**解压后的所有文件和文件夹**拖进去（要保持 `api` 文件夹的层级）
6. 点绿色 **Commit changes**

然后：

7. 打开 https://vercel.com ，用 **Continue with GitHub** 登录（免费）
8. 点 **Add New** → **Project**
9. 找到 `moss-tts-proxy`，点 **Import**
10. 什么都不用改，直接点 **Deploy**
11. 等 1 分钟，出现庆祝页面，记下你的网址，形如：
    `https://moss-tts-proxy-xxxx.vercel.app`

---

## 验证

浏览器打开你的网址（后面不加任何东西）：

```
https://moss-tts-proxy-xxxx.vercel.app
```

看到「✅ 语音中转站已上线」的页面，就说明成功了。

---

## 填进语音配置

回到「编辑语音配置」页面，把 **接口地址 (Base URL)** 改成：

```
https://moss-tts-proxy-xxxx.vercel.app/api
```

注意结尾是 `/api`，不要写成 `/v1`（`/v1` 由前端自己拼，中转站会原样转给 mosi）。

API Key、模型名、音色**全部不用改**。保存后点测试。

---

## 如果还是失败，但报错变了

那说明**请求已经成功到达 mosi**，是好事。

- `401` / `invalid api key` → API Key 不对，重新复制一遍
- `404` / `model not found` → 模型名 `moss-tts` 不对，去 platform.mosi.cn 文档确认
- `invalid voice` → 音色 ID 不对，点「显示默认音色」重新选一个

把新的报错发出来，就能一步步改对。

---

## 注意

- API Key 仍然由你的网页直接带上去，中转站不保存、不记录。
- Vercel 免费额度：每月 100GB 流量、10 万次函数调用，个人用完全够。
- `api/[[...path]].js` 这个文件名不要改，方括号是路由通配符，必须原样保留。
