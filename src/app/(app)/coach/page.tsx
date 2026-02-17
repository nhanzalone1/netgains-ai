"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/components/auth-provider";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const INITIAL_GREETING: Message = {
  id: "initial-greeting",
  role: "assistant",
  content: "What's up — I'm your coach. I'm going to learn how you train, what you eat, and how you recover so I can help you get results faster than going at it alone. Let's get started. What should I call you?",
};

function getStorageKey(userId: string | undefined): string {
  return userId ? `netgains-coach-messages-${userId}` : "netgains-coach-messages";
}

function loadMessages(userId: string | undefined): Message[] {
  if (typeof window === "undefined") return [INITIAL_GREETING];
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.length > 0) return parsed;
    }
    return [INITIAL_GREETING];
  } catch {
    return [INITIAL_GREETING];
  }
}

export default function CoachPage() {
  const { user } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING]);
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const shouldScrollRef = useRef(false);

  // Track keyboard visibility via Visual Viewport API
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const onResize = () => {
      // Keyboard height = full window height - visible viewport height
      const kbHeight = window.innerHeight - viewport.height;
      setKeyboardHeight(kbHeight > 50 ? kbHeight : 0); // Only set if significant
    };

    viewport.addEventListener("resize", onResize);
    viewport.addEventListener("scroll", onResize);
    return () => {
      viewport.removeEventListener("resize", onResize);
      viewport.removeEventListener("scroll", onResize);
    };
  }, []);

  // Scroll to bottom only when a NEW message arrives, not on input focus
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    // Only scroll if message count increased (new message added)
    if (messages.length > prevMessageCountRef.current) {
      shouldScrollRef.current = true;
    }
    prevMessageCountRef.current = messages.length;

    if (shouldScrollRef.current) {
      scrollToBottom();
      shouldScrollRef.current = false;
    }
  }, [messages, scrollToBottom]);

  // Scroll when streaming completes (not during — let user read while streaming)
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    // Only scroll when streaming finishes (loading stops and we have content)
    if (!isLoading && lastMessage?.role === "assistant" && lastMessage.content) {
      scrollToBottom();
    }
  }, [isLoading, scrollToBottom]); // Intentionally not including messages to avoid scroll during stream

  // Load messages when user changes (account switch)
  useEffect(() => {
    setMessages(loadMessages(user?.id));
  }, [user?.id]);

  // Save messages to user-specific storage
  useEffect(() => {
    if (!user?.id) return;
    // Don't save empty assistant messages
    const filtered = messages.filter((m) => m.role !== "assistant" || m.content.trim() !== "");
    localStorage.setItem(getStorageKey(user.id), JSON.stringify(filtered));
  }, [messages, user?.id]);

  const sendRequest = async (allMessages: Message[]): Promise<Response> => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: allMessages
          .filter((m) => m.id !== "initial-greeting")
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
        currentWorkout: (() => {
          try {
            const stored = localStorage.getItem("netgains-current-workout");
            return stored ? JSON.parse(stored) : null;
          } catch {
            return null;
          }
        })(),
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  };

  const streamResponse = async (response: Response, assistantMessageId: string) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("0:")) {
            try {
              const text = JSON.parse(line.slice(2));
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: m.content + text }
                    : m
                )
              );
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
    };

    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setInputValue("");
    // Reset textarea height
    if (inputRef.current) {
      (inputRef.current as HTMLTextAreaElement).style.height = "auto";
    }
    setIsLoading(true);
    shouldScrollRef.current = true; // Ensure we scroll after sending

    const assistantMessageId = (Date.now() + 1).toString();

    // Add empty assistant message placeholder
    setMessages((prev) => [...prev, { id: assistantMessageId, role: "assistant", content: "" }]);

    let success = false;
    let attempts = 0;
    const maxAttempts = 2;

    while (!success && attempts < maxAttempts) {
      attempts++;
      try {
        const response = await sendRequest(allMessages);
        await streamResponse(response, assistantMessageId);
        success = true;
      } catch (error) {
        console.error(`Chat error (attempt ${attempts}):`, error);
        if (attempts < maxAttempts) {
          // Reset content for retry
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, content: "" } : m))
          );
        }
      }
    }

    // If all attempts failed, show error message
    if (!success) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: "Coach is having a moment. Try sending that again." }
            : m
        )
      );
    }

    setIsLoading(false);
  };

  const handleReset = async () => {
    if (!confirm("Reset chat and onboarding? This will wipe your coach data so you can start fresh.")) return;
    // Clear localStorage (user-specific)
    localStorage.removeItem(getStorageKey(user?.id));
    localStorage.removeItem("netgains-current-workout");
    // Reset onboarding and memories via API
    try {
      await fetch("/api/coach-reset", { method: "POST" });
    } catch (e) {
      console.error("Reset API error:", e);
    }
    // Reset local state
    setMessages([INITIAL_GREETING]);
    setInputValue("");
  };

  return (
    <div className="flex flex-col h-[100dvh]" style={{ background: "#0f0f13" }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255, 71, 87, 0.15)" }}
          >
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Coach</h1>
            <p className="text-xs text-muted-foreground">Your AI Training Partner</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="p-2 rounded-lg text-muted-foreground hover:text-white transition-colors"
            title="Reset chat"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <UserMenu />
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain"
        style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 80 : 128 }}
      >
        {messages.filter((m) => m.role !== "assistant" || m.content.trim() !== "").map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : ""
              }`}
              style={
                message.role === "assistant"
                  ? { background: "#1a1a24" }
                  : undefined
              }
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ background: "#1a1a24" }}
            >
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-sm text-muted-foreground">Coach is thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Area — repositions when keyboard is open */}
      <div
        className="fixed left-0 right-0 z-40 p-4 border-t border-white/5 transition-[bottom] duration-100"
        style={{
          background: "#0f0f13",
          bottom: keyboardHeight > 0 ? keyboardHeight : 96, // 96px = bottom nav height
          paddingBottom: keyboardHeight > 0 ? 8 : "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-lg mx-auto items-end">
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              // Auto-expand textarea
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
            }}
            onFocus={() => {
              // Prevent mobile browser from auto-scrolling on focus
              // Save scroll position and restore it multiple times to catch delayed browser scroll
              const container = messagesContainerRef.current;
              if (container) {
                const scrollPos = container.scrollTop;
                const restore = () => { container.scrollTop = scrollPos; };
                requestAnimationFrame(restore);
                setTimeout(restore, 0);
                setTimeout(restore, 50);
                setTimeout(restore, 100);
                setTimeout(restore, 150);
              }
            }}
            onKeyDown={(e) => {
              // Submit on Enter (without Shift)
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Message your coach..."
            rows={1}
            className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px] max-h-[150px] resize-none overflow-y-auto"
            style={{ background: "#1a1a24" }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
