"""Local transcription: media never leaves this server. Model downloads are cached."""
import sys,json,os
from faster_whisper import WhisperModel
model = WhisperModel(os.environ.get('CAPTION_MODEL','tiny'), device='cpu', compute_type='int8', download_root=os.environ.get('CAPTION_MODEL_DIR','./data/models'))
segments, info = model.transcribe(sys.argv[1], beam_size=3, vad_filter=True)
cues = [{'start': round(s.start,3), 'end': round(s.end,3), 'text': s.text.strip()} for s in segments if s.text.strip()]
with open(sys.argv[2], 'w') as f: json.dump(cues, f)
