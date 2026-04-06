import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { MessageSquare, X, Send, Loader2, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { MarkdownViewer } from './MarkdownViewer';
import { CopyButton } from './CopyButton';
import Logo from './Logo';
import type { ChatMessage } from '../store/useTabStore';
import { theme as T } from '../lib/theme';

const API_URL = 'https://sourcemind.onrender.com/api';

const SUGGESTED_QUESTIONS = [
  "Explain project architecture",
  "What dependencies are used",
  "How do I run this project"
];

interface ChatProps {
  repoId: string;
  repoName: string;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export default function Chat({
  repoId,
  repoName,
  messages,
  onMessagesChange,
  isOpen,
  onOpenChange,
  isExpanded,
  onExpandedChange,
}: ChatProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, isExpanded, loading]);

  const handleSend = async (e?: React.FormEvent, predefinedMessage?: string) => {
    if (e) e.preventDefault();
    const query = predefinedMessage || input.trim();
    if (!query || loading) return;

    setInput('');
    const newMessages = [...messages, { role: 'user' as const, content: query }];
    onMessagesChange(newMessages);
    setLoading(true);

    try {
      const { data } = await axios.post(`${API_URL}/chat`, { repoId, message: query }, {
        timeout: 30000, // 30s timeout for chat
      });
      onMessagesChange([...newMessages, { role: 'assistant' as const, content: data.reply }]);
    } catch (error: any) {
      let errorMsg = 'Sorry, I encountered an error processing your question. Please try again.';
      
      const status = error?.response?.status;
      if (status === 429) {
        errorMsg = 'AI is temporarily busy due to rate limiting. Please wait a moment and try again.';
      } else if (status === 503 || status === 504) {
        errorMsg = 'The AI service is temporarily unavailable. Please try again in a few seconds.';
      } else if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        errorMsg = 'The request timed out. Please try again with a shorter question.';
      } else if (status === 500) {
        errorMsg = 'A server error occurred. Please try again.';
      }
      
      onMessagesChange([...newMessages, { role: 'assistant' as const, content: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    const initialMessage: ChatMessage = {
      role: 'assistant',
      content: `Hello! I have analyzed **${repoName}**. Ask me anything about its architecture, code, or dependencies.`,
    };
    onMessagesChange([initialMessage]);
  };

  /* ─── FAB Button ─── */
  if (!isOpen) {
    return createPortal(
      <button 
        onClick={() => onOpenChange(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full flex items-center justify-center z-[9999] transition-all duration-200 ease-out hover:scale-105 shadow-lg"
        style={{
          background: T.card,
          color: T.text,
          border: '1px solid rgba(255,255,255,0.08)'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#181818'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = T.card; }}
      >
        <Logo size={24} color="#FFFFFF" />
      </button>,
      document.body
    );
  }

  /* ─── Icon Button ─── */
  const IconBtn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      title={title}
      className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors duration-200"
      style={{ color: 'rgba(255,255,255,0.8)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );

  return createPortal(
    <div
      className={cn(
        "fixed right-6 bottom-6 rounded-2xl flex flex-col overflow-hidden z-[9999] transition-all duration-300 ease-in-out border border-white/5 backdrop-blur-sm shadow-lg shadow-black/50",
        isExpanded ? "w-[40rem] h-[80vh] sm:w-[50rem] sm:h-[90vh]" : "w-96 h-[32rem]"
      )}
      style={{
        background: 'rgba(20, 20, 20, 0.95)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-border/50"
        style={{ background: 'transparent' }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-white" />
          <h3 className="font-semibold text-white text-sm">{repoName} Assistant</h3>
        </div>
        <div className="flex items-center gap-0.5">
          <IconBtn onClick={clearChat} title="Clear Chat">
            <Trash2 className="w-4 h-4" />
          </IconBtn>
          <IconBtn onClick={() => onExpandedChange(!isExpanded)} title={isExpanded ? "Minimize" : "Maximize"}>
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </IconBtn>
          <IconBtn onClick={() => onOpenChange(false)} title="Close">
            <X className="w-5 h-5" />
          </IconBtn>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ background: T.bgSec }}
      >
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex w-full group", msg.role === 'user' ? "justify-end" : "justify-start")}>
            <div
              className="rounded-2xl px-4 py-3 relative overflow-hidden"
              style={
                msg.role === 'user'
                  ? {
                      background: '#FFFFFF',
                      color: '#0A0A0A',
                      borderTopRightRadius: 4,
                      maxWidth: '85%',
                    }
                  : {
                      background: 'transparent',
                      color: T.text,
                      border: `1px solid ${T.border}`,
                      borderTopLeftRadius: 4,
                      width: '100%',
                      maxWidth: '90%',
                    }
              }
            >
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <div className="relative">
                  <div
                    className="absolute right-0 -top-2 opacity-0 group-hover:opacity-100 transition-opacity rounded z-10"
                    style={{ background: 'rgba(22,43,74,0.8)' }}
                  >
                    <CopyButton text={msg.content} />
                  </div>
                  <MarkdownViewer content={msg.content} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderTopLeftRadius: 4,
              }}
            >
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: T.accent }} />
              <span className="text-sm" style={{ color: T.muted }}>Thinking...</span>
            </div>
          </div>
        )}
        
        {/* Suggested Questions */}
        {!loading && messages.length === 1 && (
          <div className="flex flex-col gap-2 mt-4 pt-4">
             <p className="text-xs font-semibold uppercase tracking-wider pl-1" style={{ color: T.muted }}>Suggested questions:</p>
             <div className="flex flex-wrap gap-2">
               {SUGGESTED_QUESTIONS.map(q => (
                 <button 
                   key={q} 
                   onClick={() => handleSend(undefined, q)}
                   className="text-xs px-3 py-1.5 rounded-full text-left transition-colors duration-200"
                   style={{
                     color: T.text,
                     background: T.card,
                     border: `1px solid ${T.border}`,
                   }}
                   onMouseEnter={(e) => {
                     e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                     e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                     e.currentTarget.style.color = '#FFFFFF';
                   }}
                   onMouseLeave={(e) => {
                     e.currentTarget.style.background = T.card;
                     e.currentTarget.style.borderColor = T.border;
                     e.currentTarget.style.color = T.text;
                   }}
                 >
                   {q}
                 </button>
               ))}
             </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="p-3 shrink-0" style={{ background: T.card, borderTop: `1px solid ${T.border}` }}>
        <form onSubmit={handleSend} className="flex items-center gap-2 relative">
          <input 
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the codebase..."
            className="flex-1 h-11 rounded-full pl-4 pr-12 text-sm outline-none transition-all duration-200"
            style={{
              background: T.bgSec,
              border: `1px solid ${T.border}`,
              color: T.text,
            }}
            onFocus={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onBlur={(e) => { e.target.style.borderColor = T.border; }}
          />
          <button 
            type="submit" 
            disabled={!input.trim() || loading}
            className="absolute right-1 top-1 h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-40 active:scale-95"
            style={{
              background: '#FFFFFF',
              color: '#0A0A0A',
            }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#E5E5E5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
          >
            <Send className="w-4 h-4 ml-0.5 mt-0.5" />
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
