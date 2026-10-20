import React from 'react';
import { Audio, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT_SIZE, RADIUS, SHADOW } from '../lib/theme';

// 垂直步骤列表（用于"添加照片 -> 输入提示词"这类顺序操作段）
// 每个步骤是一张绿色卡片，激活态：1.05x scale + 黄色边框；非激活态：0.6 透明度
// 入场：spring scale 0.8->1.15->1.0 + opacity
// 出场：opacity 淡出
// 参考 docs/04-design-log.md CASE-002 HighlightTag 的 spring 入场参数
// 音效规则：见 docs/packaging-library/sfx-rules.md（多文字插入动画）

interface Step {
  text: string;
  enterFrame: number;       // 入场帧
  activeFrame: number;      // 激活帧（>= activeFrame 且 < deactiveFrame 时为激活态）
  deactiveFrame?: number;   // 取消激活帧（之后变灰）
  exitFrame?: number;       // 出场帧
}

interface StepListProps {
  x: number;
  y: number;
  steps: Step[];
  cardWidth?: number;
  cardHeight?: number;
  gap?: number;
  sfxSrc?: string;          // 入场音效（每个步骤入场时触发一次）
  sfxVolume?: number;       // 默认 1.0（内置 tick 本身较轻）
}

export const StepList: React.FC<StepListProps> = ({
  x,
  y,
  steps,
  cardWidth = 480,
  cardHeight = 70,
  gap = 16,
  sfxSrc,
  sfxVolume = 1.0,
}) => {
  const frame = useCurrentFrame();

  return (
    <>
      {sfxSrc && steps.map((step, i) => (
        <Sequence key={`sfx-${i}`} from={step.enterFrame + 5} durationInFrames={15}>
          <Audio src={sfxSrc} volume={sfxVolume} />
        </Sequence>
      ))}
      <div style={{ position: 'absolute', left: x, top: y, width: cardWidth }}>
        {steps.map((step, i) => {
          const stepY = i * (cardHeight + gap);

          const enterProgress = interpolate(
            frame,
            [step.enterFrame, step.enterFrame + 10],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
          if (enterProgress <= 0) return null;

          // spring overshoot: 0.8 -> 1.15 -> 1.0
          const enterScale = enterProgress < 0.7
            ? interpolate(enterProgress, [0, 0.7], [0.8, 1.15])
            : interpolate(enterProgress, [0.7, 1], [1.15, 1.0]);

          const isActive = frame >= step.activeFrame && (step.deactiveFrame === undefined || frame < step.deactiveFrame);
          const activeScale = isActive ? 1.1 : 1.0;
          const stateOpacity = isActive ? 1.0 : 0.35;

          const exitOpacity = step.exitFrame !== undefined
            ? interpolate(frame, [step.exitFrame, step.exitFrame + 8], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            : 1;

          const combinedOpacity = stateOpacity * exitOpacity;
          const combinedScale = enterScale * activeScale;

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top: stepY,
                width: cardWidth,
                height: cardHeight,
                opacity: combinedOpacity,
                transform: `scale(${combinedScale})`,
                transformOrigin: 'left center',
                background: COLORS.green,
                color: '#000000',
                padding: '0 28px',
                borderRadius: RADIUS.tag,
                fontSize: FONT_SIZE.card,
                fontWeight: 800,
                letterSpacing: '1px',
                boxShadow: SHADOW.card,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                border: `3px solid ${isActive ? COLORS.yellow : 'transparent'}`,
                fontFamily: '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {step.text}
            </div>
          );
        })}
      </div>
    </>
  );
};
