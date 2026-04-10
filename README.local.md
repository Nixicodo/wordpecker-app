# WordPecker 本地部署说明

这个目录已经按 Windows 本机环境部署为可运行状态，项目根目录在 `F:\aprojects\wordpecker-app`。

## 启动

在 PowerShell 中执行：

```powershell
cd F:\aprojects\wordpecker-app
.\scripts\start-local.ps1
```

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

- 当前部署默认会自动生成根目录 `.env`，并填入一个本地占位 `OPENAI_API_KEY`，这样应用可以正常启动。
- 这意味着和 OpenAI、ElevenLabs、Pexels 真实联网的能力默认不可用；如果你之后要使用 AI 生成释义、图片、语音等功能，把 `.env` 里的对应 key 换成你自己的即可。
- 普通的前端加载、MongoDB 连接、列表接口、模板种子数据等本地运行能力不受影响。
