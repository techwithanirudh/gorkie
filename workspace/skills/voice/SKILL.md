---
name: voice
description: Text-to-speech and speech-to-text audio work in the sandbox. Use when the user asks to generate voice/audio from text, create a spoken message, transcribe an audio or voice message, convert audio formats, inspect spoken content, or prepare audio files for Slack upload. Uses ffmpeg plus Python packages gTTS, SpeechRecognition, and pydub that are preinstalled in gorkie's E2B sandbox.
---

# Voice

Use this skill for speech-to-text and text-to-speech tasks in the sandbox. Keep generated and converted files under `/home/user/downloads` unless the user asks for another path.

## Text to speech

Use `gtts` to turn text into an MP3.

```bash
python3 - <<'PY'
from gtts import gTTS

text = """Replace this with the text to speak."""
gTTS(text=text, lang="en").save("/home/user/downloads/voice-message.mp3")
print("/home/user/downloads/voice-message.mp3")
PY
```

For Slack-friendly output, prefer MP3 or M4A. Convert with ffmpeg when needed:

```bash
ffmpeg -y -i /home/user/downloads/voice-message.mp3 -c:a aac /home/user/downloads/voice-message.m4a
```

## Speech to text

First convert the source audio to mono WAV, then transcribe it.

```bash
ffmpeg -y -i /home/user/downloads/audio_clip.m4a -ac 1 -ar 16000 /home/user/downloads/audio_clip.wav
```

```bash
python3 - <<'PY'
import speech_recognition as sr

path = "/home/user/downloads/audio_clip.wav"
recognizer = sr.Recognizer()

with sr.AudioFile(path) as source:
    audio = recognizer.record(source)

try:
    print(recognizer.recognize_google(audio))
except sr.UnknownValueError:
    print("Could not understand audio.")
except sr.RequestError as error:
    print(f"Speech recognition request failed: {error}")
PY
```

## Guidelines

- Use `get_file` first when the audio came from Slack, then work with the downloaded path.
- Use `upload_file` when the user wants the generated audio sent back to Slack.
- Mention when transcription uses Google's free recognizer, because it sends audio to an external service.
- For private or sensitive audio, ask before using network transcription. If an API key or local model is later available, prefer that path.
- Use ffmpeg for conversion, trimming, sample-rate changes, and audio diagnostics.
- If transcription fails, report whether the problem appears to be format conversion, silence/noise, or recognizer/API failure.
