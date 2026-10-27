import { useEffect, useRef, useState } from 'react';
import { uploadDmMedia } from '../lib/dmMedia.js';
import { tDm, dmFilesConfirmText } from '../lib/dmLocale.js';

const PHOTO_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 20 * 1024 * 1024;
const AUDIO_MAX = 8 * 1024 * 1024;
const MAX_VOICE_DURATION = 90_000;
const MAX_CIRCLE_DURATION = 45_000;
const recordingMime = (kind) => {
  const choices = kind === 'voice'
    ? ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg']
    : ['video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'];
  return choices.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

function formatSeconds(n) { return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
function stopTracks(stream) { stream?.getTracks().forEach((track) => track.stop()); }

function LocalFileTile({ file }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <span className="dm-file-card">
    {file.type.startsWith('image/') ? <img src={src} alt="Предпросмотр фото" /> : <video src={src} muted preload="metadata" playsInline />}
    <small>{file.name}</small>
  </span>;
}

export default function DmMediaComposer({ friendId, onError }) {
  const filesRef = useRef(null);
  const previewRef = useRef(null);
  const recorderRef = useRef(null);
  const sourceRef = useRef(null);
  const micRef = useRef(null);
  const recordStreamRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const timeoutRef = useRef(null);
  const cancelledRef = useRef(false);
  const modeRef = useRef('');
  const facingRef = useRef('user');
  const requestIdRef = useRef(0);
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState([]);
  const [seconds, setSeconds] = useState(0);
  const [facing, setFacing] = useState('user');
  const [recording, setRecording] = useState(false);

  function cleanMedia() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    timerRef.current = timeoutRef.current = rafRef.current = null;
    stopTracks(sourceRef.current);
    stopTracks(micRef.current);
    stopTracks(recordStreamRef.current);
    sourceRef.current = micRef.current = recordStreamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  }

  useEffect(() => () => {
    cancelledRef.current = true;
    requestIdRef.current += 1;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    cleanMedia();
  }, []);

  function problem(error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') onError?.(tDm('Разреши доступ к камере или микрофону в браузере.'));
    else if (error?.message === 'INVALID_MEDIA_FILE') onError?.(tDm('Формат вложения не поддерживается.'));
    else onError?.(tDm('Не удалось отправить файл. Проверь разрешения, формат и подключение.'));
  }

  async function sendBlob(blob, kind) {
    setBusy(true);
    try { await uploadDmMedia(friendId, blob, kind); }
    catch (error) { problem(error); }
    finally { setBusy(false); }
  }

  async function sendSelected() {
    if (!selected.length || busy) return;
    const copies = selected;
    setSelected([]);
    setBusy(true);
    try {
      for (const file of copies) await uploadDmMedia(friendId, file, file.type.startsWith('image/') ? 'image' : 'video');
    } catch (error) { problem(error); }
    finally { setBusy(false); }
  }

  function selectFiles(event) {
    const files = [...(event.target.files || [])].slice(0, 6);
    event.target.value = '';
    if (!files.length) return;
    const allowed = files.filter((file) => {
      const isImage = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type);
      const isVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
      return (isImage && file.size <= PHOTO_MAX) || (isVideo && file.size <= VIDEO_MAX);
    });
    if (allowed.length !== files.length) onError?.(tDm('Некоторые файлы не поддерживаются или слишком большие: фото до 8 МБ, видео до 20 МБ.'));
    setSelected(allowed);
  }

  function cancelRecording() {
    cancelledRef.current = true;
    requestIdRef.current += 1;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    cleanMedia();
    setMode('');
    setRecording(false);
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
  }

  function startRecorder(stream, mime, kind, maxDuration) {
    const chunks = [];
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const wasCancelled = cancelledRef.current;
      const resultMime = recorder.mimeType.split(';')[0] || mime.split(';')[0];
      const blob = new Blob(chunks, { type: resultMime });
      cleanMedia();
      setRecording(false);
      setMode('');
      if (!wasCancelled && blob.size > 0 && blob.size <= (kind === 'voice' ? AUDIO_MAX : VIDEO_MAX)) void sendBlob(blob, kind);
      else if (!wasCancelled && blob.size > (kind === 'voice' ? AUDIO_MAX : VIDEO_MAX)) onError?.(tDm('Запись получилась слишком большой.'));
    };
    cancelledRef.current = false;
    recorder.start(300);
    setRecording(true);
    setSeconds(0);
    const started = Date.now();
    timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    timeoutRef.current = setTimeout(() => stopRecording(), maxDuration);
  }

  async function recordVoice() {
    if (busy || mode) return;
    setMode('voice');
    modeRef.current = 'voice';
    const requestId = ++requestIdRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('UNSUPPORTED');
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (requestId !== requestIdRef.current) { stopTracks(mic); return; }
      micRef.current = mic;
      const mime = recordingMime('voice');
      startRecorder(mic, mime, 'voice', MAX_VOICE_DURATION);
    } catch (error) { cleanMedia(); setMode(''); problem(error); }
  }

  function startDrawLoop(canvas, video) {
    const ctx = canvas.getContext('2d', { alpha: false });
    function draw() {
      const width = video.videoWidth, height = video.videoHeight;
      if (width && height) {
        const crop = Math.min(width, height);
        const x = (width - crop) / 2, y = (height - crop) / 2;
        ctx.save();
        if (facingRef.current === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, x, y, crop, crop, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    draw();
  }

  async function openCircle() {
    if (busy || mode) return;
    setMode('circle'); modeRef.current = 'circle'; setFacing('user'); facingRef.current = 'user';
    const requestId = ++requestIdRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('UNSUPPORTED');
      const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false });
      if (requestId !== requestIdRef.current) { stopTracks(camera); return; }
      sourceRef.current = camera;
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
      if (requestId !== requestIdRef.current) { stopTracks(mic); cleanMedia(); return; }
      micRef.current = mic;
      // Video preview is active before recording; nothing uploads until Record is tapped.
      if (previewRef.current) { previewRef.current.srcObject = camera; await previewRef.current.play().catch(() => {}); }
    } catch (error) { cleanMedia(); setMode(''); problem(error); }
  }

  async function flipCamera() {
    if (!sourceRef.current) return;
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      const old = sourceRef.current;
      // Stop old video track first: some mobile browsers cannot open two cameras at once.
      stopTracks(old);
      const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next }, width: { ideal: 640 }, height: { ideal: 640 } }, audio: false });
      sourceRef.current = camera;
      facingRef.current = next;
      setFacing(next);
      if (previewRef.current) { previewRef.current.srcObject = camera; await previewRef.current.play().catch(() => {}); }
    } catch (error) { problem(error); }
  }

  function beginCircleRecording() {
    if (recording || !sourceRef.current || !micRef.current) return;
    try {
      const mime = recordingMime('circle');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 480;
      if (typeof canvas.captureStream !== 'function') throw new Error('CANVAS_UNSUPPORTED');
      const video = previewRef.current;
      startDrawLoop(canvas, video);
      const stream = canvas.captureStream(20);
      micRef.current.getAudioTracks().forEach((track) => stream.addTrack(track));
      recordStreamRef.current = stream;
      startRecorder(stream, mime, 'circle', MAX_CIRCLE_DURATION);
    } catch (error) { cleanMedia(); setMode(''); problem(error); }
  }

  return <>
    <input ref={filesRef} className="dm-hidden-input" type="file" accept="image/*,video/*" multiple onChange={selectFiles} aria-label={tDm('Выбрать фото или видео')} />
    <button type="button" className="dm-attach-button" onClick={() => filesRef.current?.click()} disabled={busy || !!mode} title={tDm('Фото и видео')} aria-label={tDm('Прикрепить фото или видео')}>📎</button>
    <button type="button" className="dm-attach-button" onClick={recordVoice} disabled={busy || !!mode} title={tDm('Голосовое сообщение')} aria-label={tDm('Записать голосовое сообщение')}>🎤</button>
    <button type="button" className="dm-attach-button" onClick={openCircle} disabled={busy || !!mode} title={tDm('Видеокружочек')} aria-label={tDm('Записать видеокружочек')}>◉</button>
    {busy && <div className="dm-upload-status" role="status">{tDm('Отправка файла…')}</div>}
    {selected.length > 0 && <div className="dm-media-overlay" role="dialog" aria-modal="true" aria-label="Предпросмотр вложений">
      <div className="dm-media-dialog"><h3>{dmFilesConfirmText(selected.length)}</h3>
        <div className="dm-media-selection">{selected.map((file, index) => <LocalFileTile key={`${file.name}-${index}`} file={file} />)}</div>
        <div className="dm-media-dialog-actions"><button type="button" onClick={() => setSelected([])}>{tDm('Отмена')}</button><button type="button" onClick={sendSelected} disabled={busy}>{tDm('Отправить')}</button></div>
      </div>
    </div>}
    {mode && <div className="dm-media-overlay" role="dialog" aria-modal="true" aria-label={mode === 'voice' ? 'Запись голоса' : 'Видеокружочек'}>
      <div className="dm-media-dialog dm-recorder-dialog">
        <h3>{mode === 'voice' ? `🎤 ${tDm('Голосовое сообщение')}` : `◉ ${tDm('Видеокружочек')}`}</h3>
        {mode === 'voice' ? <div className="dm-recording-wave">{recording ? `● ${tDm('Идёт запись')}` : tDm('Разреши использование микрофона')}</div> : <video ref={previewRef} className={`dm-circle-preview ${facing === 'user' ? 'is-selfie' : ''}`} autoPlay muted playsInline />}
        <strong className="dm-recording-time">{formatSeconds(seconds)}</strong>
        <div className="dm-media-dialog-actions">
          <button type="button" onClick={cancelRecording}>{tDm('Отмена')}</button>
          {mode === 'circle' && <button type="button" onClick={flipCamera} title={tDm('Переключить камеру')}>↻ {tDm('Камера')}</button>}
          {recording ? <button type="button" onClick={stopRecording}>■ {tDm('Отправить')}</button> : mode === 'circle' && <button type="button" onClick={beginCircleRecording}>● {tDm('Запись')}</button>}
        </div>
      </div>
    </div>}
  </>;
}
