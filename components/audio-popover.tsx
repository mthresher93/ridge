"use client";

import { useEffect, useRef, useState } from "react";

type Device = { deviceId: string; label: string; kind: MediaDeviceKind };

export function AudioPopover() {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [inputId, setInputId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState("unknown");
  const [heard, setHeard] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function listDevices() {
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(
      all
        .filter((item) => item.kind === "audioinput" || item.kind === "audiooutput")
        .map((item, index) => ({
          deviceId: item.deviceId,
          kind: item.kind,
          label: item.label || (item.kind === "audioinput" ? `Microphone ${index + 1}` : `Speaker ${index + 1}`),
        })),
    );
  }

  function stopTest() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setTesting(false);
    setLevel(0);
  }

  async function startTest() {
    stopTest();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputId ? { deviceId: { exact: inputId } } : true,
      });
      streamRef.current = stream;
      const used = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (used) setInputId(used);
      setPermission("granted");
      setError("");
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const n = (data[i] - 128) / 128;
          sum += n * n;
        }
        const rms = Math.min(1, Math.sqrt(sum / data.length) * 4.2);
        setLevel(rms);
        if (rms > 0.06) setHeard(true);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setTesting(true);
      await listDevices();
    } catch {
      setPermission("denied");
      setError("Microphone blocked or unavailable. Allow microphone access in the browser.");
      setTesting(false);
    }
  }

  async function speakerTone() {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    gain.gain.value = 0.07;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    window.setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 500);
  }

  useEffect(() => () => stopTest(), []);

  useEffect(() => {
    if (!open) {
      stopTest();
      return;
    }
    void listDevices();
    void startTest();
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const inputs = devices.filter((item) => item.kind === "audioinput");
  const outputs = devices.filter((item) => item.kind === "audiooutput");

  return (
    <div className="az-pop-wrap" ref={wrapRef}>
      <button type="button" className={`az-btn ghost ${open ? "on" : ""}`} onClick={() => setOpen((v) => !v)}>
        Audio
      </button>
      {open ? (
        <div className="az-pop audio-pop">
          <div className="audio-pop-head">
            <span>Microphone</span>
            <span className={`az-chip ${permission === "granted" ? "ok" : permission === "denied" ? "bad" : ""}`}>
              {permission === "granted" ? "Allowed" : permission === "denied" ? "Blocked" : "Not tested"}
            </span>
          </div>
          <label className="audio-field">
            Input
            <select className="az-select" value={inputId} onChange={(event) => setInputId(event.target.value)}>
              <option value="">System default</option>
              {inputs.map((item) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="audio-field">
            Output
            <select className="az-select" value={outputId} onChange={(event) => setOutputId(event.target.value)}>
              <option value="">System default</option>
              {outputs.map((item) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mic-meter" aria-label="Microphone level">
            <div className="mic-meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <div className="text-[11px] text-[var(--muted)]">
            {testing ? (heard ? "Audio detected" : "Speak to test — waiting for input") : "Start a test to see live input"}
          </div>
          {error ? <div className="text-[11px] text-[var(--down)]">{error}</div> : null}
          <div className="flex flex-wrap gap-2 mt-1">
            {testing ? (
              <button type="button" className="az-btn" onClick={stopTest}>
                Stop test
              </button>
            ) : (
              <button type="button" className="az-btn pri" onClick={() => void startTest()}>
                Start test
              </button>
            )}
            <button type="button" className="az-btn" onClick={() => void speakerTone()}>
              Speaker tone
            </button>
          </div>
          <p className="text-[10px] text-[var(--faint)] mt-1">Speaker tone uses the browser default output. No carrier audio is connected.</p>
        </div>
      ) : null}
    </div>
  );
}
