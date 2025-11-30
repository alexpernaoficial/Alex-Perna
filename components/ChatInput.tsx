import React, { useState, useRef } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string, attachment?: { mimeType: string; data: string }) => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, disabled }) => {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; mimeType: string; data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!text.trim() && !attachment) || disabled) return;

    onSendMessage(
      text, 
      attachment ? { mimeType: attachment.mimeType, data: attachment.data } : undefined
    );
    
    setText('');
    setAttachment(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = (event.target?.result as string).split(',')[1];
      setAttachment({
        name: file.name,
        mimeType: file.type,
        data: base64String
      });
    };
    reader.readAsDataURL(file);
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-3 bg-slate-950 border-t border-slate-800">
      {/* Attachment Preview */}
      {attachment && (
        <div className="mb-2 flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800 w-fit">
          <div className="bg-cyan-900/50 p-1 rounded">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
             </svg>
          </div>
          <span className="text-xs text-slate-300 truncate max-w-[150px]">{attachment.name}</span>
          <button 
            onClick={() => setAttachment(null)}
            className="text-slate-500 hover:text-red-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex gap-2 items-end">
        <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-cyan-400 transition-colors"
            title="Anexar arquivo (Imagem/PDF)"
            disabled={disabled}
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
        </button>
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            accept="image/*,application/pdf"
            className="hidden"
        />

        <div className="flex-1 relative">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={disabled ? "Aguarde..." : "Digite uma mensagem..."}
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all resize-none overflow-hidden custom-scrollbar"
                rows={1}
                style={{ minHeight: '52px', maxHeight: '140px' }}
                disabled={disabled}
            />
        </div>

        <button 
            onClick={() => handleSend()}
            disabled={(!text.trim() && !attachment) || disabled}
            className={`p-3 rounded-full transition-all ${
                (!text.trim() && !attachment) || disabled
                ? 'bg-slate-800 text-slate-600' 
                : 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-lg shadow-cyan-500/20'
            }`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transform rotate-90" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
        </button>
      </div>
    </div>
  );
};