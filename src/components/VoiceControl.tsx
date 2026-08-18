import { useState } from 'react';

type VoiceStage = 'idle' | 'recording' | 'transcribing' | 'done';

export function VoiceControl() {
  const [stage, setStage] = useState<VoiceStage>('idle');
  const isRecording = stage === 'recording';
  return (
    <div className="voice-control">
      <button type="button" className={isRecording ? 'voice-button voice-button--recording' : 'voice-button'} aria-label="语音" onClick={() => setStage(isRecording ? 'idle' : 'recording')}>
        {isRecording ? '停止语音' : '语音'}
      </button>
      <span className="voice-status" role="status" aria-live="polite">
        {stage === 'recording' ? '录音中（模拟）' : stage === 'transcribing' ? '转写中（模拟）' : stage === 'done' ? '已完成（模拟）' : '按 FN 开始'}
      </span>
    </div>
  );
}
