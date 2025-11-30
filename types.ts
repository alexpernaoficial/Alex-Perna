export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
}

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AppConfig {
  voiceName: string;
  proactiveMode: boolean; // If true, app nudges user after silence
}

// Live API specific types based on provided guidelines
export interface LiveConfig {
  model: string;
  systemInstruction: string;
  voiceName: string;
}
