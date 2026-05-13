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
- 在返回成功前，主动检查 `/api/lists/due-review`、`/api/lists/discipline-status` 和真实的待复习浏览器 smoke

启动完成后访问：

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- MongoDB: `localhost:27017`

## 停止

```powershell
cd F:\aprojects\wordpecker-app
.\scripts\stop-local.ps1
```

## 单独做健康检查

如果你怀疑“端口起来了，但应用其实没恢复”，可以单独运行：

```powershell
cd F:\aprojects\wordpecker-app
.\scripts\check-local-health.ps1
```

这会检查：

- 后端 `due-review` 关键接口
- 后端 `discipline-status` 关键接口
- 前端 `/reviews` 路由可访问
- 真实浏览器里的待复习主流程 smoke

## 这次“又挂了”的根因

这次不是 `/reviews` 页面再次因为 `discipline-status` 失败而整页报错，而是本地服务进入了一个“前端残留、后端掉线”的半死状态：

- `5173` 还被之前的 Vite 进程占着
- `3000` 已经没有监听
- 旧版 `start-local.ps1` 只能靠端口占用进程的命令行里是否包含项目根目录来判断“是不是本项目自己的旧进程”
- 但 Vite / Nodemon 在 Windows 上有时会只留下类似 `node ...\\node_modules\\vite\\bin\\vite.js` 这样的命令行，不一定带项目根目录绝对路径

结果就是：

- 脚本认不出 `5173` 上残留的是 WordPecker 自己的旧前端
- 它不会自动清掉这个残留进程
- 再次启动时就会报“Port 5173 is already in use...”，看起来像启动脚本也救不回来

现在脚本已经补上了额外识别条件：

- `3000` 上只要是 `nodemon.js + src/app.ts`
- `5173` 上只要是 `vite.js + --strictPort`

就会被视为 WordPecker 自己留下的陈旧进程并自动清理，然后继续拉起完整服务。

## 说明

- 当前部署默认会自动写入 `backend/.env`，并填入一个本地占位 `OPENAI_API_KEY`，这样后端可以通过启动阶段的环境校验。
- 启动脚本会优先读取 `C:\Users\JKL\.codex\auth.json` 和 `C:\Users\JKL\.codex\config.toml` 中已有的 OpenAI 兼容配置；如果读不到，才回退到本地占位值。
- 当前本地 AI 默认模型固定写为 `gpt-5.4`，因为你机器上这套 provider 提供的是 Codex 模型族，不包含仓库默认假定的 `gpt-4.1`。
- 当前后端 agents 走的是 `chat/completions` 兼容模式，而不是 `responses`。原因是你本机这套 `right.codes` provider 的 `responses` 返回格式和仓库当前依赖版本不兼容，但 `chat/completions` 已实测可用。
- 这意味着和 OpenAI、ElevenLabs、Pexels 真实联网的能力默认不可用；如果你之后要使用 AI 生成释义、图片、语音等功能，把 `.env` 里的对应 key 换成你自己的即可。
- 需要改 key 时，改这两个文件：
  - `F:\aprojects\wordpecker-app\backend\.env`
  - `F:\aprojects\wordpecker-app\frontend\.env`
- 普通的前端加载、MongoDB 连接、列表接口、模板种子数据等本地运行能力不受影响。
