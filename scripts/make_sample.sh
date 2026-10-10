#!/bin/sh
# Makes a 12-second test video with tone "speech" and two pauses, so you can
# see Eden trim dead air without using your own footage.
set -e
mkdir -p data
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=12" \
  -f lavfi -i "aevalsrc='sin(2*PI*220*t)*(between(t,0,2)+between(t,3.5,6.5)+between(t,8.5,12))*0.5':s=48000:d=12" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest data/sample.mp4
echo "Created data/sample.mp4. Upload it in Eden to try the silence trimming."
