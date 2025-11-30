import React, { useState, useEffect, useRef } from 'react';
import { GeminiLiveService } from './services/geminiLiveService';
import { GenAiService } from './services/genAiService';
import { Visualizer } from './components/Visualizer';
import { ChatInput } from './components/ChatInput';
import { ConnectionState, Message } from './types';
import { SYSTEM_INSTRUCTION } from './constants';

const App: React.FC = () => {
  const [apiKeySet, setApiKeySet] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isProcessingText, setIsProcessingText] = useState(false);
  
  // Audio Mode State
  const [isMuted, setIsMuted] = useState(false); 

  // Initialize messages from localStorage
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('aria_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
    return [];
  });

  const [audioLevel, setAudioLevel] = useState(0);
  // Default voice set to Kore
  const [voiceName] = useState('Kore');
  
  const liveService = useRef<GeminiLiveService | null>(null);
  const chatService = useRef<GenAiService>(new GenAiService());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check for API Key on mount
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setApiKeySet(hasKey);
        } else {
          setApiKeySet(true);
        }
      } catch (e) {
        console.error("Error checking API key:", e);
        setApiKeySet(true);
      }
    };
    checkApiKey();
  }, []);

  // Sync Mic Active state with Service
  useEffect(() => {
    if (liveService.current) {
        liveService.current.setMute(isMuted);
    }
  }, [isMuted, connectionState]);

  const handleSelectKey = async () => {
    try {
      if (window.aistudio && window.aistudio.openSelectKey) {
        await window.aistudio.openSelectKey();
        setApiKeySet(true);
      }
    } catch (e) {
      console.error("Error selecting key:", e);
    }
  };

  const handleManualContinue = () => {
    setApiKeySet(true);
  };

  useEffect(() => {
    if (!apiKeySet) return;

    liveService.current = new GeminiLiveService();
    
    liveService.current.onStateChange = (state) => {
        setConnectionState(state);
        if (state === ConnectionState.DISCONNECTED) {
            setIsScreenSharing(false);
            setIsMuted(false);
        }
    };
    liveService.current.onAudioLevel = (level) => {
        // Visualizer receives 0 level if muted in service, but we double check here
        setAudioLevel(level);
    };
    
    liveService.current.onTranscription = (text, role) => {
        setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            // Increased threshold to 60s to keep bubbles together during pauses
            const isRecent = lastMsg && (new Date().getTime() - new Date(lastMsg.timestamp).getTime() < 60000);
            
            if (isRecent && lastMsg.role === role) {
                const newMsgs = [...prev];
                newMsgs[prev.length - 1] = {
                    ...lastMsg,
                    text: lastMsg.text + text,
                    timestamp: new Date()
                };
                return newMsgs;
            }
            return [...prev, {
                id: Date.now().toString(),
                role,
                text,
                timestamp: new Date()
            }];
        });
    };

    liveService.current.onError = (err) => {
        if (err.includes("mic") || err.includes("Permissão")) {
             alert(`Erro de Permissão: ${err}`);
        } else if (err.includes("credential") || err.includes("authentication")) {
             alert("Acesso Negado: Chave API inválida.");
             setApiKeySet(false);
        } else {
             alert(`Erro na Aria: ${err}`);
        }
        setIsScreenSharing(false);
    };

    return () => {
        liveService.current?.disconnect();
    };
  }, [apiKeySet]);

  useEffect(() => {
    localStorage.setItem('aria_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const toggleConnection = async () => {
    if (connectionState === ConnectionState.CONNECTING) return; 

    if (connectionState === ConnectionState.CONNECTED) {
        await liveService.current?.disconnect();
    } else {
        // Build context from history
        const historyContext = messages.length > 0 
            ? `\n\nCONTEXTO DE CONVERSAS ANTERIORES (MEMÓRIA):\n${messages.slice(-15).map(m => `${m.role === 'user' ? 'Usuário' : 'Aria'}: ${m.text}`).join('\n')}\n\n[FIM DA MEMÓRIA - Continue a conversa a partir daqui]`
            : '';
        
        const fullInstruction = `${SYSTEM_INSTRUCTION}${historyContext}`;

        await liveService.current?.connect(fullInstruction, voiceName);
    }
  };

  const toggleScreenShare = async () => {
    if (!liveService.current || connectionState !== ConnectionState.CONNECTED) {
        alert("Conecte-se à Aria primeiro.");
        return;
    }

    if (isScreenSharing) {
        liveService.current.stopScreenShare();
        setIsScreenSharing(false);
    } else {
        try {
            await liveService.current.startScreenShare();
            setIsScreenSharing(true);
        } catch (e: any) {
            console.error(e);
            setIsScreenSharing(false);
        }
    }
  };

  const handleMicClick = () => {
     if (connectionState !== ConnectionState.CONNECTED) return;
     setIsMuted(!isMuted);
  };


  const handleSendMessage = async (text: string, attachment?: { mimeType: string; data: string }) => {
    setIsProcessingText(true);
    const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        text: text || (attachment ? `[Arquivo Enviado: ${attachment.mimeType}]` : ''),
        timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
        const responseText = await chatService.current.sendMessage(messages, text, attachment);
        const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: responseText,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
        const errorMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'system',
            text: "Falha ao enviar mensagem.",
            timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
    } finally {
        setIsProcessingText(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    localStorage.removeItem('aria_messages');
  };

  const renderMessageText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline break-all">{part}</a>;
      }
      return part;
    });
  };

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  if (!apiKeySet) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl border border-slate-800 p-8 shadow-2xl text-center">
            <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">ARIA</h1>
            <p className="text-slate-400 mb-6">
                Conecte-se ao Google AI Studio (Nível Gratuito).
            </p>
            
            <button 
                onClick={handleSelectKey}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 mb-4"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Selecionar Projeto
            </button>

             <button 
                onClick={handleManualContinue}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-6 rounded-xl transition-all border border-slate-700"
            >
                Pular verificação (Estou com erro no popup)
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/30 overflow-hidden">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0 pointer-events-none" />
      
      <div className="relative z-10 container mx-auto p-4 lg:p-6 h-full flex flex-col lg:flex-row gap-4 lg:gap-6">
        
        {/* Left Column: Visualizer & Controls (Fixed width on Desktop) */}
        <div className="flex-shrink-0 h-[35%] lg:h-auto lg:w-[400px] xl:w-[420px] flex flex-col gap-4 lg:gap-6">
          
          <header className="flex items-center justify-between shrink-0">
            <div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tighter bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                ARIA <span className="hidden sm:inline text-xs font-mono text-slate-500 tracking-normal border border-slate-700 px-1 rounded ml-2">BETA 0.9</span>
                </h1>
                <p className="text-slate-400 text-xs lg:text-sm">DevOps // Marketing // English</p>
            </div>
            
            <div className="flex items-center gap-3">
                 <div className={`h-2.5 w-2.5 lg:h-3 lg:w-3 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
                 <span className="text-[10px] lg:text-xs font-mono text-slate-500 uppercase">{connectionState}</span>
            </div>
          </header>

          {/* Visualizer Card Container */}
          <div className="relative flex-1 flex flex-col min-h-0 bg-slate-900/50 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-sm overflow-hidden">
             
             {/* Indicators (Corners) */}
             <div className="absolute top-4 left-4 z-10">
                {isConnected && (
                    <div className={`px-2 py-1 lg:px-3 lg:py-1.5 rounded-full text-[10px] lg:text-xs font-bold transition-all border 
                        ${isMuted 
                            ? 'bg-yellow-500/20 border-yellow-500 text-yellow-200' 
                            : 'bg-green-500/20 border-green-500 text-green-200'
                        }`}>
                        {isMuted ? '🔇 MUDO' : '🟢 OUVINDO'}
                    </div>
                )}
             </div>

             {/* Canvas Area */}
             <div className="flex-1 min-h-0 relative w-full">
                <Visualizer isActive={isConnected && !isMuted} audioLevel={audioLevel} />
             </div>
             
             {/* Controls Bar */}
             <div className="flex-shrink-0 p-4 bg-slate-900/60 border-t border-slate-800/50 flex justify-center items-center gap-6 z-20 backdrop-blur-md">
                
                {/* Connect Button */}
                <button 
                    onClick={toggleConnection}
                    disabled={isConnecting}
                    className={`
                        p-3 lg:p-4 rounded-full transition-all duration-300 shadow-xl border-2
                        ${isConnected 
                            ? 'bg-red-500/20 border-red-500 text-red-500 hover:bg-red-500 hover:text-white' 
                            : isConnecting 
                                ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500 cursor-wait'
                                : 'bg-cyan-500/20 border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-white'}
                    `}
                    title={isConnected ? "Desconectar" : "Conectar"}
                >
                    {isConnecting ? (
                       <svg className="animate-spin h-6 w-6 lg:h-8 lg:w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                       </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 lg:h-8 lg:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    )}
                </button>

                {/* Microphone Button (Toggle) */}
                <button
                    onClick={handleMicClick}
                    disabled={!isConnected}
                    className={`
                        p-4 lg:p-5 rounded-full transition-all duration-150 shadow-xl border-2 scale-110
                        ${!isConnected 
                            ? 'opacity-30 cursor-not-allowed border-slate-700 text-slate-700' 
                            : (isMuted
                                ? 'bg-slate-800 border-yellow-500 text-yellow-500'
                                : 'bg-green-600 border-green-500 text-white shadow-green-500/30')
                        }
                    `}
                    title="Mutar/Desmutar"
                >
                     {isMuted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 lg:h-8 lg:w-8" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12.732a1 1 0 01-1.707.707L4.586 14H2a1 1 0 01-1-1V7a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                     ) : (
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 lg:h-8 lg:w-8" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                         </svg>
                     )}
                </button>

                {/* Screen Share Button */}
                <button 
                    onClick={toggleScreenShare}
                    disabled={!isConnected}
                    className={`
                        p-3 lg:p-4 rounded-full transition-all duration-300 shadow-xl border-2
                        ${!isConnected ? 'opacity-30 cursor-not-allowed border-slate-700 text-slate-700' : 
                          isScreenSharing 
                            ? 'bg-purple-500/20 border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white' 
                            : 'bg-slate-800/50 border-slate-600 text-slate-400 hover:border-purple-400 hover:text-purple-400'}
                    `}
                    title="Compartilhar Tela (Visão)"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 lg:h-6 lg:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                   </svg>
                </button>
             </div>
          </div>
        </div>

        {/* Right Column: Chat History & Input (Flexible width - Main Focus) */}
        <div className="flex-1 flex flex-col bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl min-h-0 min-w-0">
            <div className="p-3 lg:p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center shrink-0">
                <h2 className="font-semibold text-slate-200 flex items-center gap-2 text-sm lg:text-base">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Chat & Memória
                </h2>
                <button onClick={handleClearHistory} className="text-[10px] lg:text-xs text-slate-500 hover:text-white transition-colors">
                    Limpar
                </button>
            </div>
            
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 lg:p-6 space-y-6 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2 opacity-50">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 lg:h-16 lg:w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <p className="text-xs lg:text-lg">Aguardando início da conversa...</p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[90%] lg:max-w-[85%] rounded-2xl px-3 py-2 lg:px-6 lg:py-4 text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.role === 'user' 
                            ? 'bg-cyan-900/30 border border-cyan-800/50 text-cyan-100 rounded-tr-sm' 
                            : msg.role === 'system'
                            ? 'bg-red-900/20 border border-red-900/50 text-red-200 text-sm'
                            : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm'
                        }`}>
                           {renderMessageText(msg.text)}
                        </div>
                        <span className="text-[10px] lg:text-xs text-slate-600 mt-1 px-1">
                            {msg.role === 'user' ? 'Você' : 'Aria'} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                ))}
                {isProcessingText && (
                    <div className="flex items-start">
                        <div className="bg-slate-800 border border-slate-700 text-slate-400 rounded-2xl rounded-tl-sm px-4 py-2 text-sm flex gap-2 items-center">
                            <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-75" />
                            <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-150" />
                        </div>
                    </div>
                )}
            </div>
            
            {/* Input Area */}
            <ChatInput onSendMessage={handleSendMessage} disabled={isProcessingText} />
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(71, 85, 105, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.8);
        }
      `}</style>
    </div>
  );
};

export default App;