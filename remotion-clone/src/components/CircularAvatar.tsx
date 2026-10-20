import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { OffthreadVideo } from 'remotion';
import { SHADOW } from '../lib/theme';

// 圆形头像（A-roll 主播缩小为左下角圆形头像）
// 硬边 clip-path: circle()
// 紫色渐变描边 4px #A020F0 -> #FF00FF
// 紫色 box-shadow 外发光
// 入场：从左侧滑入 + spring scale
// 参考 docs/04-design-log.md CASE-001 CircularAvatar

interface CircularAvatarProps {
  // 头像视频源（与 A-roll 同源）
  videoSrc: string;
  // 视频起始帧（A-roll 在主时间轴的起始帧，用于同步播放）
  startFrame: number;
  // 头像在主时间轴的起始帧（开始显示为头像的时间点）
  appearFrame: number;
  x: number;
  y: number;
  size: number;             // 直径（像素）
  borderWidth?: number;     // 描边宽度
  enterDuration?: number;   // 入场持续（帧）
}

export const CircularAvatar: React.FC<CircularAvatarProps> = ({
  videoSrc,
  startFrame,
  appearFrame,
  x,
  y,
  size,
  borderWidth = 4,
  enterDuration = 18,
}) => {
  const frame = useCurrentFrame();

  // 入场：从左侧滑入 + spring scale 0.7->1.0
  const enterProgress = interpolate(
    frame,
    [appearFrame, appearFrame + enterDuration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ease-out cubic
  const eased = 1 - Math.pow(1 - enterProgress, 3);

  const opacity = eased;
  const translateX = (1 - eased) * -60;
  // 轻微过冲
  const scale = eased < 0.7
    ? interpolate(eased, [0, 0.7], [0.7, 1.1])
    : interpolate(eased, [0.7, 1], [1.1, 1.0]);

  // 视频与主时间轴同步：OffthreadVideo 默认主时间轴 frame N 提取视频第 N 帧
  // 不能加 startFrom={frame}，否则会变成 2*frame（2 倍速播放）
  // startFrame prop 仅用于多段 A-roll 拼接场景，本项目中 A-roll 从主时间轴 0 开始，不需用

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        opacity,
        transform: `translateX(${translateX}px) scale(${scale})`,
        transformOrigin: 'center',
      }}
    >
      {/* 紫色外发光底层 */}
      <div
        style={{
          position: 'absolute',
          inset: -borderWidth * 2,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(160, 32, 240, 0.40) 0%, rgba(255, 0, 255, 0.20) 50%, transparent 80%)',
          filter: 'blur(8px)',
        }}
      />

      {/* 紫色渐变描边圈（外圈） */}
      <div
        style={{
          position: 'absolute',
          inset: -borderWidth,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #A020F0 0%, #FF00FF 100%)',
          boxShadow: SHADOW.glowPurple,
        }}
      />

      {/* 视频画面（圆形裁切） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          overflow: 'hidden',
          backgroundColor: '#000000',
          clipPath: 'circle(50% at 50% 50%)',
        }}
      >
        <OffthreadVideo
          src={videoSrc}
          muted
          startFrom={startFrame}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>
    </div>
  );
};
