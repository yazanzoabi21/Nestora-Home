import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Brand, ProductPhoto, Reveal} from './Elements';
export type ProductProps = {x: number; title: string; subtitle: string; number: string};
export const Product = ({x, title, subtitle, number}: ProductProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <AbsoluteFill className="scene"><Brand /><div className="circle" /><div className="number">{number} / 03</div>
    <div className="product-copy"><Reveal><div className="eyebrow">EVERYDAY HOME ESSENTIALS</div><h1 className="headline">{title}</h1></Reveal></div>
    <div style={{scale:interpolate(frame,[0,2.67*fps],[1.04,1]), transformOrigin:'540px 990px'}}><ProductPhoto x={x}/></div>
    <div className="product-footer"><Reveal delay={.2}><div className="product-subtitle">{subtitle}</div><div className="arabic">تفاصيل بتسهّل يومك</div></Reveal></div>
  </AbsoluteFill>;
};
