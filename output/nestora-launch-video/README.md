# Nestora Home launch reel

24-second vertical teaser, 1080 x 1920, 30 fps, H.264 video and stereo AAC audio.

Deliverables: Nestora-Home-Coming-Soon.mp4 and cover.png.

Visuals come from the two website screenshots supplied by the owner and the original public/images/Logo.png asset. The live storefront returned a blank page in the browser during production, so the website scroll is animated from those screenshots. No live checkout or purchase was performed. Product cards are faithful screenshot crops; displayed badges reflect the supplied screenshots.

English and Arabic titles use Nestora's green and cream palette. All key titles and the website address are inside portrait safe areas. The end card remains visible for six seconds.

The instrumental track is original, generated deterministically by music.py with no third-party music or samples. There is no voiceover.

## Edit and export

Run npm install, then npm run dev to open Remotion Studio. Choose Nestora-Coming-Soon. Each scene is also registered separately, and the product scene is reused with different screenshot coordinates and copy. Styles are in src/styles.css.

Export: npx remotion render Nestora-Coming-Soon Nestora-Home-Coming-Soon.mp4 --codec=h264 --crf=18 --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=192k

Cover: npx remotion still Nestora-Coming-Soon cover.png --frame=650

Validation: video TypeScript and ESLint passed; Angular production build and full Angular lint passed. Angular reported existing size budget and CommonJS warnings. Final export verified with FFprobe and decoded in full with FFmpeg. All scenes were inspected in Remotion Studio.
