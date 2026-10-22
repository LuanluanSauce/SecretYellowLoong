# 此处禁止摆龙

俯视校园小游戏：摆放奶龙立牌、吸引学生打卡、用好感升级道具，在巡逻安保赶到前抱龙搬家。

项目仓库：<https://github.com/LuanluanSauce/SecretYellowLoong>

## 部署与分享

这个游戏不调用 ChatGPT、OpenAI API 或境外 CDN；所有运行资源都保存在 `dist/` 中，可以部署在普通静态网站托管上。

### 腾讯 EdgeOne Makers

导入本仓库，框架选 Other，根目录为仓库根目录。`edgeone.json` 已提供配置：安装命令 `node --version`，构建命令 `npm run build`，输出目录 `dist`。

**大陆长期分享链接需要单独配置。** 按腾讯的[域名说明](https://pages.edgeone.ai/zh/document/domain-overview)，默认域名在中国大陆网络下需要使用有效期 3 小时的预览链接；长期分享建议绑定自定义域名。选择“中国大陆”或“全球含中国大陆”加速区域需要已备案域名；“全球不含中国大陆”区域不要求备案，但不代表所有内地网络都能稳定访问。

### GitHub Pages（备用入口）

已准备 `.github/workflows/pages.yml`。在仓库 Settings → Pages 中把 Source 设为 GitHub Actions，推送 `main` 或手动运行工作流，即会执行语法检查、玩法测试、构建并部署 `dist/`。部署成功后，工作流的 `github-pages` 环境会显示实际网址。

GitHub Pages 是备用托管方式，不能把它当作已经验证的大陆稳定访问方案。

### 离线版本

执行 `npm run build` 后，`dist/offline.html` 包含全部样式、游戏代码和 SVG 图片。保存这个文件，在浏览器中直接打开即可玩，不需要服务器或网络。它也可以放到任何静态主机上。

在线游戏的玩法说明中提供源码与离线版下载入口。

## 运行

这是没有第三方运行依赖的静态网站。把 `dist/` 放入任意静态 Web 服务即可运行，例如在项目目录执行 `python3 -m http.server 8080 --directory dist` 后打开 `http://localhost:8080`。原生 ES 模块需要 HTTP 服务，不使用 `file://` 直接打开。

## 操作与胜负

- WASD / 方向键移动，也能点击地图自动寻路。
- E / 空格放下立牌；靠近立牌后再次按 E 抱起。
- 按住 Shift 冲刺；体力会自动恢复。
- P / Esc 暂停。手机提供方向按钮、冲刺开关、放置按钮。
- 一局 180 秒。轻松模式目标 18 人，普通模式 24 人。到时间达标且仍有备用立牌则获胜。
- 食堂、图书馆、树林、宿舍具有不同打卡效率。树荫内可降低远处安保发现的机会。
- 学生每人只打卡一次，收益用于升级小推车、发光灯牌、巡逻路线情报。
- 视野感知、遮挡、声音调查、最后出现位置追踪、2 秒撤牌进度、备用立牌重生组成安保状态机。
- 本地保存最高打卡纪录。失去页面焦点自动暂停。

## 文件

- `dist/engine.js`：独立、可测试的模拟逻辑，格子碰撞、BFS 寻路、视线、学生/安保状态、经济与胜负。
- `dist/game.js`：Canvas 地图与角色绘制、交互、音效、DOM 状态同步。
- `dist/style.css` / `dist/index.html`：响应式界面与操作面板。
- `dist/assets/nailoong.svg`：可替换的手绘 SVG 同人立牌。
- `tests/scenarios.test.js`：路径、视线、打卡去重、追逐撤牌、升级、暂停与结算的情景验证。

## 开源与形象参考

参考调研：

1. Straker, [Basic Bomberman HTML and JavaScript Game](https://gist.github.com/straker/769fb461e066147ea16ac2cb9463beae)，作者标注 CC0 1.0 Universal。该示例的二维格子地图、Canvas 绘制、requestAnimationFrame 主循环与实体更新结构，适合轻量单人游戏。本项目沿用这些架构思路；校园游戏逻辑和视觉重新编写。
2. [Golden76z/bomberman_js](https://github.com/Golden76z/bomberman_js)，MIT，DOM 格子地图实现，用作架构比较参考，没有复制其代码或美术。
3. [第七印象奶龙官网](https://www.nailoong.com/ipStar/Nailong/)，用于角色外观参考。游戏使用手绘、简化的 SVG 同人造型，未直接打包官网图片。奶龙角色属于原权利人，开源代码参考的许可不包含角色 IP 授权。

无需下载游戏引擎、字体、图片 CDN 或音频包。所有运行资源均在 `dist/` 中，音效由 Web Audio 合成。
