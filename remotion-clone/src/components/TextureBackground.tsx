import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../lib/theme';

// 暗色星空 + 暗角背景
// 用于 A-roll 主播段（替代秋芝真实紫灯棚）
// 50 颗白点，固定随机种子，轻微闪烁
// 径向暗角 vignette

interface Star {
  x: number;      // 0-1 相对位置
  y: number;
  size: number;   // 1-3px
  baseAlpha: number; // 0.3-0.6
  twinkleSpeed: number; // 0.02-0.05
  twinklePhase: number; // 0-2π
}

// 固定随机种子生成星星位置（避免每帧重新生成）
const useStars = (count: number): Star[] => {
  return useMemo(() => {
    // 简单 LCG 随机数生成器，种子固定
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    return Array.from({ length: count }, () => ({
      x: rand(),
      y: rand(),
      size: 1 + rand() * 2,
      baseAlpha: 0.3 + rand() * 0.3,
      twinkleSpeed: 0.02 + rand() * 0.03,
      twinklePhase: rand() * Math.PI * 2,
    }));
  }, [count]);
};

interface TextureBackgroundProps {
  starCount?: number;
  vignetteStrength?: number; // 0-1，暗角强度
}

export const TextureBackground: React.FC<TextureBackgroundProps> = ({
  starCount = 50,
  vignetteStrength = 0.5,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const stars = useStars(starCount);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, ${COLORS.bgGradientStart} 0%, ${COLORS.bgDark} 70%)`,
      }}
    >
      {/* 星空层 */}
      <svg
        width={width}
        height={height}
        style={{ position: 'absolute', inset: 0 }}
      >
        {stars.map((star, i) => {
          const alpha = star.baseAlpha + Math.sin(frame * star.twinkleSpeed + star.twinklePhase) * 0.15;
          return (
            <circle
              key={i}
              cx={star.x * width}
              cy={star.y * height}
              r={star.size}
              fill="#FFFFFF"
              opacity={Math.max(0.15, Math.min(0.75, alpha))}
            />
          );
        })}
      </svg>

      {/* 暗角层 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, ${vignetteStrength}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
