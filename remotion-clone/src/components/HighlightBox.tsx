import React from 'react';
import { Audio, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../lib/theme';

// 高亮框（B-roll 局部区域高亮）
// 黄色 #FFE600 描边 + 同色外发光
// 用于在 B-roll 界面上框选当前操作区域（按钮、输入框等）
// 入场：6 帧淡入；出场：6 帧淡出；可选闪烁（强调）

interface HighlightBoxProps {
  x: number;
  y: number;
  width: number;
  height: number;
  enterFrame: number;
  exitFrame?: number;
  blinkFrame?: number;       // 闪烁起始帧（10 帧周期：1->0.3->1->1）
  borderWidth?: number;
  borderRadius?: number;
  color?: string;            // 描边颜色，默认黄色
  pulseFrame?: number;       // 脉冲起始帧（12 帧周期：scale 1.0->1.05->1.0）
  sfxSrc?: string;           // 出现音效（默认无，建议 tick.mp3）
  pulseSfxSrc?: string;      // 脉冲音效（默认无，建议 ding.mp3）
  sfxVolume?: number;        // 音效音量 0-1，默认 0.3
}

export const HighlightBox: React.FC<HighlightBoxProps> = ({
  x,
  y,
  width,
  height,
  enterFrame,
  exitFrame,
  blinkFrame,
  borderWidth = 3,
  borderRadius = 12,
  color = COLORS.yellow,
  pulseFrame,
  sfxSrc,
  pulseSfxSrc,
  sfxVolume = 0.3,
}) => {
  const frame = useCurrentFrame();

  const enterOpacity = interpolate(
    frame,
    [enterFrame, enterFrame + 6],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const exitOpacity = exitFrame !== undefined
    ? interpolate(frame, [exitFrame, exitFrame + 6], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  // 闪烁：blinkFrame 起 10 帧内 opacity 1->0.3->1
  const blinkOpacity = blinkFrame !== undefined && frame >= blinkFrame && frame < blinkFrame + 10
    ? interpolate(
        frame,
        [blinkFrame, blinkFrame + 3, blinkFrame + 6, blinkFrame + 10],
        [1, 0.3, 1, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    : 1;

  // 脉冲：pulseFrame 起 12 帧内 scale 1.0->1.05->1.0
  const pulseScale = pulseFrame !== undefined && frame >= pulseFrame && frame < pulseFrame + 12
    ? interpolate(
        frame,
        [pulseFrame, pulseFrame + 6, pulseFrame + 12],
        [1.0, 1.05, 1.0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    : 1;

  const opacity = enterOpacity * exitOpacity * blinkOpacity;

  return (
    <>
      {/* 出现音效：在 enterFrame + 3 帧触发（视觉淡入到 50% 时） */}
      {sfxSrc && (
        <Sequence from={enterFrame + 3} durationInFrames={15}>
          <Audio src={sfxSrc} volume={sfxVolume} />
        </Sequence>
      )}
      {/* 脉冲音效：在 pulseFrame 帧触发 */}
      {pulseSfxSrc && pulseFrame !== undefined && (
        <Sequence from={pulseFrame} durationInFrames={20}>
          <Audio src={pulseSfxSrc} volume={sfxVolume} />
        </Sequence>
      )}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width,
          height,
          opacity,
          transform: `scale(${pulseScale})`,
          transformOrigin: 'center',
          border: `${borderWidth}px solid ${color}`,
          borderRadius,
          boxShadow: `0 0 16px ${color}80, 0 0 32px ${color}40`,
          pointerEvents: 'none',
        }}
      />
    </>
  );
};
