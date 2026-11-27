import {AbsoluteFill, CanvasImage, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Brand, Reveal} from './Elements';
export const Closing = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <AbsoluteFill className="scene dark"><Brand /><div className="circle" />
    <div className="logo" style={{scale:interpolate(frame,[0,.8*fps],[.88,1],{extrapolateRight:'clamp'})}}><CanvasImage src={staticFile('logo.png')} premountFor={fps} style={{width:560,height:560}} /></div>
    <div className="closing-copy"><Reveal delay={.15}><div className="eyebrow">YOUR HOME. JUST A CLICK AWAY.</div><h1 className="headline">Coming<br /><em>soon.</em></h1></Reveal><Reveal delay={.4}><div className="arabic">قريباً… تسوّقوا من موقعنا</div></Reveal></div>
    <div className="cta"><Reveal delay={.6}>nestorahomelb.com/shop</Reveal></div>
    <div className="closing-footer"><Reveal delay={.8}>FOLLOW FOR THE LAUNCH<span>تابعونا لتعرفوا موعد الإطلاق</span></Reveal></div>
  </AbsoluteFill>;
};
