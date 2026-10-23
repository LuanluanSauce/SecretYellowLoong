# 接续任务：给校园双榜接入开源地图与高校目录

这是用户已确定的新规则。请以当前 V2 代码为基础继续实现地图，不要恢复小红书初始热度、预置假分或默认满员的学校榜。

## 用户要什么

玩家免登录，先玩一局，结算时通过搜索或地图选择高校。目录里有但尚未入榜的高校，首次提交后自动参赛；已参赛高校累加点赞，并保留某位匿名玩家创造的最高单局纪录。两张榜分别叫“累计最热”和“单局最高热度”。开服时没有玩家，榜单必须是空的。

例如某校收到三次 15、21、12 赞，累计是 48，单局最高是 21。一次提交原子地处理两张榜。最高纪录同分不替换。每所学校在每张榜只占一行；这里的“个人”指创造那一局纪录的匿名玩家，不是要求账号体系或个人累计排行榜。

## 已经完成的部分

- `dist/league-core.js`：无初始分的两榜规则，目录搜索，本机适配器和共享 API 适配器，地区汇总函数。
- `dist/school-league.js`：结算选校、学校首次入榜提示、双榜切换、匿名纪录、战报复制。
- `server/server.mjs`：Node.js 24 + 内置 SQLite，真实共享数据库，只有首次提交的学校才写入参赛表。
- `league_schools`：参赛学校索引；与静态 JSON 目录不同，不能启动时整表预灌学校。
- `league_stats`：赛季/学校的 total_heat、rounds、best_heat、best_round_id、best_at、best_mode。
- `league_rounds`：对局凭证、匿名访客哈希、成绩、幂等回执；可从 best_round_id 追溯匿名纪录来源，不向公众披露访客/IP 标识。
- 学校目录 256 条，当前仅中国和英国；国家筛选可随目录扩展。
- `GET /api/schools`、`GET /api/map-regions` 已有供地图使用的接口。
- 当前配置：每次学生打卡计 1 赞，两个难度同样计分，通关不另加分。

**尚未完成：地图渲染、地图点击选校、全球高校目录导入、学校坐标和行政区归属核实。不要把这些描述为已有功能。** 当前所有学校 mapRegionId 为空；地区汇总因缺少映射而为空是正确行为，不是要往里塞假数据。

## 地图选型和开源来源

1. 行政区边界：geoBoundaries 的 gbOpen，取简化 GeoJSON，保留来源、版本及署名。仓库 https://github.com/wmgeolab/geoBoundaries ，API 说明 https://www.geoboundaries.org/api.html 。世界概览用国家；中国内部按省级；其他国家可按 ADM1。
2. 英国单独处理：geoBoundaries GBR ADM1 是四个构成国，不适合直接当成很多个英国赛区。建议采用 ONS ITL1 的 12 个统计区域（英格兰九区加苏格兰、威尔士、北爱尔兰），UI 称“地区”。从 ONS 官方下载相应边界并核对版本与许可，不要把它标成英国行政省份。官方入口 https://geoportal.statistics.gov.uk/ ，地域说明 https://www.ons.gov.uk/methodology/geography/ukgeographies/eurostat 。
3. 世界背景备选：Natural Earth 公共领域数据 https://www.naturalearthdata.com/ 。不用背景地图就不额外引入。
4. 高校扩展：ROR 数据导出 https://ror.readme.io/docs/data-dump 。筛选 Education 类型、合适的有效状态，按 ROR 稳定 ID 去重，保留原中文/英文别名。其位置通常来自 GeoNames 城市，不能伪称为准确校园坐标；保留 GeoNames 署名。
5. 渲染：Apache ECharts https://github.com/apache/echarts ，载入本地 GeoJSON 做分级设色，叠加经核实的高校点位。遵守 Apache-2.0，随包提供许可与来源说明。

不要让玩家运行时依赖国外 GeoJSON、CDN、ROR API 或在线地理编码接口。构建时处理数据，所需 JS/GeoJSON/目录打包到项目里，运行时读同站点静态文件。对未核实的边界与校区位置显式保留缺失状态。

## 学校与地区的数据契约

当前目录 `dist/data/schools.json`，学校条目：

