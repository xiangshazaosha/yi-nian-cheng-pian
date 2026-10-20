import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../lib/theme';

// SVG 折线标注线
// 用于从 B-roll 局部区域引出折线到画面另一处的卡片/标签
// 绘制动画：pathLength 从 0 到 1（linear，drawDuration 帧）
// 颜色默认绿色 #CCFF00（结构识别段用），可传入黄色用于其他段
// 坐标系：1920x1080 全屏坐标（组件铺满 AbsoluteFill）

interface AnnotationLineProps {
  points: Array<[number, number]>;  // 折线顶点（1920x1080 坐标）
  enterFrame: number;
  exitFrame?: number;
  drawDuration?: number;   // 绘制时长（帧），默认 12
  color?: string;
  strokeWidth?: number;
}

export const AnnotationLine: React.FC<AnnotationLineProps> = ({
  points = [[500, 500], [1400, 800]],
  enterFrame = -12,
  exitFrame,
  drawDuration = 12,
  color = COLORS.green,
  strokeWidth = 6,
}) => {
  const frame = useCurrentFrame();

  const drawProgress = interpolate(
    frame,
    [enterFrame, enterFrame + drawDuration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const exitOpacity = exitFrame !== undefined
    ? interpolate(frame, [exitFrame, exitFrame + 6], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  if (drawProgress <= 0 || exitOpacity <= 0) return null;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: exitOpacity,
      }}
      viewBox="0 0 1920 1080"
      preserveAspectRatio="none"
    >
      <path
        d={pathD}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - drawProgress}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
