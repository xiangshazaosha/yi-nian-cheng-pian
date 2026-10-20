# 圆形裁切

## 使用场景

[CircularAvatar](../components/circular-avatar.md) 内部硬边圆形裁切。把 A-roll 视频画面裁切为圆形，作为左下角小头像。

**硬边裁切**，不做羽化。描边由外层 div 渐变背景模拟（不是 border-radius + border）。

## 怎么使用

```tsx
// CircularAvatar 内部已实现，外部只需传 size / borderWidth
import { CircularAvatar } from '../components/CircularAvatar';

<CircularAvatar
  videoSrc={A_ROLL_SRC}
  startFrame={0}
  appearFrame={150}
  x={60}
  y={731.2}
  size={268.8}           // 直径
  borderWidth={4}        // 紫色描边宽度
  enterDuration={18}
/>

// 手动实现（如果不用 CircularAvatar）
<div style={{
  position: 'absolute',
  left: x, top: y,
  width: size, height: size,
}}>
  {/* 紫色外发光底层 */}
  <div style={{
    position: 'absolute',
    inset: -borderWidth * 2,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(160, 32, 240, 0.40) 0%, rgba(255, 0, 255, 0.20) 50%, transparent 80%)',
    filter: 'blur(8px)',
  }} />

  {/* 紫色渐变描边圈 */}
  <div style={{
    position: 'absolute',
    inset: -borderWidth,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #A020F0 0%, #FF00FF 100%)',
    boxShadow: '0 0 12px rgba(160, 32, 240, 0.80), 0 0 24px rgba(255, 0, 255, 0.50)',
  }} />

  {/* 视频画面圆形裁切 */}
  <div style={{
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    overflow: 'hidden',
    backgroundColor: '#000000',
    clipPath: 'circle(50% at 50% 50%)',
  }}>
    <OffthreadVideo src={videoSrc} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  </div>
</div>
```

三层叠加配方：
1. **外层紫色外发光底层**：`inset: -borderWidth*2`，`radial-gradient(circle, rgba(160,32,240,0.40) 0%, rgba(255,0,255,0.20) 50%, transparent 80%)`，`filter: blur(8px)`
2. **紫色渐变描边圈**：`inset: -borderWidth`，`linear-gradient(135deg, #A020F0 0%, #FF00FF 100%)`，`boxShadow: SHADOW.glowPurple`
3. **视频画面圆形裁切**：`clipPath: 'circle(50% at 50% 50%)'` + `borderRadius: 50%` + `overflow: hidden`

关键参数：
- 直径：`VIDEO_W * 0.14`（268.8px）
- 描边宽度：4px（默认）
- 紫色渐变方向：135deg（左上到右下）
- 圆心：`50% 50%`（容器中心）

`clipPath` 和 `borderRadius: 50%` 双保险：
- `clipPath: circle()` 是真正的圆形裁切（硬边）
- `borderRadius: 50%` 是 CSS 圆角（备用，确保旧浏览器也能渲染圆形）
- `overflow: hidden` 确保视频不溢出

## Remotion 约束

### 1. OffthreadVideo 必须 muted
圆形裁切内部的 OffthreadVideo 必须 `muted`。同一 A-roll 源被全屏 + 圆形头像 + Audio 三处引用，所有 OffthreadVideo 必须 muted。详见 [pitfalls.md#声音重复混乱](../pitfalls.md#声音重复混乱)。

### 2. 禁止手动 startFrom={frame}
不要写 `startFrom={videoFrame}`。详见 [pitfalls.md#offthreadvideo-加速播放](../pitfalls.md#offthreadvideo-加速播放)。

## 避坑

### 1. 视频源用 file:// 路径
- **现象**：渲染报错 `Can only download URLs starting with http:// or https://, got file:///remotion-clone/public/example.mp4`
- **根因**：Remotion 的 OffthreadVideo 不支持 file:// URL，只接受 http(s) 或 `staticFile()` 包装的 public/ 目录资源
- **对策**：视频源用 `staticFile('a-roll-seg1.mp4')` 引用 public/ 目录下的文件。详见 [pitfalls.md#file-url-不支持](../pitfalls.md#file-url-不支持)
- **来源**：PITFALL-002

### 2. 视频画面在圆形内变形
- **现象**：圆形头像内视频画面拉伸变形
- **根因**：视频原始宽高比与圆形容器（1:1）不匹配，objectFit: 'contain' 会导致黑边，objectFit: 'fill' 会导致拉伸
- **对策**：`objectFit: 'cover'`（视频铺满容器，超出部分裁切）。这是 CircularAvatar 的默认值

### 3. 描边圈与视频裁切错位
- **现象**：紫色描边圈偏移，视频不在描边圈正中
- **根因**：三层 div 的 inset 不一致
- **对策**：严格按配方：
  - 外发光底层：`inset: -borderWidth * 2`
  - 描边圈：`inset: -borderWidth`
  - 视频裁切：`inset: 0`
  - 三层都用 `borderRadius: 50%` 或 `clipPath: circle(50% at 50% 50%)`

### 4. 圆形头像模糊
- **现象**：圆形头像内的视频画面比全屏 A-roll 模糊
- **根因**：未最终定位。可能原因：objectFit: cover 在小尺寸下的缩放算法、source 视频分辨率与显示尺寸不匹配
- **对策**：暂未修复。如遇此问题，可尝试提高 source 视频分辨率或改用更高码率 ffmpeg 重新抽取
- **来源**：Task #23（pending）

### 5. 圆形头像视频源与段不匹配
- **现象**：头像视频内容与当前段口播不对齐
- **对策**：每段 CircularAvatar 的 `videoSrc` 必须传本段的 `A_ROLL_SEG{N}_SRC`，与段 `<Audio src={A_ROLL_SEG{N}_SRC} />` 一致

## 脚本参考

典型实现：[src/components/CircularAvatar.tsx](../../../remotion-clone/src/components/CircularAvatar.tsx)（三层叠加 + clipPath circle 硬边裁切）
