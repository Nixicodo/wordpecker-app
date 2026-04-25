# WordPecker App

WordPecker 是一个面向个人词库的语言学习应用：你可以创建词表、添加单词、练习例句、测验复习，也可以通过图片描述、主题探索、阅读和语音对话来发现新词。

当前仓库是 Web 版本，包含：

- `frontend/`：React + Vite + Chakra UI 前端。
- `backend/`：Express + TypeScript + MongoDB 后端。
- `scripts/`：Windows 本地启动、停止和辅助脚本。
- `docs/`：产品素材、架构/功能说明文档。
- `backgrounds/`：本地背景图库，后端会通过 `/backgrounds` 静态服务暴露。

## 当前技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18、Vite 6、TypeScript、Chakra UI、React Router、TanStack Query、Axios |
| 后端 | Node.js、Express、TypeScript、Mongoose、OpenAI Agents SDK、ElevenLabs SDK |
| 数据库 | MongoDB |
| 测试 | Jest + Supertest（后端）、Playwright smoke 脚本（前端行为冒烟） |
| 本地脚本 | PowerShell、nodemon、ts-node |
| 容器化 | Docker Compose + MongoDB 7 |

建议使用 Node.js 20+。当前开发机已验证 Node.js `v22.20.0`、npm `10.9.3` 可用。

## 快速启动（Windows 本地）

推荐直接使用仓库内的 PowerShell 脚本：

