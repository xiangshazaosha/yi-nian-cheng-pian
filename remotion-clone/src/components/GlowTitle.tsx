import React from 'react';
import { Audio, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, EASE, FONT_SIZE, SHADOW } from '../lib/theme';

// 大标题组件
// 支持两种风格：
// - 'glow'：黄色强辉光（开场/CTA 标题）
// - 'plain'：白字无辉光（段落内常规大标题）
// 入场：从左侧滑入 + 淡入（delay 控制时序）
// 出场：淡出（exitStart 之后开始）

interface GlowTitleProps {
  text: string;
  x: number;
  y: number;
  variant?: 'glow' | 'plain';
  color?: string;          // 文字色（hex），默认 glow->黄 / plain->白
  font?: string;           // 字体
  size?: number;
  delay?: number;         // 入场延迟（帧）
  enterDuration?: number; // 入场持续（帧）
  exitStart?: number;     // 出场起始（帧）
  exitDuration?: number;  // 出场持续（帧）
  sfxSrc?: string;        // 入场音效文件（staticFile 路径），默认无
  sfxVolume?: number;     // 音效音量，默认 0.65
}

export const GlowTitle: React.FC<GlowTitleProps> = ({
  text,
  x,
  y,
  variant = 'plain',
  color,
  font,
  size = FONT_SIZE.titleLg,
  delay = 0,
  enterDuration = 12,
  exitStart = Number.MAX_SAFE_INTEGER,
  exitDuration = 8,
  sfxSrc,
  sfxVolume = 0.65,
}) => {
  const frame = useCurrentFrame();

  // 入场：translateX(-40) + opacity 0 -> translateX(0) + opacity 1
  const enterProgress = interpolate(
    frame,
    [delay, delay + enterDuration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // 出场：opacity 1 -> 0
  const exitProgress = interpolate(
    frame,
    [exitStart, exitStart + exitDuration],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const opacity = Math.min(enterProgress, exitProgress);
  const translateX = (1 - enterProgress) * -40;

  const isGlow = variant === 'glow';

  return (
    <>
      {/* 入场音效：在视觉"出现"帧（delay + enterDuration/2）触发 */}
      {sfxSrc && (
        <Sequence from={delay + Math.floor(enterDuration / 2)} durationInFrames={20}>
          <Audio src={sfxSrc} volume={sfxVolume} />
        </Sequence>
      )}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          opacity,
          transform: `translateX(${translateX}px)`,
          fontSize: size,
          fontWeight: 900,
          letterSpacing: '2px',
          color: color ?? (isGlow ? COLORS.yellow : COLORS.textMain),
          textShadow: isGlow ? SHADOW.glowYellow : '0 2px 8px rgba(0, 0, 0, 0.60)',
          transition: `transform ${enterDuration}frames ${EASE.primary}`,
          whiteSpace: 'nowrap',
          fontFamily: font ? `"${font}", "PingFang SC", "Microsoft YaHei", sans-serif` : '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
        }}
      >
        {text}
      </div>
    </>
  );
};
