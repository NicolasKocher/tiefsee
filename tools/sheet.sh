#!/bin/bash
# Erzeugt einen 4x4-Kontaktabzug pro Clip zur Sichtung
FF=node_modules/ffmpeg-static/ffmpeg.exe
FP=node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe
mkdir -p tools/sheets
for f in "$@"; do
  b=$(basename "$f" .mp4)
  [ -f "tools/sheets/$b.jpg" ] && continue
  d=$($FP -v error -show_entries format=duration -of csv=p=0 "$f")
  fps=$(node -e "console.log(16/$d)")
  $FF -v quiet -y -i "$f" -vf "fps=$fps,scale=320:-1,drawtext=text='%{pts\:hms}':x=5:y=5:fontcolor=yellow:fontsize=18,tile=4x4" -frames:v 1 "tools/sheets/$b.jpg"
  echo "$b $d"
done
