# 单词本与词库

本次先交付本地词库和两个网页，云端配置由用户决定后再接入。当前词库在当前浏览器保存；不同设备不会自动同步。网页代码上传 GitHub，私人词库不上传仓库。

## 数据和操作

- 词库初始为空。词只来自用户导入和作文页主动收藏，不自动批量加入现有作文批注。
- 同一规范词条只有一份身份与状态；词性、释义、短语、例句和原始文字按资料条目保存。同词的不同资料共存，相同资料的多个来源合并，重复导入不重置学习状态。
- 去重键使用 NFKC Unicode 规范、首尾去空格、连续空白合并、忽略大小写。不会擅自把不同词形或同义词合并。明确提供的别名可用于作文原文匹配。
- 作文注释的星星表示这条来源是否已收藏。点暗只取消此来源的收藏标记，保留词条、资料和其他来源。作文原文不会被改写。
- “忘记了”设置 `forgotten=true` 并增加忘记次数，不设置或增加抽词权重。
- 从“忘过的词”移除只设置 `forgotten=false`，保留词条、资料及历史次数。
- 忘词本卡片右上角只提供“移出忘词本”；彻底删除放在“全部”词库卡片，避免把移出词本误当成删库。
- 确认彻底删除后，删除词条、全部关联资料及状态；不会从旧缓存自动重新建立。以后主动重新导入或收藏可再次添加。

## 浏览方式

作文页与单词页共用词库。单词页有“全部／忘过的词”两本、“刷词／记忆”两种显示方式，并提供可搜索的词汇总览。记忆模式先显示单词，点击后展开资料；刷词直接展示资料。

抽词按轮随机打乱，每轮每个候选词出现一次，再打乱下一轮；有多个词时避免跨轮立即重复。“上一个”返回实际浏览历史，不重新抽取。“忘记了”不改变随机顺序。两本各自保留未完轮次，刷新后继续；新增词补入剩余队列，已删除的词会移出队列与历史。

## 未来可选云端

目录 `supabase/` 是预备后端，当前前端不会连接它，不含项目凭据，也没有执行建库或部署。

- `migrations/202610260001_vocabulary.sql`：PostgreSQL 两张业务表 `words`、`word_contents`，用户所有权、RLS、关联删除与事务 RPC。
- `functions/vocabulary/index.ts`：TypeScript Edge Function，验证用户 access token，携带同一用户上下文调用 RPC；不使用 service-role key。
- `functions/.env.example`：允许访问接口的前端 Origin 示例，不含秘密。

后端字段与前端含义对应：

| 表 | 主要字段 |
|---|---|
| `words` | `owner_id`、`key`、`word`、`aliases`、`forgotten`、`forget_count`、时间 |
| `word_contents` | `word_id`、内容指纹、词性、释义、短语、例句、原文、`sources` |

`sources` 为 `{id,label,quote,collected}` 数组。词条按 `(owner_id,key)` 唯一，资料按 `(word_id,fingerprint)` 唯一。资料使用复合外键校验词条和资料属于同一用户；删除词条级联删除关联资料。所有查询和写入均使用用户身份及 RLS，匿名请求无表权限。

### 接入时再执行的步骤

1. 用户在自己的 Supabase 账号下创建项目，选择区域，并用常用设备检查网络可达性。
2. 在 SQL Editor 运行迁移文件，或在已安装并登录的 Supabase CLI 中链接指定项目后执行 `supabase db push`。先在测试项目检查，不对未知现有数据库直接执行。
3. 在 Supabase Auth 建立个人登录账号。浏览器使用 publishable key 和个人登录会话；数据库密码、service-role key 不写入网页。
4. 设置 Edge Function 环境变量 `ALLOWED_ORIGINS` 为实际网页 Origin，例如 `https://example.com`，多个用逗号分隔，不带路径、不使用星号。托管运行环境自动提供 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`；函数也接受另行配置的 `SUPABASE_PUBLISHABLE_KEY`。
5. 用 `supabase functions deploy vocabulary` 部署函数。当前 `config.toml` 保留 JWT 校验；部署时核对项目当前 JWT 配置，不关闭验证来绕过失败。
6. 实现并验证前端云端适配与本地迁移；明确选择要上传的私人词库，再切换数据来源。当前页面没有自动上传行为。

### 接口

`POST /functions/v1/vocabulary`，请求带用户 `Authorization: Bearer <access token>` 和项目公开 API key。JSON 请求：

| `action` | 其他字段 | 返回 `data` |
|---|---|---|
| `list` | 无 | 全部词条，包含资料 |
| `import` | `entries` | 新增词条／资料数量 |
| `forget` | `id`、`forgotten` | 是否更新到词条 |
| `uncollect` | `sourceId` | 取消收藏的资料条数 |
| `delete` | `id` | 是否删除到词条 |

单次云端导入最多 5000 项、8 MB。事务内校验和合并；坏数据整批回滚。并发导入依靠唯一约束与行锁合并，重复导入保留既有状态；发生事务冲突时客户端应重新读取后重试。接口不支持直接写入任意所有者 ID。

### 验证边界

`node --experimental-strip-types supabase/tests/edge-function.test.mjs` 检查接口分发、用户鉴权、Origin、长度限制和异常处理，全部使用模拟请求，不连接网络。SQL 迁移和真实 Auth／RLS／级联删除仍需在创建测试项目后执行数据库集成检查；未配置云端时不能声称云端同步已经可用。
