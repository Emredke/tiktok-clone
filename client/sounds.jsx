import React, { useState, useEffect, useRef } from "react";
import { api, uploadFile } from "./api";
import { Mic, Square, Music2 } from "lucide-react";
export function SoundTools({ defaults = {} }) {
  const [sounds, setSounds] = useState([]),
    [sound, setSound] = useState(defaults.sound_id || ""),
    [voice, setVoice] = useState(defaults.voiceover_id || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0);
  const recorder = useRef(null),
    stream = useRef(null),
    chunks = useRef([]),
    timer = useRef(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    api("/sounds")
      .then((d) => {
        if (alive.current) setSounds(d.sounds);
      })
      .catch((e) => setError(e.message));
    return () => {
      alive.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
    };
  }, []);
  const upload = async (file) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("audio", file);
      const d = await uploadFile("/voiceovers", form);
      if (alive.current) setVoice(d.voiceover.id);
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const start = async () => {
    setError("");
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder)
        throw new Error(
          "Audio recording is unavailable in this browser. You can upload audio instead.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = r;
      chunks.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      r.onstop = () => {
        clearInterval(timer.current);
        stream.current?.getTracks().forEach((t) => t.stop());
        if (!alive.current) return;
        setRecording(false);
        const ext = r.mimeType.includes("mp4") ? "m4a" : "webm";
        upload(
          new File(chunks.current, `voiceover.${ext}`, { type: r.mimeType }),
        );
      };
      r.start(250);
      setRecording(true);
      setSeconds(0);
      let elapsed = 0;
      timer.current = setInterval(() => {
        elapsed++;
        setSeconds(elapsed);
        if (elapsed >= 179) r.stop();
      }, 1000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(e.message);
    }
  };
  const selected = sounds.find((s) => s.id === sound);
  return (
    <div className="sound-tools">
      <h3>
        <Music2 size={18} />
        Sound & voice
      </h3>
      <label>
        Music or effect
        <select
          aria-label="Music or effect"
          name="sound_id"
          value={sound}
          onChange={(e) => setSound(e.target.value)}
        >
          <option value="">Original audio only</option>
          <optgroup label="Music loops">
            {sounds
              .filter((s) => s.kind === "music")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Sound effects">
            {sounds
              .filter((s) => s.kind === "effect")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      {selected && (
        <>
          <audio controls src={selected.url} key={sound} />
          <p className="small-note">
            {selected.name} · Original by {selected.author} ·{" "}
            <a href={selected.license_url} target="_blank" rel="noreferrer">
              {selected.license}
            </a>
            . Music loops to fit; effects play once.
          </p>
        </>
      )}
      <input type="hidden" name="voiceover_id" value={voice} />
      <div className="community-toolbar">
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => (recording ? recorder.current?.stop() : start())}
        >
          {recording ? <Square size={16} /> : <Mic size={16} />}{" "}
          {recording ? `Stop · ${seconds}s` : "Record voiceover"}
        </button>
        <label className="audio-upload">
          Upload audio
          <input
            aria-label="Upload voiceover"
            type="file"
            accept="audio/*"
            disabled={busy || recording}
            onChange={(e) => {
              if (e.target.files[0]) upload(e.target.files[0]);
            }}
          />
        </label>
      </div>
      {busy && <p role="status">Preparing your recording…</p>}
      {voice && (
        <>
          <audio controls src={`/api/voiceovers/${voice}/audio`} key={voice} />
          <button
            type="button"
            className="text-button"
            onClick={() => setVoice("")}
          >
            Remove from this video
          </button>
        </>
      )}
      <div className="tool-grid">
        {[
          ["original_volume", "Original volume", 1],
          ["music_volume", "Music / effect volume", 0.35],
          ["voiceover_volume", "Voiceover volume", 1],
        ].map(([key, label, value]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type="number"
              min="0"
              max="2"
              step=".05"
              defaultValue={defaults[key] ?? value}
            />
          </label>
        ))}
        <label>
          Voice starts at (seconds)
          <input
            name="voice_start"
            type="number"
            min="0"
            max="179"
            step=".1"
            defaultValue={defaults.voice_start || 0}
          />
        </label>
      </div>
      <p className="small-note">
        Volume 0 is silent; 1 is full volume. Preview each track here. The
        complete mix is rendered when you publish. Recording stops at 179
        seconds.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <input
        type="hidden"
        name="audio_busy"
        value={String(busy || recording)}
      />
    </div>
  );
}
