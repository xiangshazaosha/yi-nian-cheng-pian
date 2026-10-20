# TextureBackground

## 使用场景

秋芝风历史背景层：暗色径向渐变、50 颗固定随机种子星点与径向暗角，替代秋芝真实紫灯棚。仅适用于目标风格明确需要该外观的场景，不是跨风格的公共底层。

秋芝风选用此背景时，须检查全屏 A-roll 淡出后的衔接；其他风格不自动加载星空或暗角。以下示例和参数只描述本历史实现。

## 怎么使用

```tsx
import { TextureBackground } from '../components/TextureBackground';

// 基础用法
<TextureBackground starCount={50} vignetteStrength={0.5} />

// A-roll 全屏段（背景被视频盖住，但末段淡出时会显现）
<AbsoluteFill style={{ backgroundColor: COLORS.bgDark }}>
  <Audio src={A_ROLL_SRC} />
  <TextureBackground starCount={50} vignetteStrength={0.5} />
  <AbsoluteFill style={{ opacity: aRollOpacity }}>
    <OffthreadVideo src={A_ROLL_SRC} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    {/* A-roll 全屏需额外叠径向暗角保持风格一致 */}
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(5,5,5,0.80) 100%)', pointerEvents: 'none' }} />
  </AbsoluteFill>
</AbsoluteFill>
```

关键 props：
- `starCount`：星星数量，默认 50
- `vignetteStrength`：暗角强度 0-1，默认 0.5

视觉配方（三层叠加）：
1. **底层径向渐变**：`radial-gradient(ellipse at center, #0A0A14 0%, #050505 70%)`
2. **星空层（SVG）**：50 颗白点，固定随机种子（LCG 算法 seed=42），尺寸 1-3px，基础透明度 0.3-0.6，闪烁速度 0.02-0.05，闪烁相位随机
3. **暗角层**：`radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteStrength}) 100%)`

闪烁算法：`alpha = baseAlpha + sin(frame * twinkleSpeed + twinklePhase) * 0.15`，clamp 到 [0.15, 0.75]

固定随机种子：使用 LCG（线性同余生成器）`seed = (seed * 1664525 + 1013904223) % 4294967296`，确保每次渲染星星位置一致（避免帧间闪烁）

## Remotion 约束

无 OffthreadVideo / Audio 调用。useMemo 缓存星星位置避免每帧重新生成。

## 避坑

### 1. A-roll 全屏段缺失暗角导致风格割裂
- **现象**：A-roll 全屏画面四角纯亮，与 B-roll 阶段（暗色星空 + 暗角）风格割裂
- **根因**：A-roll 视频全屏不透明，整段覆盖了 TextureBackground 的暗色星空与暗角。秋芝风格的核心是"暗色星空底 + 暗角聚光"，A-roll 阶段缺失暗角就丢失了风格一致性
- **对策**：在 A-roll 全屏 AbsoluteFill 内部叠加一层暗角 div：`background: radial-gradient(ellipse at center, transparent 40%, rgba(5,5,5,0.80) 100%)`，pointerEvents: none。**暗角强度需经视觉代理复查**（首轮 0.55 偏轻，0.80 达标）
- **来源**：LESSON-004

### 2. 星星位置帧间闪烁
- **现象**：星星位置每帧变化，像噪点而不是星空
- **根因**：随机数生成器没有固定种子，每帧重新生成位置
- **对策**：useMemo 缓存星星位置，LCG 算法 seed=42 固定。组件已实现，不要改成 Math.random()
- **来源**：组件实现内置

### 3. vignetteStrength 过强导致画面过暗
- **现象**：B-roll 段画面整体偏暗，看不清 B-roll 内容
- **根因**：TextureBackground 的暗角与 B-roll 框叠加后，框外暗角过强影响整体观感
- **对策**：B-roll 段 `vignetteStrength=0.5`（默认值即可），A-roll 全屏段额外叠的暗角用 0.80（A-roll 视频本身需要压暗保持风格一致）。不要无脑提到 1.0

## 脚本

完整实现：[src/components/TextureBackground.tsx](../../../remotion-clone/src/components/TextureBackground.tsx)
