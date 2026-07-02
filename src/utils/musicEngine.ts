export interface MusicSettings {
  enableBackgroundMusic: boolean;
  backgroundMusicVolume: number;
}

export interface MusicTrackSource {
  id: string;
  title: string;
  url?: string;
}

export const MUSIC_SETTINGS_EVENT = 'xiantu:music-settings-changed';

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  enableBackgroundMusic: true,
  backgroundMusicVolume: 35,
};

const SETTINGS_STORAGE_KEY = 'dad_game_settings';
const NOTE_SCALE = [196, 220, 261.63, 293.66, 329.63, 392, 440];

const clampVolume = (volume: unknown): number => {
  if (typeof volume !== 'number' || !Number.isFinite(volume)) return DEFAULT_MUSIC_SETTINGS.backgroundMusicVolume;
  return Math.max(0, Math.min(100, volume));
};

export const readMusicSettings = (): MusicSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MUSIC_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      enableBackgroundMusic:
        typeof parsed?.enableBackgroundMusic === 'boolean'
          ? parsed.enableBackgroundMusic
          : DEFAULT_MUSIC_SETTINGS.enableBackgroundMusic,
      backgroundMusicVolume: clampVolume(parsed?.backgroundMusicVolume),
    };
  } catch {
    return { ...DEFAULT_MUSIC_SETTINGS };
  }
};

export const notifyMusicSettingsChanged = (settings: MusicSettings) => {
  window.dispatchEvent(new CustomEvent<MusicSettings>(MUSIC_SETTINGS_EVENT, { detail: settings }));
};

class XiantuMusicEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private scheduler: number | null = null;
  private unlockCleanup: (() => void) | null = null;
  private activeAudio: HTMLAudioElement | null = null;
  private fadingAudio: HTMLAudioElement | null = null;
  private fadeTimer: number | null = null;
  private track: MusicTrackSource | null = null;
  private enabled = false;
  private volume = DEFAULT_MUSIC_SETTINGS.backgroundMusicVolume;
  private noteIndex = 0;

  setTrack(track: MusicTrackSource | null) {
    if (this.track?.id === track?.id && this.track?.url === track?.url) return;
    this.track = track;
    if (this.enabled) {
      void this.start();
    }
  }

  applySettings(settings: MusicSettings) {
    this.enabled = settings.enableBackgroundMusic;
    this.volume = clampVolume(settings.backgroundMusicVolume);
    this.applyVolume();

    if (this.enabled) {
      void this.start();
    } else {
      this.stop();
    }
  }

  async start() {
    if (!this.enabled) return;
    if (this.track?.url) {
      await this.startAudioTrack(this.track);
      return;
    }

    const context = this.ensureContext();

    try {
      await context.resume();
    } catch {
      this.waitForUserGesture();
      return;
    }

    if (context.state !== 'running') {
      this.waitForUserGesture();
      return;
    }

    this.startDrone();
    this.startScheduler();
  }

  stop() {
    this.stopAudioTrack();
    this.stopSyntheticTrack();
  }

  destroy() {
    this.stop();
    if (this.context) {
      void this.context.close();
    }
    this.context = null;
    this.masterGain = null;
    this.droneGain = null;
    this.delay = null;
    this.feedback = null;
  }

  private stopSyntheticTrack() {
    if (this.scheduler !== null) {
      window.clearInterval(this.scheduler);
      this.scheduler = null;
    }

    this.unlockCleanup?.();
    this.unlockCleanup = null;

    if (this.droneGain && this.context) {
      const now = this.context.currentTime;
      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setTargetAtTime(0, now, 0.8);
    }
  }

  private async startAudioTrack(track: MusicTrackSource) {
    this.stopSyntheticTrack();

    if (this.activeAudio?.dataset.trackId === track.id) {
      this.applyVolume();
      if (this.activeAudio.paused) {
        try {
          await this.activeAudio.play();
        } catch {
          this.waitForUserGesture();
        }
      }
      return;
    }

    const previous = this.activeAudio;
    const audio = new Audio(track.url);
    audio.dataset.trackId = track.id;
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    this.activeAudio = audio;

    try {
      await audio.play();
      this.fadeAudio(audio, this.audioVolume(), 800);
      if (previous) this.fadeOutAndStop(previous, 900);
    } catch {
      this.activeAudio = previous;
      audio.pause();
      audio.src = '';
      this.waitForUserGesture();
    }
  }

  private stopAudioTrack() {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.unlockCleanup?.();
    this.unlockCleanup = null;

    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.src = '';
      this.activeAudio = null;
    }
    if (this.fadingAudio) {
      this.fadingAudio.pause();
      this.fadingAudio.src = '';
      this.fadingAudio = null;
    }
  }

  private fadeAudio(audio: HTMLAudioElement, targetVolume: number, durationMs: number) {
    const startedAt = performance.now();
    const initialVolume = audio.volume;
    const delta = targetVolume - initialVolume;

    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }

    this.fadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      audio.volume = Math.max(0, Math.min(1, initialVolume + delta * progress));
      if (progress >= 1 && this.fadeTimer !== null) {
        window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
      }
    }, 40);
  }

  private fadeOutAndStop(audio: HTMLAudioElement, durationMs: number) {
    this.fadingAudio = audio;
    const startedAt = performance.now();
    const initialVolume = audio.volume;

    const timer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      audio.volume = Math.max(0, initialVolume * (1 - progress));
      if (progress >= 1) {
        window.clearInterval(timer);
        audio.pause();
        audio.src = '';
        if (this.fadingAudio === audio) this.fadingAudio = null;
      }
    }, 40);
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.context = new AudioContextClass();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.volumeToGain();
    this.masterGain.connect(this.context.destination);

    this.delay = this.context.createDelay(4);
    this.delay.delayTime.value = 0.42;
    this.feedback = this.context.createGain();
    this.feedback.gain.value = 0.22;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.masterGain);

    return this.context;
  }

  private applyVolume() {
    if (this.activeAudio) {
      this.activeAudio.volume = this.audioVolume();
    }
    if (!this.masterGain || !this.context) return;
    this.masterGain.gain.setTargetAtTime(this.volumeToGain(), this.context.currentTime, 0.15);
  }

  private audioVolume(): number {
    return (this.volume / 100) * 0.72;
  }

  private volumeToGain(): number {
    return (this.volume / 100) * 0.18;
  }

  private waitForUserGesture() {
    if (this.unlockCleanup) return;

    const unlock = () => {
      this.unlockCleanup?.();
      this.unlockCleanup = null;
      void this.start();
    };

    const options: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, { once: true });
    this.unlockCleanup = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }

  private startScheduler() {
    if (this.scheduler !== null) return;
    this.playPhrase();
    this.scheduler = window.setInterval(() => this.playPhrase(), 3600);
  }

  private startDrone() {
    if (!this.context || this.droneGain) return;

    const droneGain = this.context.createGain();
    droneGain.gain.value = 0;
    droneGain.connect(this.masterGain!);

    [98, 146.83].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const filter = this.context!.createBiquadFilter();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      oscillator.connect(filter);
      filter.connect(droneGain);
      oscillator.start();
    });

    droneGain.gain.setTargetAtTime(0.28, this.context.currentTime, 1.2);
    this.droneGain = droneGain;
  }

  private playPhrase() {
    if (!this.context || !this.masterGain || this.context.state !== 'running') return;

    const now = this.context.currentTime;
    const offsets = [0, 0.8, 1.65, 2.55];
    offsets.forEach((offset, phraseIndex) => {
      const frequency = NOTE_SCALE[(this.noteIndex + phraseIndex * 2) % NOTE_SCALE.length];
      this.playBell(frequency, now + offset);
      if (phraseIndex % 2 === 0) {
        this.playBell(frequency * 1.5, now + offset + 0.18, 0.35);
      }
    });

    this.noteIndex = (this.noteIndex + 1) % NOTE_SCALE.length;
  }

  private playBell(frequency: number, startTime: number, intensity = 1) {
    if (!this.context || !this.masterGain || !this.delay) return;

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, startTime);
    filter.frequency.exponentialRampToValueAtTime(420, startTime + 1.4);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.32 * intensity, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 2.4);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.delay);

    oscillator.start(startTime);
    oscillator.stop(startTime + 2.5);
  }
}

export const musicEngine = new XiantuMusicEngine();
