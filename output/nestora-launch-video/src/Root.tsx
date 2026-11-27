import {Composition, Folder, Series, staticFile, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {Opening} from './Opening';
import {Website} from './Website';
import {Product} from './Product';
import {Closing} from './Closing';
import './styles.css';
export const NestoraLaunch = () => {
  const {fps} = useVideoConfig();
  return <><Audio src={staticFile('nestora-original.wav')} volume={.85} premountFor={fps} />
    <Series>
      <Series.Sequence name="A new chapter" durationInFrames={4*fps} premountFor={fps}><Opening /></Series.Sequence>
      <Series.Sequence name="Explore the real website" durationInFrames={6*fps} premountFor={fps}><Website /></Series.Sequence>
      <Series.Sequence name="Prep smarter" durationInFrames={80} premountFor={fps}><Product x={570} title="Prep smarter." subtitle="Little upgrades. Everyday joy." number="01" /></Series.Sequence>
      <Series.Sequence name="Make it simple" durationInFrames={80} premountFor={fps}><Product x={934} title="Make it simple." subtitle="Find your everyday favourites." number="02" /></Series.Sequence>
      <Series.Sequence name="Make room for more" durationInFrames={80} premountFor={fps}><Product x={1299} title={'Make room\nfor more.'} subtitle="Made for moments at home." number="03" /></Series.Sequence>
      <Series.Sequence name="Coming soon and website address" durationInFrames={6*fps} premountFor={fps}><Closing /></Series.Sequence>
    </Series></>;
};
export const RemotionRoot = () => <>
  <Composition id="Nestora-Coming-Soon" component={NestoraLaunch} width={1080} height={1920} fps={30} durationInFrames={720}/>
  <Folder name="Scenes">
    <Composition id="Opening" component={Opening} width={1080} height={1920} fps={30} durationInFrames={120}/>
    <Composition id="Website" component={Website} width={1080} height={1920} fps={30} durationInFrames={180}/>
    <Composition id="Product" component={Product} width={1080} height={1920} fps={30} durationInFrames={80} defaultProps={{x:570,title:'Prep smarter.',subtitle:'Little upgrades. Everyday joy.',number:'01'}}/>
    <Composition id="Closing" component={Closing} width={1080} height={1920} fps={30} durationInFrames={180}/>
  </Folder>
</>;
