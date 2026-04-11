# 学习调度系统重构需求与进度文档

## 1. 背景

当前学习与测验系统基于 `learnedPoint` 做单一分数累计：

- 答对 `+10`
- 答错 `-5`
- 按 `learnedPoint` 升序挑选“薄弱词”

这套机制实现简单，但存在明显缺陷：

- 无法表达遗忘时间，只能表达历史累计结果
- 无法区分“本来就难”和“最近忘了”
- 无法利用近期连续错误、答题速度、是否依赖提示等高价值信号
- 学习模式与测验模式共用同一套粗粒度逻辑，调度目标不清晰
- 错题本、词树统计、学习快照都建立在旧结构之上，扩展空间很有限

本次重构目标是以更合理的记忆状态模型替换旧分数模型，并同步调整数据结构、接口与前端展示。

## 2. 改造目标

### 2.1 核心目标

1. 用“记忆状态 + 复习日志”替换单一 `learnedPoint`
2. 让系统按“到期复习 + 薄弱优先”调度，而不是按粗暴分数排序
3. 保留现有单词、词树、学习记录的业务价值，不丢失已有数据
4. 重构错题本，使其与新学习状态模型一致
5. 为未来继续引入更完整的 FSRS/参数拟合保留空间

### 2.2 非目标

- 本阶段不做复杂的在线训练平台
- 本阶段不做用户级参数自动拟合
- 本阶段不做真正的深度 Knowledge Tracing

## 3. 方案选择

### 3.1 采用方向

采用 **FSRS-lite 风格的记忆状态模型 + 业务层弱词排序**：

- 记忆状态负责回答：词现在是否该复习、遗忘风险有多高
- 业务排序负责回答：候选词里哪些更值得优先出题

### 3.2 为什么不继续扩展旧分数

旧分数把以下多个概念混在了一起：

- 熟练度
- 遗忘状态
- 近期错误
- 词本身难度
- 下次复习时机

这些概念不应继续压缩成一个数值字段。

## 4. 新数据模型

### 4.1 词与词树关系

保留 `Word` 与 `WordList` 的主业务关系，但把旧 `ownedByLists` 的上下文结构替换为更明确的 `listMemberships`。

建议结构：

```ts
type WordListMembership = {
  listId: ObjectId;
  meaning: string;
  sourceListIds?: ObjectId[];
  tags?: string[];
  addedAt: Date;
  updatedAt: Date;
};
```

说明：

- `meaning` 继续按词树上下文保存
- `sourceListIds` 用于错题本记录来源词树
- 旧 `learnedPoint`、`wrongCount`、`lastWrongAt` 不再放在这里

### 4.2 学习状态

新增独立学习状态集合，粒度为：

`user + word + list`

建议结构：

```ts
type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
type ReviewSource = 'learn' | 'quiz' | 'mistake_review';

type LearningState = {
  userId: string;
  wordId: ObjectId;
  listId: ObjectId;

  difficulty: number;
  stability: number;
  retrievability?: number;

  dueAt: Date;
  lastReviewedAt?: Date;

  reviewCount: number;
  lapseCount: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;

  lastRating?: ReviewRating;
  lastSource?: ReviewSource;

  createdAt: Date;
  updatedAt: Date;
};
```

说明：

- 这是新调度系统的核心
- 任何与“掌握程度、遗忘风险、到期时间”有关的信息都放这里

### 4.3 复习日志

新增复习日志集合，记录每一次题目交互：

```ts
type ReviewLog = {
  userId: string;
  wordId: ObjectId;
  listId: ObjectId;

  source: ReviewSource;
  questionType: string;
  rating: ReviewRating;
  correct: boolean;

  responseTimeMs?: number;
  usedHint?: boolean;
  answeredAt: Date;

  createdAt: Date;
};
```

作用：

- 审计学习过程
- 支撑后续参数优化
- 支撑前端更丰富的学习统计

## 5. 新调度原则

### 5.1 候选词筛选

默认优先级：

1. 已到期词
2. 即将到期且遗忘风险高的词
3. 新词
4. 近期连续错误词

### 5.2 排序规则

对候选词计算临时排序分数 `priorityScore`：

```ts
priorityScore =
  0.45 * forgettingRisk +
  0.20 * overdueBoost +
  0.15 * consecutiveWrongBoost +
  0.10 * lowExposureBoost +
  0.10 * difficultyBoost
```

解释：

- `forgettingRisk`：当前召回概率越低，优先级越高
- `overdueBoost`：已经过期越久，越应该优先
- `consecutiveWrongBoost`：连续答错要强拉高
- `lowExposureBoost`：新词不能永远被到期词挤掉
- `difficultyBoost`：本来就难的词适当提高频次

## 6. 新评分原则

旧接口只接收 `correct: boolean`，信息量不足。

新接口改为提交 `rating`：

- `again`：错误，或完全不会
- `hard`：答对但明显吃力
- `good`：正常答对
- `easy`：轻松答对

如果前端暂时只能判断对错，则过渡映射：

- 错误 -> `again`
- 正确 -> `good`

后续再逐步接入：

- 答题耗时
- 是否使用提示
- 连续正确次数

## 7. 学习模式与测验模式

### 7.1 学习模式

目标：

- 建立初始记忆
- 拉起新词基础稳定度
- 适度穿插近期薄弱词

### 7.2 测验模式

目标：

- 检测召回稳定性
- 重点打磨到期词和近期易错词
- 输出更可信的状态更新

## 8. 错题本策略

