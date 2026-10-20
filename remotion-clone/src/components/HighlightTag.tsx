import React from 'react';
import { Audio, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, EASE, FONT_SIZE, RADIUS, SHADOW } from '../lib/theme';
import { evalKeyframes, type Keyframes } from '../lib/keyframes';

// 高亮标签卡（信息卡）
// 类型：
// - 'yellow' 黄底黑字（风险卡/关键词高亮）
// - 'green'  绿底黑字（步骤卡/事实卡）
// - 'orange' 橙底白字（结论卡/CTA）
// 入场：spring scale 0.8->1.0 + opacity（spring overshoot 弹出）
// 出场：opacity 淡出
// 额外动效：xKeyframes/yKeyframes/scaleKeyframes 接收解析自 SegmentX 的关键帧，
//   组件自带入场/退场动效保留，额外动效叠加（默认 undefined 时与原行为完全一致）。

type TagColor = 'yellow' | 'green' | 'orange';

interface HighlightTagProps {
  text: string;
  x: number;
  y: number;
  color: string;            // 背景色：hex 或 'yellow'/'green'/'orange' 枚举（兼容旧）
  textColor?: string;       // 文字色（hex），默认按背景色
  font?: string;            // 字体
  size?: number;
  padding?: number;
  delay?: number;          // 入场延迟（帧）
  enterDuration?: number;  // 入场持续（帧），默认 10
  exitStart?: number;      // 出场起始（帧）
  exitDuration?: number;   // 出场持续（帧）
  scaleMultiplier?: number; // 外部缩放因子（如高亮放大 1.1x），默认 1
  sfxSrc?: string;         // 入场音效文件（staticFile 路径），默认无
  sfxVolume?: number;      // 音效音量，默认 0.65（按内置 pop 的响度校准）
  xKeyframes?: Keyframes;  // 额外 X 位移动效（解析自 SegmentX）
  yKeyframes?: Keyframes;  // 额外 Y 位移动效
  scaleKeyframes?: Keyframes; // 额外缩放动效（如高亮放大 1.0->1.25->1.0）
}

const TAG_STYLES: Record<TagColor, { bg: string; text: string }> = {
  yellow: { bg: COLORS.yellow, text: '#000000' },
  green: { bg: COLORS.green, text: '#000000' },
  orange: { bg: COLORS.orange, text: '#FFFFFF' },
};

export const HighlightTag: React.FC<HighlightTagProps> = ({
  text,
  x,
  y,
  color,
  textColor,
  font,
  size = FONT_SIZE.card,
  padding = 14,
  delay = 0,
  enterDuration = 10,
  exitStart = Number.MAX_SAFE_INTEGER,
  exitDuration = 8,
  scaleMultiplier = 1,
  sfxSrc,
  sfxVolume = 0.65,
  xKeyframes,
  yKeyframes,
  scaleKeyframes,
}) => {
  const frame = useCurrentFrame();

  // 入场：spring overshoot（用 interpolate 模拟，带轻微过冲）
  // 0 -> 1.15 -> 1.0
  const enterRaw = interpolate(
    frame,
    [delay, delay + enterDuration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  // 加入轻微过冲：当 progress 接近 1 时，scale 先到 1.15 再回到 1.0
  const enterScale = enterRaw < 0.7
    ? interpolate(enterRaw, [0, 0.7], [0.8, 1.15])
    : interpolate(enterRaw, [0.7, 1], [1.15, 1.0]);

  const enterOpacity = interpolate(
    frame,
    [delay, delay + Math.max(4, enterDuration / 2)],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const exitOpacity = interpolate(
    frame,
    [exitStart, exitStart + exitDuration],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const opacity = Math.min(enterOpacity, exitOpacity);
  const dynScale = evalKeyframes(frame, scaleKeyframes, scaleMultiplier);
  const scale = enterScale * dynScale;
  const dynX = evalKeyframes(frame, xKeyframes, x);
  const dynY = evalKeyframes(frame, yKeyframes, y);
  const style = TAG_STYLES[color as TagColor];
  const bg = style?.bg ?? color;
  const textColorVal = textColor ?? style?.text ?? '#000000';
  const fontFamilyVal = font ? `"${font}", "PingFang SC", "Microsoft YaHei", sans-serif` : '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif';

  return (
    <>
      {/* 入场音效：在视觉"出现"帧（delay + enterDuration/2）触发 */}
      {sfxSrc && (
        <Sequence from={delay + Math.floor(enterDuration / 2)} durationInFrames={15}>
          <Audio src={sfxSrc} volume={sfxVolume} />
        </Sequence>
      )}
      <div
        style={{
          position: 'absolute',
          left: dynX,
          top: dynY,
          opacity,
          transform: `scale(${scale})`,
          background: bg,
          color: textColorVal,
          padding: `${padding}px ${padding * 1.4}px`,
          borderRadius: RADIUS.tag,
          fontSize: size,
          fontWeight: 800,
          letterSpacing: '1px',
          boxShadow: SHADOW.card,
          whiteSpace: 'nowrap',
          fontFamily: fontFamilyVal,
        }}
      >
        {text}
      </div>
    </>
  );
};
