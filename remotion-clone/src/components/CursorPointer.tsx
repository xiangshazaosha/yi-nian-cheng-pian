import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../lib/theme';

// 鼠标 / 手指指针
// B-roll 交互演示段，指针从起点移动到目标点强调「点击这里」类操作
// 指尖（热点）对齐 targetX/targetY，指针整体向目标点上方展开
// 移动：ease-in-out，默认 10 帧；到达后指尖处 pulse 圆环扩散强调
// 颜色默认橙 #FF6600（参考 2号参考视频 K5 橙色手型指针）
// 坐标系：1920x1080 全屏坐标（与 AnnotationLine 一致）

interface CursorPointerProps {
  targetX: number;          // 指尖落点 X（全屏坐标）
  targetY: number;          // 指尖落点 Y（全屏坐标）
  fromX?: number;           // 起点X，默认 targetX（原地出现）
  fromY?: number;           // 起点Y，默认 targetY - 120（从上方移入）
  moveStartFrame: number;   // 开始移动的帧
  moveDuration?: number;    // 移动持续（帧），默认 10
  pulseStartFrame?: number; // pulse 起始帧，默认 = moveStartFrame + moveDuration
  pulseDuration?: number;   // 单次 pulse 周期（帧），默认 14
  pulseCount?: number;      // pulse 次数，默认 2（停留期间持续强调）
  appearFrame?: number;     // 出现帧，默认 moveStartFrame
  disappearFrame?: number;  // 消失帧，默认不消失
  color?: string;           // 指针颜色，默认橙 #FF6600
  pulseColor?: string;      // 点击扩散环颜色，默认跟随 color
  size?: number;            // 指针高度（像素），默认 64
  variant?: 'hand' | 'arrow';
}

// SVG viewBox：宽 40 高 56，指尖在 (20, 50)
const SVG_W = 40;
const SVG_H = 56;
const TIP_X = 20;  // 指尖 X（viewBox 坐标）
const TIP_Y = 50;  // 指尖 Y（viewBox 坐标）

export const CursorPointer: React.FC<CursorPointerProps> = ({
  targetX,
  targetY,
  fromX,
  fromY,
  moveStartFrame,
  moveDuration = 10,
  pulseStartFrame,
  pulseDuration = 14,
  pulseCount = 2,
  appearFrame,
  disappearFrame,
  color = COLORS.orange,
  pulseColor,
  size = 64,
  variant = 'hand',
}) => {
  const frame = useCurrentFrame();

  const _fromX = fromX ?? targetX;
  const _fromY = fromY ?? targetY - 120;
  const _appearFrame = appearFrame ?? moveStartFrame;
  const _pulseStart = pulseStartFrame ?? moveStartFrame + moveDuration;

  // 移动进度：ease-in-out
  const moveProgress = interpolate(
    frame,
    [moveStartFrame, moveStartFrame + moveDuration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  // 用 ease-in-out 曲线（cubic-bezier 近似用分段 interpolate 模拟）
  // 简化：直接用 moveProgress 配合 CSS transition 不行（Remotion 无过渡），改用缓动函数
  const eased = easeInOut(moveProgress);
  const curX = _fromX + (targetX - _fromX) * eased;
  const curY = _fromY + (targetY - _fromY) * eased;

  // 出现/消失
  const appearOpacity = interpolate(
    frame,
    [_appearFrame, _appearFrame + 4],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const disappearOpacity = disappearFrame !== undefined
    ? interpolate(frame, [disappearFrame, disappearFrame + 6], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  const opacity = Math.min(appearOpacity, disappearOpacity);

  if (opacity <= 0) return null;

  // pulse 圆环：到达目标后扩散
  const pulseT = (frame - _pulseStart) / pulseDuration;  // 0..pulseCount
  const inPulse = pulseT >= 0 && pulseT < pulseCount;
  const cycleT = inPulse ? (pulseT % 1) : -1;
  const ringR = cycleT >= 0
    ? interpolate(cycleT, [0, 1], [size * 0.08, size * 0.32])
    : 0;
  const ringOpacity = cycleT >= 0
    ? interpolate(cycleT, [0, 0.15, 1], [0, 0.85, 0])
    : 0;

  const isArrow = variant === 'arrow';
  const viewW = isArrow ? 48 : SVG_W;
  const viewH = isArrow ? 64 : SVG_H;
  const hotX = isArrow ? 5 : TIP_X;
  const hotY = isArrow ? 5 : TIP_Y;
  const scale = size / viewH;
  const pressScale = interpolate(
    frame,
    [_pulseStart, _pulseStart + 3, _pulseStart + 7],
    [1, 0.84, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const svgW = viewW * scale;
  const svgH = viewH * scale;
  const left = curX - hotX * scale;
  const top = curY - hotY * scale;
  const ringColor = pulseColor ?? color;

  return (
    <>
      {/* pulse 圆环（在指尖处扩散）*/}
      {ringOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            left: curX - ringR,
            top: curY - ringR,
            width: ringR * 2,
            height: ringR * 2,
            borderRadius: '50%',
            border: `${Math.max(2, size * 0.04)}px solid ${ringColor}`,
            opacity: ringOpacity,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* 手型指针 SVG */}
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${viewW} ${viewH}`}
        style={{
          position: 'absolute',
          left,
          top,
          opacity,
          transform: `scale(${pressScale})`,
          transformOrigin: `${hotX * scale}px ${hotY * scale}px`,
          filter: `drop-shadow(0 3px 4px rgba(0,0,0,0.45))`,
          pointerEvents: 'none',
        }}
      >
        {isArrow ? (
          <path
            d="M5 4 L5 49 L17 38 L28 61 L38 56 L27 34 L44 33 Z"
            fill={color}
            stroke="#11130F"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
        ) : (
          <>
            {/* 食指：指向下的圆角矩形，底端 y=50 为指尖 */}
            <rect x={15} y={10} width={10} height={42} rx={5} fill={color} stroke="#000000" strokeWidth={1.5} />
            {/* 拳头：椭圆 */}
            <ellipse cx={20} cy={13} rx={15} ry={11} fill={color} stroke="#000000" strokeWidth={1.5} />
            {/* 指尖接触点：小圆点强调 */}
            <circle cx={20} cy={50} r={3.5} fill="#FFFFFF" stroke="#000000" strokeWidth={1} />
          </>
        )}
      </svg>
    </>
  );
};

// ease-in-out 缓动（Remotion 无内置，用近似函数）
const easeInOut = (t: number): number => {
  // cubic-bezier(0.65, 0, 0.35, 1) 近似
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