错题本继续保留，但逻辑升级为：

- 词仍然属于原词树
- 错题本作为额外词树引用该词
- 错题本单独拥有自己的 `LearningState`
- 来源词树通过 `sourceListIds` 记录

这样可以避免把错题本逻辑继续绑定在旧 `learnedPoint` 上。

## 9. 迁移策略

### 9.1 数据保留原则

必须保留：

- 现有 `Word`
- 现有 `WordList`
- 现有词与词树的归属关系
- 现有 meaning / context
- 现有学习快照备份

可以重建：

- 旧 `learnedPoint`
- 旧 Session 结构
- 旧学习统计

### 9.2 迁移步骤

1. 备份当前学习快照到仓库内临时备份目录
2. 为所有旧 `ownedByLists` 迁移成新 `listMemberships`
3. 根据旧 `learnedPoint` 生成基础 `LearningState`
4. 把旧错题本字段迁移为新来源字段与初始状态
5. 重写快照持久化逻辑，输出新结构

### 9.3 旧分数映射建议

旧 `learnedPoint` 仅作为迁移参考，不再长期保留。

映射建议：

- `0-19` -> `difficulty` 偏高，`stability` 极低，`dueAt = now`
- `20-39` -> `difficulty` 高，`stability` 低，`dueAt = now`
- `40-59` -> `difficulty` 中，`stability` 中低，`dueAt = 近期`
- `60-79` -> `difficulty` 中低，`stability` 中，`dueAt = 稍后`
- `80-100` -> `difficulty` 低，`stability` 较高，`dueAt = 更晚`

## 10. 接口改造

### 10.1 学习/测验开始接口

后端返回：

- 题目数据
- 当前批次词
- 会话摘要
- 当前统计信息

### 10.2 结果提交接口

前端提交：

```ts
type ReviewSubmission = {
  wordId: string;
  rating: 'again' | 'hard' | 'good' | 'easy';
  correct: boolean;
  questionType: string;
  responseTimeMs?: number;
  usedHint?: boolean;
};
```

### 10.3 列表统计接口

旧 `averageProgress` 替换为更可解释的指标：

- `dueCount`
- `newCount`
- `learningCount`
- `reviewCount`
- `masteredCount`
- `retentionScore`

## 11. 前端改造

### 11.1 必做项

- 学习页、测验页提交 `rating`
- 进度展示改成状态分布，而不是旧分数条
- 列表页展示“待复习 / 学习中 / 熟练”结构
- 词详情页展示学习状态与下一次复习时间

### 11.2 可后续增强

- 答题后让用户手动选择 `hard / good / easy`
- 根据耗时自动推荐评分
- 展示复习热力图、遗忘风险趋势

## 12. 测试要求

### 12.1 后端

- 学习状态迁移测试
- 调度排序测试
- 结果提交更新测试
- 错题本状态同步测试
- 快照导出/恢复测试

### 12.2 前端

- 学习页提交新结构
- 测验页提交新结构
- 列表统计展示正确
- DOM 交互回归测试

## 13. 分阶段进度

### 阶段 1：文档、备份、迁移边界确认

- [x] 研究并确定新方案
- [x] 写入本需求与进度文档
- [x] 创建学习快照备份目录
- [x] 确认所有受影响模块

### 阶段 2：后端新模型与迁移脚本

- [x] 新增 `LearningState` 模型
- [x] 新增 `ReviewLog` 模型
- [x] 重构 `Word` 结构为 `listMemberships`
- [x] 编写旧数据迁移脚本
- [x] 重构学习快照持久化

### 阶段 3：调度与评分链路重构

- [x] 重写学习选词逻辑
- [x] 重写测验选词逻辑
- [x] 重写结果提交流程
- [x] 接入错题本新逻辑

### 阶段 4：前端适配

- [x] 更新学习页提交结构
- [x] 更新测验页提交结构
- [x] 更新列表页统计
- [x] 更新词详情页展示

### 阶段 5：验证与收尾

- [x] 迁移验证
- [x] 自动化测试
- [x] 手动回归验证
- [x] 清理废弃代码

## 15. 实际落地结果

本轮重构已经完成，当前系统实际状态如下：

- 后端已从旧 `learnedPoint` 模型切换为 `LearningState + ReviewLog + listMemberships`
- 学习与测验提交接口已从旧 `/learned-points` 改为新 `/reviews`
- 选词逻辑已改为“到期复习 + 遗忘风险 + 连错提升 + 新词曝光 + 难度提升”的综合排序
- 错题本已改为独立词树成员关系 + 独立学习状态
- 应用启动时会自动把旧 `ownedByLists` 数据迁移为新结构，并基于旧分数生成初始学习状态
- 学习快照已升级为 `version: 2`，可持久化列表、单词、学习状态、复习日志和偏好设置
- 前端列表页、词树详情页、单词详情页、学习页、测验页都已适配新接口和新状态展示

## 16. 本次验证结果

已完成的验证包括：

- 后端构建：`backend/npm run build`
- 后端测试：`backend/npm test -- --runInBand`
- 前端构建：`frontend/npm run build`

当前仓库在本阶段结束时已完成代码提交，工作区可收敛为干净状态。

## 14. 当前执行策略

执行顺序：

1. 文档与备份
2. 新模型与迁移脚本
3. 后端调度链路
4. 前端适配
5. 测试与清理

本次重构允许大刀阔斧调整结构，不保留旧算法兼容层，但必须保证已有词树与学习数据可迁移、可恢复、可验证。
