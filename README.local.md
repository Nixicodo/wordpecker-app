# WordPecker 本地部署说明

这个目录已经按 Windows 本机环境部署为可运行状态，项目根目录在 `F:\aprojects\wordpecker-app`。

## 启动

在 PowerShell 中执行：

```powershell
cd F:\aprojects\wordpecker-app
.\scripts\start-local.ps1
```

启动脚本会自动做这些事：

- 确保本机 `MongoDB` 服务已启动
- 自动写入 `backend/.env` 和 `frontend/.env`
- 如果缺少依赖则执行 `npm ci`
- 后台启动前后端，并把日志写到 `logs\`

启动完成后访问：

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- MongoDB: `localhost:27017`

## 停止

```powershell
cd F:\aprojects\wordpecker-app
.\scripts\stop-local.ps1
```

## 说明

- 当前部署默认会自动写入 `backend/.env`，并填入一个本地占位 `OPENAI_API_KEY`，这样后端可以通过启动阶段的环境校验。
- 启动脚本会优先读取 `C:\Users\JKL\.codex\auth.json` 和 `C:\Users\JKL\.codex\config.toml` 中已有的 OpenAI 兼容配置；如果读不到，才回退到本地占位值。
- 这意味着和 OpenAI、ElevenLabs、Pexels 真实联网的能力默认不可用；如果你之后要使用 AI 生成释义、图片、语音等功能，把 `.env` 里的对应 key 换成你自己的即可。
- 需要改 key 时，改这两个文件：
  - `F:\aprojects\wordpecker-app\backend\.env`
  - `F:\aprojects\wordpecker-app\frontend\.env`
- 普通的前端加载、MongoDB 连接、列表接口、模板种子数据等本地运行能力不受影响。
