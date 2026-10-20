import React from 'react';
import {
  Easing,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
} from 'remotion';

type ArollToCircularAvatarTransitionProps = {
  videoSrc: string;
  startFrame: number;
  endFrame: number;
  targetX: number;
  targetY: number;
  targetSize: number;
  borderColor?: string;
  borderWidth?: number;
  targetBorderRadiusPx?: number;
  objectPosition?: string;
  sourceStartFrom?: number;
  zIndex?: number;
};

const ease = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * 风格无关的 A-roll 构图转场：同一条全屏口播画面连续缩入头像。
 * 默认终态为圆形；调用 targetBorderRadiusPx 后可落到微圆角方形。
 * 颜色、描边和落点全部由调用方决定，组件本身不绑定任何风格。
 */
export const ArollToCircularAvatarTransition: React.FC<ArollToCircularAvatarTransitionProps> = ({
  videoSrc,
  startFrame,
  endFrame,
  targetX,
  targetY,
  targetSize,
  borderColor = '#FFFFFF',
  borderWidth = 3,
  targetBorderRadiusPx,
  objectPosition = '50% 30%',
  sourceStartFrom,
  zIndex = 40,
}) => {
  const frame = useCurrentFrame();

  if (frame < startFrame || frame >= endFrame) return null;

  const progress = interpolate(frame, [startFrame, endFrame - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });

  const left = interpolate(progress, [0, 1], [0, targetX]);
  const top = interpolate(progress, [0, 1], [0, targetY]);
  const width = interpolate(progress, [0, 1], [1920, targetSize]);
  const height = interpolate(progress, [0, 1], [1080, targetSize]);
  const radius = interpolate(progress, [0, 0.42, 1], [0, 10, targetBorderRadiusPx ?? targetSize / 2]);
  const borderOpacity = interpolate(progress, [0.58, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        borderRadius: `${radius}px`,
        overflow: 'hidden',
        background: '#000',
        zIndex,
      }}
    >
      <OffthreadVideo
        muted
        src={videoSrc}
        startFrom={sourceStartFrom}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          border: `${borderWidth}px solid ${borderColor}`,
          boxSizing: 'border-box',
          opacity: borderOpacity,
        }}
      />
    </div>
  );
};
