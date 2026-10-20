# 径向暗角

## 使用场景

A-roll 全屏段保持风格一致。径向渐变从中心透明到边缘暗色，让画面四角变暗，聚焦中心主播。

**仅用于 A-roll 全屏段**。[B-roll 圆角 UI 框](../layouts/b-roll-rounded-ui.md) 段不需要（框外已有 [TextureBackground](../components/texture-background.md) 暗角）。[B-roll 全屏 + 遮罩](../layouts/b-roll-fullscreen-mask.md) 段用 [暗色半透明遮罩](./dark-overlay.md) 而非径向暗角。

## 怎么使用

```tsx
import { AbsoluteFill } from 'remotion';
import { OffthreadVideo } from 'remotion';

<AbsoluteFill>
  <OffthreadVideo src={A_ROLL_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  {/* 径向暗角层 */}
  <AbsoluteFill style={{
    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(5, 5, 5, 0.80) 100%)',
    pointerEvents: 'none',
  }} />
</AbsoluteFill>
```

关键参数：
- 渐变形状：`ellipse at center`（椭圆，匹配 16:9 画面）
- 透明区：`transparent 40%`（中心 40% 半径内完全透明）
- 暗角区：`rgba(5, 5, 5, 0.80) 100%`（边缘 100% 处暗色 80% 透明度）
- `pointerEvents: 'none'`：必须加，避免拦截点击

强度建议：
- **0.55 偏轻**（首轮视觉复查不达标）
- **0.80 达标**（A-roll 全屏段标准值）
- **1.00 过强**（四角纯黑，过于压抑）

## Remotion 约束

无 OffthreadVideo / Audio 调用。纯 CSS radial-gradient。

## 避坑

### 1. 暗角强度偏轻导致风格割裂
- **现象**：A-roll 全屏画面四角纯亮，与 B-roll 阶段（暗色星空 + 暗角）风格割裂
- **根因**：暗角强度 0.55 不够，四角仍有明显亮度
- **对策**：暗角强度提到 0.80。**必须经视觉代理复查**，首轮 0.55 偏轻，0.80 达标
- **来源**：LESSON-004

### 2. 暗角盖住主播面部
- **现象**：主播面部变暗，看不清表情
- **根因**：暗角透明区 40% 半径不够大，主播面部落在过渡区
- **对策**：透明区保持 40%（标准值）。如主播偏移画面中心，可调到 50%。不要超过 60%（暗角效果消失）

### 3. 暗角与 TextureBackground 暗角叠加过暗
- **现象**：A-roll 全屏段画面整体过暗
- **根因**：TextureBackground 的暗角（vignetteStrength=0.5）与 A-roll 暗角（0.80）叠加。但 A-roll 视频盖住了 TextureBackground，实际上只有 A-roll 暗角生效
- **对策**：A-roll 全屏段 TextureBackground 仍保留（A-roll 淡出/末段时会显现），vignetteStrength 保持 0.5。A-roll 暗角独立控制，强度 0.80

### 4. 暗角层 pointerEvents 未设导致拦截
- **现象**：暗角层覆盖在视频上，点击事件被拦截
- **对策**：所有遮罩/暗角层必须设 `pointerEvents: 'none'`

## 脚本参考

典型实现：
- [src/segments/Segment7.tsx（未随公开版分发）](../../public-release-scope.md)（A-roll 全屏 + 径向暗角 0.80）
- [src/segments/Segment12.tsx（未随公开版分发）](../../public-release-scope.md)（A-roll 全屏 + 径向暗角 0.80）

完整暗角配方：
```css
background: radial-gradient(ellipse at center, transparent 40%, rgba(5, 5, 5, 0.80) 100%);
pointerEvents: none;
```
