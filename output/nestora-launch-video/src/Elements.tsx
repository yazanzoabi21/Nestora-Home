import type {ReactNode} from 'react';
import {CanvasImage, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
export const Reveal = ({children, delay = 0}: {children: ReactNode; delay?: number}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <div style={{opacity: interpolate(frame, [delay * fps, (delay + .6) * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), translate: interpolate(frame, [delay * fps, (delay + .8) * fps], ['0px 55px', '0px 0px'], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(.16, 1, .3, 1)})}}>{children}</div>;
};
export const Brand = () => <div className="brand">NESTORA HOME</div>;
export const ProductPhoto = ({x}: {x: number}) => {
  const {fps} = useVideoConfig();
  return <div className="product"><CanvasImage src={staticFile('shop.png')} premountFor={fps} style={{position: 'absolute', width: 1912 * (800 / 338), height: 2991 * (800 / 338), maxWidth: 'none', left: -x * (800 / 338), top: -342 * (800 / 338)}} /></div>;
};
