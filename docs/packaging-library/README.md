# 包装库索引

本页只用于找候选：方案名称、使用场景、适用边界和详情链接。选中后必须读取对应方案的约束；不在索引维护参数副本。

## 风格适用范围

- 风格名称、别名与规则仅在[风格索引](../reference-styles/README.md)维护；先选主风格，再按[公共规则](../reference-styles/common-rules.md)复用机制。
- 多数方案来自秋芝风历史实现。复用机制不代表继承其色板、头像、辉光、底板或动效预设；具体外观服从目标风格。
- 字幕遵循[字幕规则](../workflows/subtitles.md)，不因选中历史布局或 CaptionBar 而自动使用字幕底板。

## 历史视觉系统基础（秋芝风默认，不跨风格强制）

需要维护旧实现时读[秋芝风](../reference-styles/秋芝风/README.md)、[历史主题常量](../../remotion-clone/src/lib/theme.ts)与选中方案；整理前参数和描述保留在[历史快照（未随公开版分发）](../public-release-scope.md)，仅追溯时读取，不作为现行参数权威。

## 音效系统（SFX）

仅处理音效时读取[音效规则](./sfx-rules.md)；找素材查[统一资产索引](../../remotion-clone/public/sfx/catalog.json)，归档与引用见[用户音效规则](./user-sfx-assets.md)。本页不维护音色、增益或触发阈值。

## 组件方案（11 个）

### [GlowTitle](./components/glow-title.md)
开场、CTA 或段内主标题；按目标风格选择表现，浅色画面须检查文字对比度。

### [HighlightTag](./components/highlight-tag.md)
承载关键词、事实、步骤或结论的信息卡；历史颜色映射与弹跳参数不跨风格强制。

### [HighlightBox](./components/highlight-box.md)
框选 B-roll 的具体控件或内容，可配标注线引出观点；必须对齐真实目标，不能只画空框。

### [AnnotationLine](./components/annotation-line.md)
从框选区域引向观点卡或标签的折线标注，用于建立“画面细节 → 解释”的视觉联系。

### [CursorPointer](./components/cursor-pointer.md)
软件操作、表单或界面演示中的指针移动与到达强调；落点须对齐实际交互目标。

### [RoundedUIFrame](./components/rounded-ui-frame.md)
录屏、效果图和界面截图的容器；支持通用圆角框、手机、浏览器和文档样机，按素材选择。

### [CircularAvatar](./components/circular-avatar.md)
B-roll 期间保留口播人物连接的历史圆头像实现；不是所有风格必用，位置与外观按当前风格选择。

### [CaptionBar](./components/caption-bar.md)
仅维护历史字幕实现或用户明确允许的底板例外；新片默认校正版时间轴裸排，避免与烧入字幕重复。

### [TextureBackground](./components/texture-background.md)
秋芝风历史星空与暗角背景；仅目标风格需要时采用，不是跨风格公共底层。

### [StepList](./components/step-list.md)
逐项展开的垂直详细步骤列表；与底部总览 StepFlowBar 互斥选用。

### [StepFlowBar](./components/step-flow-bar.md)
多步骤内容的底部总览和进度导航；与详细列表 StepList 互斥选用。

## 构图方案（3 个）

### [A-roll 主播全屏](./layouts/a-roll-fullscreen.md)
主播情绪或表达主导的开场、过渡与 CTA；文档中的秋芝暗角及历史字幕组合不跨风格套用。

### [B-roll 圆角 UI 框](./layouts/b-roll-rounded-ui.md)
软件操作、结果展示或多步骤演示；保留界面主体和烧入字幕，头像与卡片按风格及安全区配置。

### [B-roll 全屏 + 遮罩](./layouts/b-roll-fullscreen-mask.md)
以压暗全屏素材突出结论或 CTA 大标题的短时收束构图；不宜长时间遮挡证据画面。

## 动效方案（4 个）

### [spring 缩放入场](./animations/spring-scale-enter.md)
卡片或标签首次出现时的弹性缩放；仅目标风格允许弹跳时使用，不替代已有元素的脉冲强调。

### [淡入淡出](./animations/fade.md)
元素进入、退出及画面交叉的透明度过渡；时长与重叠量按风格和当前动作核验。

### [脉冲强调](./animations/pulse.md)
对已经出现的标题或框选区域做短暂强调，与首次入场区分，并对齐口播重音。

### [标题滑入](./animations/title-slide-in.md)
标题首次出现时的位移加淡入；用于标题而非弹性卡片，须避开前一标题的退出。

## 蒙版方案（3 个）

### [径向暗角](./masks/radial-vignette.md)
秋芝风 A-roll 全屏段的边缘压暗与人物聚焦；不直接套用到其他风格或 B-roll 构图。

### [暗色半透明遮罩](./masks/dark-overlay.md)
压暗 B-roll 或设计标题背后的画面以建立对比度；不作为字幕默认底板授权。

### [圆形裁切](./masks/circle-clip.md)
将口播画面裁成圆形头像的硬边蒙版；仅需要圆形载体时使用，描边另由外层处理。

## 转场方案（3 个）

### [A-roll 全屏缩入圆形头像](./transitions/a-roll-to-circular-avatar.md)
跨风格共享的连续构图变化：同一口播画面从全屏缩入头像，并由同时间轴头像接管。

### [A-roll ↔ B-roll 交叉淡入淡出](./transitions/a-roll-b-roll-cross.md)
段内主播与演示画面之间的重叠交叉过渡；不是段与段之间的黑场交接。

### [段间黑场过渡](./transitions/segment-handoff.md)
适合黑场衔接的段落间淡出与淡入；与段内交叉过渡区分，不强制所有风格采用。

## 扩展判定

新增方案、变更用途或组件 API 前读[扩展规则](./extension-rules.md)。条目、场景、链接和分类计数的双向同步遵循[新增方案后的清单](./extension-rules.md#新增方案后的清单)，本页不复制判定矩阵。

## 避坑速查

按症状读取[避坑文档](./pitfalls.md)的相关章节，不通读历史案例：

- 无声、音轨重复、视频加速定格 → [视频组件约束](./pitfalls.md#remotion-视频组件约束)
- 字幕高亮或双字幕问题 → [CaptionBar](./pitfalls.md#captionbar-避坑)
- 字幕误做卡片 → [字幕卡片误用](./pitfalls.md#逐字字幕被误做成信息卡)
- 标题对比度或叠影 → [GlowTitle](./pitfalls.md#glowtitle-避坑)
- 信息卡压烧入字幕 → [定位避坑](./pitfalls.md#信息卡定位避坑)
- 段间硬切 → [转场避坑](./pitfalls.md#转场避坑)
