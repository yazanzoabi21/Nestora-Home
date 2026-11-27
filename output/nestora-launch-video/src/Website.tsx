import {AbsoluteFill, CanvasImage, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Brand, Reveal} from './Elements';
export const Website = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <AbsoluteFill className="scene">
    <div className="circle" /><Brand />
    <div className="website-copy"><Reveal><div className="eyebrow">MEET YOUR NEW SHOPPING DESTINATION</div><h1 className="headline">Your next find.<br />One website.</h1></Reveal></div>
    <div className="browser" style={{translate: interpolate(frame, [0, .7 * fps], ['0px 120px', '0px 0px'], {extrapolateRight:'clamp', easing:Easing.bezier(.16,1,.3,1)}), rotate: interpolate(frame, [0, 6 * fps], ['-3deg','1deg'])}}>
      <div className="chrome"><span className="dots">● ● ●</span><span>nestorahomelb.com</span></div>
      <div className="screen"><CanvasImage src={staticFile('home.png')} premountFor={fps} style={{position:'absolute', width:920, height:5451*920/1912, top:interpolate(frame, [1 * fps, 5.7 * fps], [0,-750], {extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.bezier(.45,0,.55,1)})}} /></div>
    </div>
    <div className="website-footer"><Reveal delay={.5}><div className="browse">Browse. Discover. Shop.</div><div className="arabic">كل شي لبيتك، بمكان واحد</div></Reveal></div>
  </AbsoluteFill>;
};