```json
{
  "id": "cn-pku",
  "name": "北京大学",
  "englishName": "Peking University",
  "aliases": ["北大", "PKU"],
  "countryCode": "CN",
  "mapRegionId": null,
  "geoStatus": "pending"
}
```

示例仅说明结构，实际条目不一定已填英文名。现有 id 必须保留。新接入 ROR 条目应先对现有学校进行匹配，避免把同一学校以中英文名字重复创建；可添加 `rorId` 作为来源字段。英国国家代码是 GB，不是旧 UI 的 UK。

建议新增 `dist/data/map-regions.json`，包含内部稳定地区 ID、名称、国家代码、边界数据来源、源 feature ID 到内部 ID 的映射。`mapRegionId` 关联这个内部地区 ID；不要只靠可能重复的英文地名拼接。`geoBoundaries` shapeID 或 ONS code 若版本改变，需要显式映射和迁移，不能让学校成绩串到别的地区。

坐标字段建议 longitude/latitude、geoSource、coordinatePrecision（campus 或 city）。缺失时不画假点；所在行政区已经核实时仍能参与区域汇总。ROR 城市坐标可用于地区匹配候选，跨省/州多校区需按明确规则决定单一参赛归属，或把真正独立参赛的校区建成独立学校实体；一份成绩不能重复计入多个地区。待核实条目应可列出，以便人工补充。

高校目录不是榜单。导入地图或扩大目录，只更新可选项，不创建 league_stats，也不让空榜显示一大堆 0 分学校。不能仅凭自由输入名字创建参赛实体，否则会出现“北大”和“北京大学”两个榜单项。

## 界面行为

- 结算显示本局点赞，提供“搜索高校”和“地图选校”；地图能按国家→省/州/地区筛选校名。
- 地图选中某校后，复用现有 schoolId 提交流程；未上榜时提示“成为母校第一位代表”。
- 国家/地区筛选、地图和搜索联动；地图没加载好也能搜索选校。
- 校园榜保留累计/单局两个切换项。地图相应切换指标：累计用地区内学校 totalHeat 之和，单局用地区内学校 bestHeat 的最大值，不能把单局纪录相加。
- 没有参赛学校的地区中性色，不用演示值点亮；无法定位的参赛学校仍在学校榜里，标明未归属地图。
- 更新地区映射只改变展示归属，不清空任何学校成绩。可使用 GET /api/map-regions 的 unlocatedSchools 做提示。
- 不增加邮箱授权、登录、注册。保持原游戏玩法和移动端可操作性，打开地图/榜单时暂停本局。

## 接口和部署

GET /api/leaderboard?seasonId=campus-live-s1&board=total 或 best 返回 schools 数组。
学校行字段：id/name/countryCode/mapRegionId/totalHeat/bestHeat/rounds/bestAt/bestMode/recordHolder/rank。
GET /api/map-regions 返回地区列表，每项 countryCode/mapRegionId/totalHeat/bestHeat/rounds/schools，另有 unlocatedSchools。
GET /api/schools?q=...&countryCode=...&mapRegionId=... 搜索目录。
POST /api/rounds/start 和 finish 已实现；沿用原来每局一次、幂等、防篡改结果形状、时间和限流校验。

共享功能必须部署 Node + 持久化 SQLite 服务，默认 npm start 启动在 localhost:8787。GitHub Pages 只能托管静态前端，单独打开 Pages 是明确标注的本机练习榜。没有新部署证据前，不要声称已经有朋友可访问的共享榜。

## 验收

1. 新数据库首次打开两张榜均为空，高校可以搜索，不用登录。
2. 玩家选一所未上榜学校提交首局，只新增该校，两张榜都有记录。
3. 再提交较低成绩，累计增加，最高纪录和保持者不变；提交较高成绩才更新最高纪录。
4. 另一位匿名访客给同校上分时共享累加；重复请求不重复加分。
5. 地图筛选能找到目录中的未上榜学校，单纯搜索和点击不让学校入榜。
6. 累计地图求和，单局地图取最大值，无成绩地区保持无成绩状态。
7. 更新学校地区和地图数据后成绩保留，跨校区不重复汇总。
8. 手机、电脑能操作，地图加载失败仍能完成选校；地图资源同站点提供，无额外登录/API key。
9. 运行 npm run check、npm test、npm run build，补充真实地图选择与学校 ID 关联的集成验证。
