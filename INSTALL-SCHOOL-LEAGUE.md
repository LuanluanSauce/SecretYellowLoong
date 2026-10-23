# 校园双榜 V2：从空榜开始，免登录为母校上分

本版取代上一版“社交平台初始热度 + 玩家贡献”的设计。没有演示分，没有小红书统计导入，榜单只记录实际完成并提交的游戏成绩。

## 覆盖到哪里

把更新 ZIP 解压后的**内容**复制到项目根目录，也就是 VS Code 里能看到 `package.json`、`dist` 和 `.github` 的那一层；合并文件夹并替换同名文件。不要把整个 ZIP 文件夹放进 `dist`。

这是累计更新包：无论你是否装过上一个学校榜包，都可以覆盖。原地图引擎 `dist/engine.js`、主样式 `dist/style.css`、奶龙 SVG 保持原文件。

## 两张榜的规则

| 榜单 | 每校保存什么 | 每次提交怎么更新 |
| --- | --- | --- |
| 累计最热 | 所有有效对局的点赞总和、贡献局数 | 累计点赞 += 本局点赞，贡献局数 += 1 |
| 单局最高热度 | 一位匿名玩家代表学校创造的最高单局纪录 | 本局点赞高于历史纪录才替换，较低或相同分数保留原纪录 |

默认每个学生打卡计 1 赞，两种难度相同，不再加通关奖励。学校 A 收到 15、21、12 赞三局后，累计 48 赞、单局纪录 21 赞；学校 B 一局拿到 30 赞，累计榜 A 在前、单局榜 B 在前。

单局榜每所学校一条纪录，纪录保持者显示“匿名玩家”。服务端用最高纪录对应的对局 ID 保留来源，公众看不到访客标识、IP 标识或提交 token。免登录不宣称能识别真实个人；换设备或清除浏览器存储会成为新的匿名访客。

- 新数据库中两张榜都是空数组，学校不会自动占据榜单行。
- 高校**目录**与参赛**榜单**分开：目录可提前包含很多学校，首次成功提交后才把该校加入榜。
- 搜索和选校本身不会创建参赛记录，也不会加分。
- 同一局只能给一所学校提交一次。网络重试返回原回执，不重复累加。
- 合法完成的 0 赞对局也可让学校入榜，累计和纪录均为 0，局数为 1。
- 不同学校同分按学校 ID 稳定排序；地区筛选保留总榜名次。
- “不在榜单”但“在目录”的学校可由玩家首发。目录尚未收录的学校需先补充目录；不能通过随意输入一个校名制造重复学校。

## 先在自己电脑运行共享榜

安装 Node.js 24，在项目终端运行：

```bash
npm run check
npm test
npm start
```

打开 `http://localhost:8787`。Node 服务同时提供游戏和 API，自动使用共享数据库。无需 `npm install`，无需登录、邮箱或账号。

用两个浏览器档案分别玩一局，为同一所学校提交，再打开校园双榜，两边会看到相同结果。数据库首次启动自动创建在 `server/runtime/league.sqlite`；参赛学校和成绩表开始为空。重启不丢分，运行时目录不会提交到 Git。

`localhost` 只用于本机验证，不能直接发给朋友。要让大家刷同一张榜，还需要把这个服务部署到朋友能访问的主机，使用持久磁盘保存数据库。当前更新包没有创建公网服务。

## 继续使用 GitHub Pages

直接推送本包后，GitHub Pages 前端使用明确标记的“本机练习榜”，并非所有玩家共享的榜。提交：

```bash
git add .
git commit -m "Add anonymous cumulative and best-round school boards"
git push
```

要连接已经部署的共享服务，修改 `dist/data/league-config.json`：

```json
"storageMode": "remote",
"apiBaseUrl": "https://你的服务域名/api"
```

服务端 `LEAGUE_ALLOWED_ORIGINS` 配成 `https://luanluansauce.github.io`，不要带仓库路径或末尾斜杠。独立 API 需要 HTTPS，才能供 HTTPS 的 Pages 使用。前端与服务端学校目录、配置、赛季 ID 要一致。

环境变量：`PORT`（默认 8787）、`LEAGUE_DB_PATH`（持久数据库文件路径）、`LEAGUE_ALLOWED_ORIGINS`（逗号分隔多个来源）、`LEAGUE_TRUST_PROXY=1`（仅在你控制的反向代理后启用）。附有 `server/Dockerfile`。

## 哪些地方留给你更新

| 文件 | 用途 |
| --- | --- |
| `dist/data/schools.json` | 学校 ID、校名、英文名、简称、国家、未来地图地区归属 |
| `dist/data/league-config.json` | 共享模式、API 地址、赛季和积分规则 |
| `CODEX-MAP-HANDOFF.md` | 交给下一次 Codex 的地图与高校数据接入要求、已有接口、验收标准 |

本版仍以现有 256 条中国和英国学校目录为基础，支持以后加入其他国家。`countryCode` 使用 ISO 两位代码，英国为 `GB`；旧 `region: UK` 保留兼容，地图和国家筛选使用 `countryCode`。

`mapRegionId: null`、`geoStatus: pending` 表示该校的地图归属尚未核实。**本包没有接入地图界面，也没有伪造校园坐标**；下一步任务明确写在交接文件里。补充学校不会让学校自动入榜。更新校名和地区时保留同一个学校 ID，不要删掉已有学校 ID 后重建，否则历史成绩不能正确关联。

## 与上一版的关系

- 新赛季 ID 为 `campus-live-s1`，前端本机存储和服务端表均与上一版隔离，不把演示分、旧加权分混入新榜。
- 若你已经运行过旧服务，它的旧表保留，程序不会删库；新版本只读写 V2 的参赛和对局表。
- `initial-heat.json` 已替换为退役标记，程序不再读取；旧 CSV 即使留在目录中也不再有作用。
- 原 `import:heat` 命令已移除，旧导入脚本会明确报“已取消”。无需爬取、填写任何社交媒体数据。
- 离线版仍为本机练习榜。`npm run build` 重新打包学校目录和配置到 `dist/offline.html`，不嵌入初始热度。

## 服务端接口

- `GET /api/leaderboard?seasonId=campus-live-s1&board=total`：累计最热，只含已参赛学校。
- `GET /api/leaderboard?seasonId=campus-live-s1&board=best`：学校单局最高热度，只含已参赛学校。
- `GET /api/schools?q=北大&countryCode=CN&mapRegionId=...`：搜索可选学校目录，可省略筛选参数。
- `GET /api/map-regions?seasonId=campus-live-s1`：供未来地图使用的地区汇总；累计取和、单局取最大值；无地区映射的学校计入 `unlocatedSchools`，不随意放进某个地区。
- `POST /api/rounds/start`：匿名访客开局，获得本局提交凭证。
- `POST /api/rounds/finish`：提交学校 ID、对局结果与凭证；返回本局分、两榜名次、学校累计、学校纪录、是否首发、是否破纪录。
- `GET /api/health`：存活和当前赛季。

Node + SQLite 不使用第三方依赖。服务端检查学校、结果形状、时间、凭证，事务更新累计与最高纪录，按匿名访客和 IP 哈希限流。这是基础防重复与防刷；尚非服务器重放式反作弊。匿名标识仅用于提交关联和限流，面向公众的榜单不披露它们。
