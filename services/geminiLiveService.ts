import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from './audioUtils';
import { ConnectionState } from '../types';

export class GeminiLiveService {
  private ai: GoogleGenAI | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private nextStartTime: number = 0;
  private sessionPromise: Promise<any> | null = null;
  private initialized = false;
  private isMuted: boolean = false;
  
  // Background Throttling Prevention
  private keepAliveOscillator: OscillatorNode | null = null;
  private keepAliveGain: GainNode | null = null;
  
  // Video Streaming Props
  private videoStream: MediaStream | null = null;
  private videoInterval: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private videoEl: HTMLVideoElement | null = null;

  // Callbacks
  public onTranscription: (text: string, type: 'user' | 'model') => void = () => {};
  public onStateChange: (state: ConnectionState) => void = () => {};
  public onError: (error: string) => void = () => {};
  public onAudioLevel: (level: number) => void = () => {};

  constructor() {
    // Client is initialized in connect() to ensure fresh API key
  }

  setMute(muted: boolean) {
    this.isMuted = muted;
    // When unmuting, ensure contexts are running
    if (!muted) {
        this.resumeContexts();
    }
  }

  private async resumeContexts() {
    try {
        if (this.inputAudioContext?.state === 'suspended') {
            await this.inputAudioContext.resume();
        }
        if (this.outputAudioContext?.state === 'suspended') {
            await this.outputAudioContext.resume();
        }
    } catch(e) {
        console.warn("Audio Context Resume Warning:", e);
    }
  }

  async connect(systemInstruction: string, voiceName: string = 'Kore') {
    try {
      this.onStateChange(ConnectionState.CONNECTING);

      // Re-initialize client with latest key
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // 1. Check for MediaDevices support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
         throw new Error("Seu navegador não suporta acesso ao microfone.");
      }

      // 2. Request Microphone Permission FIRST
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        throw new Error("Permissão de microfone negada. Por favor, permita o acesso nas configurações do navegador.");
      }

      // 3. Initialize Audio Contexts ONLY after permission is granted
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
      
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);
      this.nextStartTime = this.outputAudioContext.currentTime;

      // Ensure contexts are running immediately (important for mobile)
      await this.resumeContexts();

      // --- KEEP ALIVE HACK ---
      // Play a virtually silent sound to prevent browser from throttling this tab in background
      this.keepAliveOscillator = this.outputAudioContext.createOscillator();
      this.keepAliveGain = this.outputAudioContext.createGain();
      this.keepAliveGain.gain.value = 0.0001; // Almost silent
      this.keepAliveOscillator.connect(this.keepAliveGain);
      this.keepAliveGain.connect(this.outputAudioContext.destination);
      this.keepAliveOscillator.start();
      // -----------------------

      // 4. Connect to Gemini Live
      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            this.onStateChange(ConnectionState.CONNECTED);
            this.startAudioInput(stream);
          },
          onmessage: (message: LiveServerMessage) => this.handleMessage(message),
          onclose: () => {
            this.onStateChange(ConnectionState.DISCONNECTED);
            this.cleanup();
          },
          onerror: (err) => {
            console.error("Gemini Live Error:", err);
            this.onStateChange(ConnectionState.ERROR);
            this.onError(err.toString());
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: systemInstruction,
          // Explicitly empty objects enable transcription
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
        },
      });

      this.initialized = true;

    } catch (error: any) {
      console.error("Connection failed:", error);
      this.onStateChange(ConnectionState.ERROR);
      this.onError(error.message || 'Falha ao conectar.');
      await this.cleanup(); // Ensure cleanup on init failure
    }
  }

  private startAudioInput(stream: MediaStream) {
    if (!this.inputAudioContext) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Mute Logic: If muted, fill buffer with silence (0)
      if (this.isMuted) {
        for (let i = 0; i < inputData.length; i++) {
            inputData[i] = 0;
        }
      }

      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.onAudioLevel(rms);

      const pcmBlob = createPcmBlob(inputData);

      if (this.sessionPromise) {
        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      }
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  // --- Screen Sharing / Video Logic ---
  async startScreenShare() {
    if (!this.initialized || !this.sessionPromise) {
        throw new Error("Conecte-se à Aria primeiro.");
    }

    try {
        this.videoStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: { 
                width: { max: 1280 },
                height: { max: 720 },
                frameRate: { max: 5 }
            }, 
            audio: false 
        });

        this.videoEl = document.createElement('video');
        this.videoEl.srcObject = this.videoStream;
        this.videoEl.play();
        this.canvas = document.createElement('canvas');
        const ctx = this.canvas.getContext('2d');

        this.videoStream.getVideoTracks()[0].onended = () => {
            this.stopScreenShare();
        };

        this.videoInterval = window.setInterval(async () => {
            if (!this.videoEl || !this.canvas || !ctx || !this.sessionPromise) return;
            
            this.canvas.width = this.videoEl.videoWidth;
            this.canvas.height = this.videoEl.videoHeight;
            ctx.drawImage(this.videoEl, 0, 0);

            const base64 = this.canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
            
            this.sessionPromise.then(session => {
                session.sendRealtimeInput({
                    media: {
                        mimeType: 'image/jpeg',
                        data: base64
                    }
                });
            });

        }, 1000);

    } catch (err) {
        console.error("Error starting screen share:", err);
        throw err;
    }
  }

  stopScreenShare() {
    if (this.videoInterval) {
        clearInterval(this.videoInterval);
        this.videoInterval = null;
    }
    if (this.videoStream) {
        this.videoStream.getTracks().forEach(track => track.stop());
        this.videoStream = null;
    }
    this.videoEl = null;
    this.canvas = null;
  }
  // ------------------------------------

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.inputTranscription?.text) {
        this.onTranscription(message.serverContent.inputTranscription.text, 'user');
    }
    if (message.serverContent?.outputTranscription?.text) {
        this.onTranscription(message.serverContent.outputTranscription.text, 'model');
    }

    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
        try {
            if (this.outputAudioContext.state === 'suspended') {
                await this.outputAudioContext.resume();
            }

            this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);

            const audioBuffer = await decodeAudioData(
                base64ToUint8Array(base64Audio),
                this.outputAudioContext
            );

            const source = this.outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputNode);
            source.start(this.nextStartTime);
            
            this.nextStartTime += audioBuffer.duration;

        } catch (e) {
            console.error('Error decoding/playing audio', e);
        }
    }

    if (message.serverContent?.interrupted) {
        this.nextStartTime = this.outputAudioContext?.currentTime || 0;
    }
  }

  async disconnect() {
    this.stopScreenShare();
    await this.cleanup();
  }

  private async cleanup() {
    this.initialized = false;
    this.isMuted = false;
    this.stopScreenShare();
    
    // Stop Keep Alive
    if (this.keepAliveOscillator) {
        try { this.keepAliveOscillator.stop(); } catch (e) {}
        this.keepAliveOscillator.disconnect();
        this.keepAliveOscillator = null;
    }
    if (this.keepAliveGain) {
        this.keepAliveGain.disconnect();
        this.keepAliveGain = null;
    }

    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputAudioContext) {
      await this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      await this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    
    if (this.sessionPromise) {
        try {
            await this.sessionPromise;
        } catch(e) { /* ignore */ }
    }
    this.sessionPromise = null;
    this.ai = null;
  }
}