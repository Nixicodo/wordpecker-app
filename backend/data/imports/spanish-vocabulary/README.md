来源仓库：`https://github.com/GreenAnts/Spanish-Vocabulary`

本目录保存了导入到 WordPecker 的西语三语词表中间数据：

- `word-lists/*.JSON`：在原始西语/英语数据基础上补充了 `chinese` 字段。
- `zh-translations.json`：英文释义到中文释义的翻译映射。

说明：

- 源仓库当前只有 8 份词表文件：`_primer`、`adjectives`、`adverbs`、`conjunctions`、`interjections`、`prepositions`、`pronouns`、`verbs`。
- 本仓库额外补充了一份 `nouns.JSON`。它不是上游原始文件，而是基于词频数据和墨西哥西语优先规则整理出的三语名词表。
- 名词补充方法：
  1. 以 `doozan/spanish_data` 的词频表为主排序依据。
  2. 结合 `Sketch Engine` 的西语名词词表做高频段交叉检查。
  3. 明确排除偏西班牙本土的默认词，如 `coche / ordenador / móvil / zumo / peseta`，优先保留更适合墨西哥学习者的 `carro / computadora / celular / jugo / boleto / camión` 等词。
  4. 再补充中文释义，使最终文件成为西语/英语/中文三语格式。
- 导入脚本会基于这些文件创建 `西语3k词-Level0-Pre-A1` 到 `西语3k词-Level10-B1` 共 11 个词树。
