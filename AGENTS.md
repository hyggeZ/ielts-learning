# 项目约定

这是 hyggeZ 的个人雅思范文分析项目。修改前阅读 `docs/INTERFACE-1.0.0.md` 与 `docs/CONTENT-RULES.md`。

用户已确认 1.0.0 界面；新增文章复用，不引入多余标题、练习或独立滚动面板。原文与笔记锚点兼容优先。

编辑源为 content 数据及 scripts/author*.py；界面为 app.js、style.css、index.template.html。执行 `python scripts/build.py` 生成 index.html。原始 PDF 与私人笔记不提交。不要提交机器专用路径、认证资料或临时发布脚本。

验证：`python scripts/validate.py`、`node --check app.js`、`npm test`。没有实际执行的浏览器验证不得声称通过。

Git：main 为已发布主线，后续功能使用 feature/、修复使用 fix/。变更发布需有用户授权，普通快进推送，禁止擅自强推或删除历史。
