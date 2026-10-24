# Cloudflare Workers + D1 部署指南（第一次部署）

正式地址：`https://game.loong.ydtandll.com`。主域名和现有网站不需要改动。

本项目会把 `dist/` 静态游戏、`worker/index.js` 排行榜 API 和 D1 数据库作为一个 Cloudflare Worker 部署。`/api/rounds/start` 使用无状态签名，不消耗 D1 写入；成功提交时才在一个 D1 事务中保存对局并更新榜单。

## 0. 部署前知道的事

- Cloudflare 免费网络没有中国大陆节点，大陆访问速度需要移动、联通、电信和校园网实测。
- 不要把 `LEAGUE_HASH_SECRET` 写进代码、聊天截图或 Git。
- `wrangler.jsonc` 已绑定本项目的 D1；如果以后换 Cloudflare 账号，需要创建新库并替换 `database_id`。
- 本地 Node + SQLite 服务仍可用；Cloudflare 部署使用 Worker + D1，两套数据库互不相通。

## 1. 安装依赖并检查 Wrangler

在 VS Code 中打开项目根目录 `Loong`，打开终端执行：

```powershell
npm install
npx wrangler --version
```

应使用 Wrangler 4.36.0 或更高版本。项目已经锁定兼容的最低版本；`npm install` 会生成或更新 `package-lock.json`。

## 2. 登录 Cloudflare

```powershell
npx wrangler login
npx wrangler whoami
```

第一条命令会打开浏览器。登录持有域名的 Cloudflare 账号并授权；第二条命令应显示账号信息。

## 3. 创建 D1 数据库（本项目首次部署已完成）

当前项目已经创建并绑定 `loong-league`，可以跳到第4步。只有换账号或重建数据库时才执行：

```powershell
npx wrangler d1 create loong-league
```

命令会返回 `database_id`，例如：

```text
database_id = "12345678-abcd-1234-abcd-1234567890ab"
```

打开 `wrangler.jsonc`，把旧的 `database_id` 替换为新 ID：

```json
"database_id": "Cloudflare返回的新ID"
```

不要修改 `binding: "DB"` 或 `database_name: "loong-league"`。

## 4. 准备本地开发秘密值

复制示例文件：

```powershell
Copy-Item .dev.vars.example .dev.vars
```

打开 `.dev.vars`，把示例值换成至少32字符的随机字符串。`.dev.vars` 已被 Git 忽略，只用于本机。

可以用 PowerShell 生成：

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

将输出填到：

```text
LEAGUE_HASH_SECRET="这里放随机字符串"
```

## 5. 初始化本地 D1 并测试

```powershell
npm run d1:migrate:local
npm run worker:dev
```

终端显示本地地址后打开它，通常为 `http://localhost:8787`。依次检查：

1. `/api/health` 返回 `"ok": true` 和 `"runtime": "cloudflare-worker-d1"`。
2. 首页能够开始游戏。
3. 页面写着“全校共享榜 · 免登录”。
4. 完成一局，选择学校并提交。
5. 刷新后成绩仍在。

停止本地服务按 `Ctrl+C`。本地成绩保存在 `.wrangler/`，不会上传到正式数据库。

## 6. 初始化云端 D1

```powershell
npm run d1:migrate:remote
```

看到迁移 `0001_initial.sql` 成功后再继续。首次排行榜为空是正确行为。

## 7. 保存生产秘密值

```powershell
npx wrangler secret put LEAGUE_HASH_SECRET
```

粘贴一段新的随机字符串。输入时终端可能不显示字符，这是正常的。生产值可以与 `.dev.vars` 不同。

## 8. 完整检查并部署

```powershell
npm run check
npm test
npm run worker:deploy
```

部署成功会显示一个 `*.workers.dev` 地址。先打开：

```text
https://你的Worker地址.workers.dev/api/health
```

然后完整玩一局并提交。正式环境与本地环境是两套 D1，正式榜从空榜开始。

如果 Windows 环境中 `npm test` 报 `spawn EPERM`，可使用：

```powershell
node --test --experimental-test-isolation=none tests/*.test.js
```

## 9. 自定义域名（本项目已完成）

`game.loong.ydtandll.com` 已在 `wrangler.jsonc` 中作为 Worker Custom Domain 配置。今后执行 `npm run worker:deploy` 会保留并校验这项绑定；不需要每次到控制台重新添加。

如需在控制台检查绑定：

1. 登录 Cloudflare 控制台。
2. 进入 **Workers & Pages**。
3. 打开 `loong-campus-game`。
4. 进入 **Settings → Domains & Routes**。
5. 选择 **Add → Custom Domain**。
6. 确认列表中存在 `game.loong.ydtandll.com`。

Cloudflare 会创建 DNS 和 HTTPS 证书，不要另外手工创建同名 A/CNAME 记录。如果提示 hostname 已存在，先在 DNS 页面确认旧的 `game` 记录没有用途，再删除旧记录并重新绑定。

绑定后检查：

```text
https://game.loong.ydtandll.com/api/health
https://game.loong.ydtandll.com
```

主域名 `ydtandll.com`、`www` 和邮箱 MX 记录不会被修改。

## 10. 日常更新

修改代码后：

```powershell
npm run worker:deploy
```

只有新增数据库迁移时才需要再次运行：

```powershell
npm run d1:migrate:remote
```

查看实时错误日志：

```powershell
npx wrangler tail
```

Cloudflare 控制台的 D1 页面可以查看用量和执行只读查询。不要随意删除 `league_rounds`、`league_stats` 或 `league_schools`。

## 常见错误

### `D1_ERROR: no such table`

尚未执行远程迁移：

```powershell
npm run d1:migrate:remote
```

### “榜单服务尚未配置完成”

尚未设置生产 secret：

```powershell
npx wrangler secret put LEAGUE_HASH_SECRET
```

### `database not found`

`wrangler.jsonc` 填入了不存在或属于其他账号的数据库 ID。重新执行 `npx wrangler d1 create loong-league` 并复制返回值。

### 自定义域名无法添加

检查 Cloudflare DNS 是否已有同名 `game` 记录。Worker Custom Domain 要求该 hostname 没有冲突的 CNAME。

### 大陆加载慢或偶尔超时

普通 Cloudflare 免费网络不包含大陆节点。游戏已提供无外部 CDN 的静态资源和首屏加载提示，但网络线路仍需实测；这不是 D1 或代码错误。
