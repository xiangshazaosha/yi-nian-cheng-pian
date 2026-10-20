import React from 'react';
import { Audio, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT_SIZE } from '../lib/theme';

// 底部步骤流程条
// 圆形节点 + 连接线 + 下方标签
// 节点在 activeFrame 之前灰色，activeFrame 之后绿色点亮（spring scale 入场）
// 参考 docs/04-design-log.md CASE-002 HighlightTag 的 spring 入场参数

interface StepFlowBarProps {
  x: number;
  y: number;
  steps: Array<{ label: string; activeFrame: number }>;
  nodeSize?: number;
  nodeGap?: number;  // 两节点中心间距
  sfxSrc?: string;           // 节点点亮音效（每个节点 activeFrame 触发），默认无
  sfxVolume?: number;        // 音效音量，默认 1.0（内置 tick 本身较轻）
}

export const StepFlowBar: React.FC<StepFlowBarProps> = ({
  x,
  y,
  steps,
  nodeSize = 64,
  nodeGap = 400,
  sfxSrc,
  sfxVolume = 1.0,
}) => {
  const frame = useCurrentFrame();
  const totalWidth = nodeGap * (steps.length - 1) + nodeSize;

  return (
    <>
      {/* 节点点亮音效：每个节点在 activeFrame 触发 */}
      {sfxSrc && steps.map((step, i) => (
        <Sequence key={`sfx-${i}`} from={step.activeFrame} durationInFrames={15}>
          <Audio src={sfxSrc} volume={sfxVolume} />
        </Sequence>
      ))}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: totalWidth,
          height: nodeSize + 80,
        }}
      >
      {/* 连接线（背景层，灰色） */}
      {steps.length > 1 && (
        <div
          style={{
            position: 'absolute',
            left: nodeSize / 2,
            top: nodeSize / 2 - 2,
            width: nodeGap * (steps.length - 1),
            height: 4,
            background: '#444444',
            borderRadius: 2,
          }}
        />
      )}

      {/* 节点 */}
      {steps.map((step, i) => {
        const isActive = frame >= step.activeFrame;
        const enterProgress = interpolate(
          frame,
          [step.activeFrame, step.activeFrame + 8],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const eased = 1 - Math.pow(1 - enterProgress, 3);
        const nodeX = i * nodeGap;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: nodeX,
              top: 0,
              width: nodeSize,
              opacity: eased,
              transform: `scale(${0.8 + 0.2 * eased})`,
              transformOrigin: 'center top',
            }}
          >
            <div
              style={{
                width: nodeSize,
                height: nodeSize,
                borderRadius: '50%',
                background: isActive ? COLORS.green : '#333333',
                color: isActive ? '#000000' : '#888888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: nodeSize * 0.45,
                fontWeight: 900,
                boxShadow: isActive ? `0 0 16px ${COLORS.green}80` : 'none',
                border: `3px solid ${isActive ? COLORS.green : '#555555'}`,
                fontFamily: '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: nodeSize + 12,
                transform: 'translateX(-50%)',
                fontSize: FONT_SIZE.card,
                fontWeight: 700,
                color: isActive ? COLORS.textMain : COLORS.textMeta,
                whiteSpace: 'nowrap',
                fontFamily: '"PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.60)',
              }}
            >
              {step.label}
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
};
