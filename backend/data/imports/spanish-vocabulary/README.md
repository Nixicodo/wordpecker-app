来源仓库：`https://github.com/GreenAnts/Spanish-Vocabulary`

本目录保存了导入到 WordPecker 的西语三语词表中间数据：

- `word-lists/*.JSON`：在原始西语/英语数据基础上补充了 `chinese` 字段。
- `zh-translations.json`：英文释义到中文释义的翻译映射。

说明：

- 源仓库当前只有 8 份词表文件：`_primer`、`adjectives`、`adverbs`、`conjunctions`、`interjections`、`prepositions`、`pronouns`、`verbs`。
- 因此目前可导入总量为 1998 条，不是 README 声称的完整 3000 条；缺失的名词数据没有在源仓库中提供。
- 导入脚本会基于这些文件创建 `西语3k词-Level0-Pre-A1` 到 `西语3k词-Level10-B1` 共 11 个词树。
