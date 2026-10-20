import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS, DEVICE, RADIUS, SHADOW } from '../lib/theme';

// 圆角 UI 录屏框 / 设备样机框
// 包裹 B-roll 画面：圆角 + 实线边框 + 柔和投影
// 支持入场（淡入 + 轻微放大）和出场（淡出 + 轻微缩小）
// 参考 docs/04-design-log.md CASE-001 RoundedUIFrame
//
// variant：
// - 'plain'（默认）：原圆角 UI 框，行为与历史完全一致，不破坏现有成片
// - 'phone'：手机物理样机，深色边框 + 顶部刘海 + 圆角屏幕
// - 'web'：浏览器样机，顶栏（三圆点 + 地址栏）+ 内容区
// - 'document'：文档样机，白底 + 细灰边框 + 小圆角
// 新增 variant 详见 docs/packaging-library/components/rounded-ui-frame.md「设备样机 variant」一节

type FrameVariant = 'plain' | 'phone' | 'web' | 'document';

interface RoundedUIFrameProps {
  x: number;
  y: number;
  width: number;
  height: number;
  children: React.ReactNode;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  delay?: number;         // 入场延迟（帧）
  enterDuration?: number; // 入场持续（帧）
  exitStart?: number;     // 出场起始（帧）
  exitDuration?: number;  // 出场持续（帧）
  glowColor?: string;     // 可选外发光色（成品展示用）
  variant?: FrameVariant; // 样机类型，默认 'plain'
}

// 设备样机外框样式（plain 以外的 variant）
const getDeviceOuterStyle = (
  variant: Exclude<FrameVariant, 'plain'>,
  width: number,
  height: number
): React.CSSProperties => {
  if (variant === 'phone') {
    // 深色物理边框：用 padding 模拟边框宽度，大圆角
    const pad = Math.round(Math.min(width, height) * 0.035);
    return {
      background: DEVICE.phoneBezel,
      borderRadius: Math.round(Math.min(width, height) * 0.12),
      boxShadow: `0 12px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06) inset`,
      padding: pad,
      boxSizing: 'border-box',
    };
  }
  if (variant === 'web') {
    return {
      background: DEVICE.webBar,
      borderRadius: 12,
      boxShadow: '0 12px 36px rgba(0,0,0,0.55)',
      overflow: 'hidden',
    };
  }
  // document
  return {
    background: DEVICE.docBg,
    border: `1px solid ${DEVICE.docBorder}`,
    borderRadius: 6,
    boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
    overflow: 'hidden',
  };
};

// 设备样机内层屏幕区域（放 children 的位置与尺寸）
// 返回相对外框的 absolute 定位
const getScreenRect = (
  variant: Exclude<FrameVariant, 'plain'>,
  width: number,
  height: number
): { left: number; top: number; w: number; h: number; radius: number } => {
  if (variant === 'phone') {
    const pad = Math.round(Math.min(width, height) * 0.035);
    return {
      left: pad,
      top: pad,
      w: width - pad * 2,
      h: height - pad * 2,
      radius: Math.round(Math.min(width, height) * 0.08),
    };
  }
  if (variant === 'web') {
    const barH = Math.max(36, Math.round(height * 0.06));
    return { left: 0, top: barH, w: width, h: height - barH, radius: 0 };
  }
  // document：整片白底即屏幕，无内缩
  return { left: 0, top: 0, w: width, h: height, radius: 0 };
};

