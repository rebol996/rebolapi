# Rebol AI Gateway

半私有 AI API 网关平台

## 项目简介

这是一个自用为主、同时可以为朋友开通账号使用的 AI API 管理平台。统一管理 MiniMax、DeepSeek、Qwen、GLM、Kimi、小米 MiMo、OpenAI、Claude、Gemini 等供应商的 API Key、Base URL 和模型配置。

## 技术栈

- **前端**: Vue 3 + Vite + TypeScript + Tailwind CSS
- **后端**: Node.js + Fastify
- **数据库**: SQLite + Prisma
- **鉴权**: JWT + bcrypt

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. 配置环境变量

```bash
cd backend
copy .env.example .env
```

默认配置已预设，无需修改。

### 3. 初始化数据库

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
node prisma/seed.js
```

### 4. 启动服务

**一键启动（推荐）：**

```bash
npm run dev
```

这会同时启动后端（端口3000）和前端（端口5173）。

**分别启动：**

```bash
# 终端1 - 启动后端
npm run dev:backend

# 终端2 - 启动前端
npm run dev:frontend
```

**其他命令：**

```bash
npm run studio   # 启动 Prisma Studio（数据库可视化）
```

**生产模式：**

```bash
cd backend
npm run build
npm start
```

### 5. 访问

- 前端: http://localhost:5173
- 后端 API: http://localhost:3000

### 6. 默认管理员账号

- 用户名: `admin`
- 密码: `admin123`
- 邀请码: `REBOL2024`

## 功能概览

### 管理员功能
- 供应商管理（添加/编辑/删除 API 供应商）
- 模型管理（配置模型价格、能力标签）
- 用户管理（创建用户、分配权限、设置额度）
- 邀请码管理
- 查看所有调用日志
- 系统配置

### 普通用户功能
- 查看个人额度
- 创建/管理个人 API Key
- 使用聊天测试页面
- 查看个人调用记录
- 查看可用模型

## API 接口

平台提供 OpenAI Compatible API：

```
GET  /v1/models              - 获取可用模型列表
POST /v1/chat/completions   - 聊天完成
```

调用示例：
```bash
curl http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "x-api-key: YOUR_API_KEY" ^
  -d "{\"model\":\"deepseek-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello!\"}]}"
```

## 项目结构

```
rebolapi/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma    # 数据库结构
│   │   └── seed.js          # 初始化数据
│   ├── src/
│   │   ├── adapters/        # API 适配器
│   │   ├── middleware/      # 中间件
│   │   ├── routes/         # 路由
│   │   ├── services/       # 业务逻辑
│   │   ├── utils/          # 工具函数
│   │   ├── config.ts       # 配置
│   │   ├── db.ts           # 数据库连接
│   │   └── index.ts        # 入口文件
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── views/          # 页面组件
│   │   ├── stores/         # 状态管理
│   │   ├── types/          # 类型定义
│   │   └── router.ts       # 路由配置
│   └── package.json
├── README.md
└── .env.example
```

## 支持的供应商

- OpenAI (GPT-4, GPT-3.5)
- Claude (Anthropic)
- Gemini (Google)
- DeepSeek
- Qwen (阿里通义)
- GLM (智谱)
- MiniMax
- Kimi (月之暗面)
- MiMo (小米)

## 注意事项

1. 不要公开部署，本项目仅供个人及小范围使用
2. 定期备份数据库 (`backend/dev.db`)
3. 生产环境请修改 `.env` 中的 `JWT_SECRET`
4. 前端界面已中文化（中文界面）