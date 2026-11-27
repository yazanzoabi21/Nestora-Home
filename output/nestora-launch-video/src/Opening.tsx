import {AbsoluteFill, CanvasImage, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Brand, Reveal} from './Elements';
export const Opening = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <AbsoluteFill className="scene dark">
    <CanvasImage src={staticFile('home.png')} premountFor={fps} style={{position: 'absolute', width: 4588.8, height: 13082.4, maxWidth: 'none', top: -372, left: interpolate(frame, [0, 4 * fps], [-2500, -2380])}} />
    <AbsoluteFill className="opening-shade" /><Brand />
    <div className="opening-copy"><Reveal><span className="pill">A NEW CHAPTER</span></Reveal><Reveal delay={.2}><h1 className="headline">Your home.<br />A new chapter.</h1></Reveal><Reveal delay={.5}><div className="arabic">شي جديد لبيتك</div></Reveal></div>
    <div className="footer"><Reveal delay={.8}>THE NESTORA HOME WEBSITE · COMING SOON</Reveal></div>
  </AbsoluteFill>;
};
