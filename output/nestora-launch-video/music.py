"""Generate an original, deterministic instrumental bed; no licensed samples."""
import math
import random
import struct
import wave
from pathlib import Path

rate = 44100
duration = 24
random.seed(42)
chords = [(146.83, 174.61, 220, 261.63), (130.81, 164.81, 196, 246.94),
          (110, 130.81, 164.81, 196), (98, 123.47, 146.83, 174.61)]
data = bytearray()
for i in range(rate * duration):
    t = i / rate
    beat = t * 2
    phase = beat % 1
    chord = chords[int(t / 4) % 4]
    pad = sum(math.sin(2 * math.pi * f * t) + .2 * math.sin(4 * math.pi * f * t) for f in chord) * .023
    kick = math.sin(2 * math.pi * (48 * phase / 2 + 5 * (1 - math.exp(-phase * 24)))) * math.exp(-phase * 15) * .24
    half = (beat * 2) % 1
    hat = random.uniform(-1, 1) * math.exp(-half * 48) * .035
    note = chord[int(beat * 2) % 4] * 4
    pluck = math.sin(2 * math.pi * note * half / 4) * math.exp(-half * 7) * .065
    bass = math.sin(2 * math.pi * chord[0] / 2 * t) * .06 * (1 - .6 * math.exp(-phase * 8))
    fade = min(1, t / .6, (duration - t) / 1.4)
    val = math.tanh((pad + kick + hat + pluck + bass) * 1.8) * fade
    left = int(val * 24000)
    right = int((val + .008 * math.sin(2 * math.pi * 440 * t)) * fade * 24000)
    data.extend(struct.pack('<hh', left, right))
with wave.open(str(Path(__file__).parent / 'public' / 'nestora-original.wav'), 'wb') as out:
    out.setnchannels(2)
    out.setsampwidth(2)
    out.setframerate(rate)
    out.writeframes(data)
