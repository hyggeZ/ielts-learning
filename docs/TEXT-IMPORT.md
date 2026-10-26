# 文本导入

“文本导入”用于粘贴新范文，或读取 UTF-8 `.txt` 文件。新增文章与原有文章共用阅读和选文笔记界面，保存在当前浏览器；导入过程不会自动生成译文或分析。

最简单的格式：第一块是完整题目，以空行与正文分开；正文每段之间空一行。

```text
Some people believe that children should spend less time studying.
To what extent do you agree or disagree?

In recent years, ...

On the one hand, ...
```

如果题目本身也有空行，使用分区标记可避免歧义：

```text
[标题]
学习与运动

[题目]
Some people believe that children should spend less time studying.
To what extent do you agree or disagree?

[题目译文]
有些人认为孩子应减少学习时间。你在多大程度上同意或不同意？

[原文]
In recent years, ...

On the one hand, ...

[译文]
近年来，……

一方面，……
```

必填 `[题目]` 与 `[原文]`；标题、题目译文和逐段译文均可省略。也支持 `【题目】`、`题目：` 等同名标记，`正文` 可代替 `原文`。提供逐段译文时，段数必须与原文一致。内容按纯文本保存，HTML 不会被执行。

限制：整篇不超过 30 万字符、题目不超过 1.2 万字符、正文最多 100 段、每段不超过 2 万字符、标题不超过 120 字符。解析器 `IeltsTextImport.parse(text)` 返回文章数据，不分配 id；`validate(essay)` 检查持久存储中的导入文章。