// 设备样机装饰层（刘海 / 顶栏三圆点+地址栏）
const DeviceDecoration: React.FC<{
  variant: Exclude<FrameVariant, 'plain'>;
  width: number;
  height: number;
}> = ({ variant, width, height }) => {
  if (variant === 'phone') {
    // 顶部中央刘海：黑色圆角矩形，悬浮在屏幕之上
    const notchW = Math.round(width * 0.22);
    const notchH = Math.round(height * 0.035);
    const pad = Math.round(Math.min(width, height) * 0.035);
    return (
      <div
        style={{
          position: 'absolute',
          left: (width - notchW) / 2,
          top: pad + Math.round(height * 0.015),
          width: notchW,
          height: notchH,
          background: DEVICE.phoneScreen,
          borderRadius: 999,
          zIndex: 2,
        }}
      />
    );
  }
  if (variant === 'web') {
    const barH = Math.max(36, Math.round(height * 0.06));
    const dotR = Math.max(5, Math.round(barH * 0.18));
    const dotGap = Math.round(dotR * 1.8);
    const dotY = (barH - dotR * 2) / 2;
    const addrH = Math.round(barH * 0.55);
    const addrY = (barH - addrH) / 2;
    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width,
          height: barH,
          background: DEVICE.webBar,
          borderBottom: `1px solid ${DEVICE.webBarBorder}`,
          zIndex: 2,
        }}
      >
        {/* 三圆点：红黄绿 */}
        {[DEVICE.webDotRed, DEVICE.webDotYellow, DEVICE.webDotGreen].map((c, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: Math.round(barH * 0.4) + i * (dotR * 2 + dotGap),
              top: dotY,
              width: dotR * 2,
              height: dotR * 2,
              borderRadius: '50%',
              background: c,
            }}
          />
        ))}
        {/* 地址栏 */}
        <div
          style={{
            position: 'absolute',
            left: Math.round(width * 0.28),
            top: addrY,
            width: Math.round(width * 0.6),
            height: addrH,
            background: DEVICE.webAddrBg,
            borderRadius: 6,
            border: `1px solid ${DEVICE.webAddrBorder}`,
          }}
        />
      </div>
    );
  }
  // document 无装饰层
  return null;
};

export const RoundedUIFrame: React.FC<RoundedUIFrameProps> = ({
  x,
  y,
  width,
  height,
  children,
  radius = RADIUS.uiFrame,
  borderWidth = 2,
  borderColor = COLORS.frameBorder,
  delay = 0,
  enterDuration = 18,
  exitStart = Number.MAX_SAFE_INTEGER,
  exitDuration = 10,
  glowColor,
  variant = 'plain',
}) => {
  const frame = useCurrentFrame();

  // 入场：scale 0.95->1.0 + opacity 0->1
  // 当 enterDuration <= 1 时跳过入场动画，从首帧即完全可见（避免首帧黑场）
  const enterProgress = enterDuration <= 1
    ? 1
    : interpolate(
        frame,
        [delay, delay + enterDuration],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
  const scale = 0.95 + 0.05 * enterProgress;

  // 出场：opacity 1->0 + scale 1.0->0.97
  const exitProgress = interpolate(
    frame,
    [exitStart, exitStart + exitDuration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const exitScale = 1.0 - 0.03 * exitProgress;
  const exitOpacity = 1 - exitProgress;

  const opacity = Math.min(enterProgress, exitOpacity);
  const finalScale = scale * exitScale;

  const boxShadow = glowColor
    ? `${SHADOW.uiFrame}, 0 0 32px ${glowColor}80`
    : SHADOW.uiFrame;

  // === plain：原样输出，与历史成片完全一致 ===
  if (variant === 'plain') {
    return (
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width,
          height,
          opacity,
          transform: `scale(${finalScale})`,
          transformOrigin: 'center',
          borderRadius: radius,
          overflow: 'hidden',
          border: `${borderWidth}px solid ${borderColor}`,
          boxShadow,
          backgroundColor: '#000000',
        }}
      >
        {children}
      </div>
    );
  }

  // === 设备样机 variant：外框 + 装饰 + 内层屏幕 ===
  const outerStyle = getDeviceOuterStyle(variant, width, height);
  const screen = getScreenRect(variant, width, height);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        opacity,
        transform: `scale(${finalScale})`,
        transformOrigin: 'center',
        ...outerStyle,
      }}
    >
      {/* 内层屏幕：放 children */}
      <div
        style={{
          position: 'absolute',
          left: screen.left,
          top: screen.top,
          width: screen.w,
          height: screen.h,
          borderRadius: screen.radius,
          overflow: 'hidden',
          backgroundColor: '#000000',
        }}
      >
        {children}
      </div>
      {/* 设备装饰层（刘海 / 顶栏），在屏幕之上 */}
      <DeviceDecoration variant={variant} width={width} height={height} />
    </div>
  );
};