```powershell
cd F:\aprojects\wordpecker-app
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

启动成功后访问：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`
- MongoDB：`localhost:27017`
- 日志目录：`logs\`

停止服务：

```powershell
cd F:\aprojects\wordpecker-app
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1
```

### `start-local.ps1` 会做什么

脚本会自动完成以下工作：

1. 创建 `logs/` 和 `.runtime/`。
2. 写入 `backend/.env` 和 `frontend/.env`。
3. 优先从 `%USERPROFILE%\.codex\auth.json` 读取 `OPENAI_API_KEY`。
4. 优先从 `%USERPROFILE%\.codex\config.toml` 读取当前 Codex provider 的 `OPENAI_BASE_URL`。
5. 如果没有依赖目录，分别在 `backend/` 和 `frontend/` 执行 `npm ci`。
6. 确认 Windows 服务 `MongoDB` 正在运行。
7. 清理 `.runtime/*.pid` 记录的旧进程，以及属于本项目、仍占用 `3000` 或 `5173` 的陈旧进程。
8. 后台启动后端 `nodemon + ts-node` 和前端 `vite`，并写入 PID 文件。

### 为什么之前运行脚本“没作用”

这次排查发现，`3000` 端口被上一次启动留下的 `ts-node` 子进程占用。旧脚本只停止 `.runtime/backend.pid` 里记录的 `nodemon` 父进程，但真正监听后端端口的是它启动出来的子进程：

```text
node ...\ts-node\dist\bin.js src/app.ts
```

因此再次运行 `scripts/start-local.ps1` 时，脚本会检测到 `3000` 已被占用并直接退出，看起来就像“没有效果”。现在脚本已经改成递归停止进程树，并且会自动清理属于本项目的陈旧端口占用。

如果端口被其它项目占用，脚本仍会中止并提示你先手动处理，避免误杀无关进程。

## 手动启动

如果不使用脚本，也可以手动启动。

### 1. 准备环境变量

后端至少需要：

```env
OPENAI_API_KEY=your_key_or_local_placeholder
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.4
MONGODB_URL=mongodb://127.0.0.1:27017/wordpecker
PORT=3000
NODE_ENV=development
```

前端需要：

```env
VITE_API_URL=http://localhost:3000
```

可选变量：

- `ELEVENLABS_API_KEY`：语音/发音相关功能。
- `PEXELS_API_KEY`：Vision Garden 股票图片来源。

### 2. 安装依赖

```powershell
cd F:\aprojects\wordpecker-app\backend
npm ci

cd F:\aprojects\wordpecker-app\frontend
npm ci
```

### 3. 启动 MongoDB

本地脚本默认查找 Windows 服务名 `MongoDB`。如果你使用 Docker 或其它服务名，请相应修改 `MONGODB_URL` 或启动方式。

### 4. 启动后端和前端

```powershell
cd F:\aprojects\wordpecker-app\backend
npm run dev

cd F:\aprojects\wordpecker-app\frontend
npm run dev
```

## Docker 启动

完整容器化启动：

```powershell
cd F:\aprojects\wordpecker-app
Copy-Item .env.docker .env
# 编辑 .env，填入真实 OPENAI_API_KEY / ELEVENLABS_API_KEY / PEXELS_API_KEY

docker compose up --build
```

仅启动 MongoDB：

```powershell
cd F:\aprojects\wordpecker-app
docker compose -f docker-compose.mongo.yml up -d
```

停止 Docker 服务：

```powershell
docker compose down
# 或仅停止 MongoDB-only compose
docker compose -f docker-compose.mongo.yml down
```

## 主要前端页面

| 路径 | 页面 |
| --- | --- |
| `/` | 纪律入口重定向 |
| `/lists` | 词表列表 |
| `/lists/:id` | 词表详情与单词管理 |
| `/learn/:id` | 学习练习 |
| `/quiz/:id` | 测验 |
| `/reviews` | 到期复习 |
| `/mistakes` | 错题本 |
| `/words/:wordId` | 单词详情 |
| `/settings` | 偏好设置 |
| `/describe` | Vision Garden 图片描述发现词汇 |
| `/learn-new-words` | 主题/上下文新词探索 |
| `/learn-new-words/session` | 新词学习会话 |
| `/reading/:listId` | 轻阅读 |
| `/voice-chat/:listId` | 语音对话 |

## 主要后端 API

后端入口在 `backend/src/app.ts`，当前挂载的 API 分组如下：

| 前缀 | 用途 |
| --- | --- |
| `/api/lists` | 词表 CRUD、到期复习、纪律状态、错题本、词表内单词管理 |
| `/api/learn` | 学习练习生成、继续生成、复习结果写入 |
| `/api/quiz` | 测验生成、继续生成、复习结果写入 |
| `/api/templates` | 官方/内置词表模板、分类、克隆模板 |
| `/api/preferences` | 用户语言和学习偏好 |
| `/api/describe` | 图片描述练习、提交结果、添加建议词、历史记录 |
| `/api/vocabulary` | 主题新词生成、发现词评分、单词详情补全 |
| `/api/language-validation` | 语言配置校验 |
| `/api/audio` | 发音音频、缓存、可用声音、句子朗读 |
| `/api/voice` | OpenAI Realtime 语音会话 |
| `/api/backgrounds` | 背景图库随机、列表、删除 |
| `/backgrounds` | 静态背景图片服务 |

项目目前没有专门的 `/health` 接口。需要命令行冒烟验证时，可以用 `GET /api/lists`：

```powershell
Invoke-RestMethod http://localhost:3000/api/lists
Invoke-WebRequest http://localhost:5173
```

## 测试与验证

后端测试：

```powershell
cd F:\aprojects\wordpecker-app\backend
npm test
```

后端构建：

```powershell
cd F:\aprojects\wordpecker-app\backend
npm run build
```

前端构建：

```powershell
cd F:\aprojects\wordpecker-app\frontend
npm run build
```

前端到期复习 smoke 脚本：

```powershell
cd F:\aprojects\wordpecker-app\frontend
npm run smoke:due-review
npm run smoke:due-review-window
```

开发时建议优先运行与改动相关的测试，再视情况运行完整构建。

## 数据与运行时文件

- `.runtime/`：本地脚本记录 PID 和临时导入数据，通常不需要手动改。
- `logs/`：`start-local.ps1` 写入的后端/前端 stdout 和 stderr。
- `backend/data/learning-snapshot.json`：仓库内学习数据快照，后端启动时会按需恢复。
- `backend/.env`、`frontend/.env`：本地环境变量文件，脚本会覆盖写入。

## 常见问题

### 端口被占用

本项目默认使用：

- 后端：`3000`
- 前端：`5173`
- MongoDB：`27017`

查看占用：

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
Get-NetTCPConnection -LocalPort 5173 -State Listen
```

如果占用者属于当前项目，重新运行 `scripts/start-local.ps1` 会自动清理。如果占用者来自其它项目，需要先停止那个进程或修改端口配置。

### MongoDB 服务不存在

`start-local.ps1` 默认要求 Windows 服务名为 `MongoDB`。如果没有安装本地 MongoDB，可以改用 Docker MongoDB：

```powershell
docker compose -f docker-compose.mongo.yml up -d
```

然后确认 `backend/.env` 中 `MONGODB_URL` 指向可访问的 MongoDB。

### AI、语音或图片功能不可用

普通词表、模板、学习状态等本地功能可以用占位 key 启动；但以下功能需要真实密钥：

- OpenAI：释义生成、练习生成、图片描述分析、新词探索、语音实时会话。
- ElevenLabs：发音音频。
- Pexels：股票图片来源。

更新密钥后重启后端即可。

## 贡献注意事项

- 后端改动尽量补充 Jest/Supertest 测试，测试内部链路时不要 mock 自己的内部接口。
- UI 行为测试应尽量模拟真实 DOM 点击和用户操作。
- 不要提交 `node_modules/`、`logs/`、`.runtime/`。
- 修改本地启动流程后，请至少验证 `scripts/start-local.ps1`、前端首页和 `GET /api/lists`。
