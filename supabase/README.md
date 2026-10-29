# 词库云同步后端

此目录提供 Supabase PostgreSQL + Auth + Edge Function 的后端代码。私人词库只写入用户自己的 Supabase 项目，不提交到 GitHub。网页只允许配置项目 URL 与 **publishable key**；数据库密码、secret/service-role key 不进入前端或仓库。

## 部署顺序

1. 在用户自己的 Supabase 项目中依次执行 `migrations/202610260001_vocabulary.sql` 与 `migrations/202610270001_vocabulary_sync.sql`。第二个迁移创建版本号和幂等操作记录，并关闭旧的无版本写入口。不要在未知现有数据库里直接执行。
2. 配置 Supabase Auth 的个人登录方式。在每台设备使用同一账号登录；匿名会话无法跨设备识别为同一人。
3. 设置 Edge Function 环境变量 `ALLOWED_ORIGINS`，逗号分隔**精确 Origin**，例如 `https://hyggez.github.io,http://127.0.0.1:8765,http://127.0.0.1:8000`。不含路径、末尾斜杠或通配符；`file://` 页面不连接云端。
4. 部署 `functions/vocabulary/index.ts`，关闭控制台的“Verify JWT with legacy secret”（`config.toml` 中 `verify_jwt = false`）。函数会自行向 Supabase Auth 验证用户令牌；旧版网关验证器不能验证新签名密钥签发的令牌。托管环境提供 `SUPABASE_URL` 和 `SUPABASE_PUBLISHABLE_KEYS`（JSON，函数取 `default` 键）；仅在前者不可用时回退到托管环境的旧版 `SUPABASE_ANON_KEY`。无需手动设置 Supabase 前缀环境变量。函数使用用户 JWT 调用 PostgREST，不使用 service-role key。
5. 用真实测试账号检查登录、初次迁移、两设备增改、取消收藏、忘词状态与彻底删除。仅 Node 模拟测试通过不代表已在真实项目完成验证。

Supabase 官方参考：[Edge Function 授权头](https://supabase.com/docs/guides/functions/auth-headers)、[函数环境变量](https://supabase.com/docs/guides/functions/secrets)、[浏览器 CORS](https://supabase.com/docs/guides/functions/cors)、[PostgreSQL RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 接口契约

所有请求都是 `POST /functions/v1/vocabulary`，带 `apikey: <publishable key>`、`Authorization: Bearer <用户 access token>` 和 JSON。响应主体为 `{ "data": ... }`。

| action | 请求其他字段 | data |
| --- | --- | --- |
| `head` | 无 | `{revision}` |
| `snapshot` | 无 | `{revision,backup}`，backup 与本地 `ielts-vocabulary` v1 备份同形 |
| `mutate` | `baseRevision`、`operationId` UUID、`operations` | `{revision}` |
| `replace` | `baseRevision`、`operationId` UUID、`backup` | `{revision}`，**仅空云端首次迁移** |

`mutate.operations` 最多 500 项、请求最多 8 MB。建议导入分批 50–100 词。支持以下操作：

- `{type:"upsert",word}`：完整替换**一个词**的词形、别名、状态、全部资料与来源；缺失的资料被删除。现有词 UUID 按规范 key 复用，现有资料 UUID 按内容指纹复用。`collected:false` 必须原样保留。
- `{type:"rename",oldKey,word}`：原子重命名并完整更新，保留词 UUID；目标 key 已存在时报错，不擅自合并。
- `{type:"forget",key,forgotten}`：设为 true 时忘记次数加 1；设为 false 时只移出忘词本。
- `{type:"uncollect",sourceId}`：只把该来源的 `collected` 设为 false，不删词。
- `{type:"delete",key}`：彻底删除词与关联资料。

规范 key 为 NFKC、首尾去空格、连续空白折叠、忽略大小写。客户端本地 `w-...` / `c-...` ID 与云端 UUID 不同；首次迁移后必须读取云快照并采用云 ID。`restoreData` 的合并语义不能用来应用云快照，否则旧设备会复活已删除词或已清除的忘词状态。

每次写入必须提交已知的 `baseRevision`。事务锁定该用户版本号，只有匹配时才应用整批操作并加 1；版本不匹配返回 HTTP 409、`code:revision_conflict`。客户端应拉最新快照，将未同步的**语义操作**重放后用新版本重试。`operationId` 记录在数据库中，网络超时后以同一 ID 重试不会重复增加忘记次数。`head` 只传版本号；版本变化时再用 `snapshot` 拉完整词库，不必每次轮询传 1.6 MB。

`replace` 限制云端版本为 0 且没有词，防止旧备份覆盖其他设备已做的修改。此后手动导入备份应先与最新云快照合并，再分批 `upsert`，不能再次使用 `replace`。云端删除依靠版本化权威数据传播；不依赖客户端旧缓存或单独墓碑表。

`words` 与 `word_contents` 仍分表存储，RLS 只允许当前用户读取自己的行；写入只能通过验证 `auth.uid()` 的版本化 RPC。函数的模拟协议测试在 `tests/edge-function.test.mjs`，数据库迁移与真实 RLS 尚需项目创建后实测。
