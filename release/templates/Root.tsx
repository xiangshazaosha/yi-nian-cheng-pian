import React from 'react';
import {AbsoluteFill, Composition, interpolate, useCurrentFrame} from 'remotion';
import {DUOTONE} from './styles/duotone';

// Generated synthetic technical sample. No real media, network fetch or account.
const PublicSmoke: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, 45, 89], [0.1, 0.65, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{
    backgroundColor: DUOTONE.color.canvas, color: DUOTONE.color.ink,
    padding: 100, justifyContent: 'center', fontFamily: 'sans-serif',
  }}>
    <div style={{fontSize: 76, fontWeight: 800}}>一念成片</div>
    <div style={{fontSize: 32, marginTop: 20}}>Yi Nian Cheng Pian</div>
    <div style={{height: 12, marginTop: 50, width: 900, background: DUOTONE.color.card}}>
      <div style={{height: '100%', width: String(progress * 100) + '%',
        background: DUOTONE.color.accent}} />
    </div>
    <div style={{fontSize: 24, marginTop: 30}}>Technical sample — no user media</div>
  </AbsoluteFill>;
};

export const RemotionRoot: React.FC = () => <Composition
  id="PublicSmoke" component={PublicSmoke} durationInFrames={90}
  fps={30} width={1920} height={1080}
/>;
