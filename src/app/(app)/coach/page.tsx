"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/components/auth-provider";
import { DailyBriefCard } from "@/components/daily-brief-card";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  hidden?: boolean; // Hidden messages are used as triggers but not shown in UI
}

// Hidden trigger message prefix - messages starting with this won't be shown
const TRIGGER_PREFIX = "[SYSTEM_TRIGGER]";

function getStorageKey(userId: string | undefined): string {
  return userId ? `netgains-coach-messages-${userId}` : "netgains-coach-messages";
}

function getLastOpenKey(userId: string | undefined): string {
  return userId ? `netgains-coach-last-open-${userId}` : "netgains-coach-last-open";
}

function loadMessages(userId: string | undefined): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.length > 0) return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

function getDebugDate(): Date {
  if (typeof window === "undefined") return new Date();
  const override = localStorage.getItem("netgains-debug-date-override");
  if (override) {
    // Parse YYYY-MM-DD format and create date at noon to avoid timezone issues
    const parsed = new Date(override + "T12:00:00");
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayString(): string {
  return getDebugDate().toDateString();
}

function formatDebugDate(): string {
  const date = getDebugDate();
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function getMessageDate(messageId: string): string | null {
  const timestamp = parseInt(messageId);
  if (isNaN(timestamp)) return null;
  return new Date(timestamp).toDateString();
}

// Get timestamp for new messages - uses debug date if set
function getMessageTimestamp(): number {
  const debugDate = getDebugDate();
  const now = new Date();
  // Use debug date but with current time of day
  debugDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return debugDate.getTime();
}

function formatDateDivider(dateString: string): string {
  const date = new Date(dateString);
  const today = getDebugDate();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
}

function shouldGenerateOpening(userId: string | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;

  const messages = loadMessages(userId);
  const lastOpenStr = localStorage.getItem(getLastOpenKey(userId));
  const today = getTodayString();

  // Filter out hidden trigger messages for counting visible messages
  const visibleMessages = messages.filter(m => !m.hidden && !m.content.startsWith(TRIGGER_PREFIX));

  // Check if we have ANY messages (including hidden triggers) - means we started an opening
  const hasAnyMessages = messages.length > 0;

  // If we already opened today AND have any messages, don't regenerate
  // This prevents duplicate openings when switching tabs mid-stream
  if (lastOpenStr === today && hasAnyMessages) {
    return false;
  }

  // If no visible messages and either new day or no messages at all, generate opening
  if (visibleMessages.length === 0) {
    return true;
  }

  // Check if last visible message was from "today" - if so, no need for new opening
  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];
  if (lastVisibleMessage) {
    const msgTimestamp = parseInt(lastVisibleMessage.id);
    if (!isNaN(msgTimestamp)) {
      const msgDate = new Date(msgTimestamp).toDateString();
      if (msgDate === today) {
        return false;
      }
    }
  }

  // Generate opening for new day
  console.log("→ RESULT: true (new day!)");
  return true;
}

export default function CoachPage() {
  const { user } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const hasGeneratedOpeningRef = useRef(false);
  const readyToSaveRef = useRef(false); // Only save after load effect completes AND state is applied

  // Check if user is near the bottom of the scroll area
  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 150; // pixels from bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Smooth scroll to bottom, only if user is already near bottom
  const scrollToBottom = useCallback((force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (force || isNearBottom()) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [isNearBottom]);

  // Detect mobile vs desktop
  useEffect(() => {
    const checkMobile = () => {
      // Check for touch capability and screen width
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isNarrow = window.innerWidth < 768;
      setIsMobile(hasTouch && isNarrow);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // iOS keyboard handling using Visual Viewport API
  // When keyboard opens, we set container height to viewport height so input sits above keyboard
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let initialHeight = window.innerHeight;

    const updateViewport = () => {
      if (!viewport) return;

      const currentHeight = viewport.height;
      const heightDiff = initialHeight - currentHeight;

      // Keyboard is open if viewport shrunk significantly (>150px for iOS bars)
      const isOpen = heightDiff > 150;
      setKeyboardOpen(isOpen);

      if (isOpen) {
        // Set container height to visual viewport height so input is above keyboard
        setViewportHeight(currentHeight);
        // Scroll to bottom when keyboard opens
        setTimeout(() => scrollToBottom(true), 50);
      } else {
        // Reset to null - will use bottom spacing instead
        setViewportHeight(null);
      }

      // Keep the page scrolled to top to prevent iOS from pushing it up
      if (isOpen && pageRef.current) {
        window.scrollTo(0, 0);
      }
    };

    const onOrientationChange = () => {
      setTimeout(() => {
        initialHeight = window.innerHeight;
        updateViewport();
      }, 300);
    };

    updateViewport();

    viewport.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      viewport.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", onOrientationChange);
    };
  }, [scrollToBottom]);

  // Track if we just sent a user message (to force scroll for their own messages)
  const justSentMessageRef = useRef(false);

  useEffect(() => {
    // Only scroll if message count increased
    if (messages.length > prevMessageCountRef.current) {
      const lastMessage = messages[messages.length - 1];

      // Always scroll when user sends their own message
      if (lastMessage?.role === "user" && !lastMessage.hidden) {
        justSentMessageRef.current = true;
        scrollToBottom(true);
      } else if (justSentMessageRef.current) {
        // Scroll for the assistant placeholder after user message
        scrollToBottom(true);
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, scrollToBottom]);

  // Scroll during streaming only if user is near bottom (don't interrupt reading)
  const lastContentLengthRef = useRef(0);
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.content) {
      // Check if content grew (streaming)
      if (lastMessage.content.length > lastContentLengthRef.current) {
        lastContentLengthRef.current = lastMessage.content.length;
        // Only auto-scroll during stream if near bottom
        if (isNearBottom()) {
          scrollToBottom();
        }
      }
    }

    // Reset when streaming completes
    if (!isLoading) {
      justSentMessageRef.current = false;
      lastContentLengthRef.current = 0;
    }
  }, [messages, isLoading, scrollToBottom, isNearBottom]);

  // Track current request so we can abort it if needed
  const abortControllerRef = useRef<AbortController | null>(null);

  // Send a request to the chat API
  const sendRequest = useCallback(async (allMessages: Message[], signal?: AbortSignal): Promise<Response> => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: allMessages.map((m) => ({
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
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  }, []);

  // Stream response from the API into a message
  const streamResponse = useCallback(async (response: Response, assistantMessageId: string) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      try {
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
      } catch (error) {
        // Ignore abort errors, they're expected
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error("Stream reading error:", error);
        throw error;
      }
    }
  }, []);

  // Generate auto-opening message from coach using hidden trigger
  const generateAutoOpening = useCallback(async () => {
    if (!user?.id) return;

    console.log(">>> generateAutoOpening called <<<");

    // Abort any existing request before starting a new one
    if (abortControllerRef.current) {
      console.log(">>> Aborting previous request <<<");
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Update both state and ref synchronously to prevent race conditions
    setIsLoading(true);
    isLoadingRef.current = true;

    // Create hidden trigger message - this won't be shown in UI but will be sent to API
    // Include the effective date so the API can calculate "yesterday" correctly
    const triggerMessageId = getMessageTimestamp().toString();
    const effectiveDate = formatLocalDate(getDebugDate()); // YYYY-MM-DD format using local time
    const triggerContent = `${TRIGGER_PREFIX} effectiveDate=${effectiveDate} User opened the coach tab on ${formatDebugDate()}. Generate a contextual daily greeting based on their profile, memories, and recent workout history. If they haven't completed onboarding, start that process. Otherwise, give them a personalized check-in based on their training status.`;

    const triggerMessage: Message = {
      id: triggerMessageId,
      role: "user",
      content: triggerContent,
      hidden: true,
    };

    // Create placeholder for assistant's response
    const assistantMessageId = (getMessageTimestamp() + 1).toString();
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
    };

    // Add both to messages state
    setMessages((prev) => [...prev, triggerMessage, assistantPlaceholder]);

    try {
      // Send the trigger through normal chat flow
      const response = await sendRequest([triggerMessage], abortController.signal);
      await streamResponse(response, assistantMessageId);
      console.log(">>> Auto-opening streamed successfully <<<");
    } catch (error) {
      // Ignore abort errors - they're expected when we cancel requests
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(">>> Request aborted (expected) <<<");
        // Still need to reset loading state
        setIsLoading(false);
        isLoadingRef.current = false;
        return;
      }
      console.error("Auto-open error:", error);
      // Fallback to simple greeting
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: "hey, i'm your coach. what should i call you?" }
            : m
        )
      );
    }

    setIsLoading(false);
    isLoadingRef.current = false;
  }, [user?.id, sendRequest, streamResponse]);

  // Track which date we last generated an opening for
  const lastGeneratedDateRef = useRef<string | null>(null);

  // Check and potentially generate opening message
  const checkAndGenerateOpening = useCallback(() => {
    if (!user?.id) return;

    const today = getTodayString();
    console.log("=== checkAndGenerateOpening ===");
    console.log("Today (effective):", today);
    console.log("lastGeneratedDateRef:", lastGeneratedDateRef.current);
    console.log("hasGeneratedOpeningRef:", hasGeneratedOpeningRef.current);

    // Reset the generation flag if it's a new day
    if (lastGeneratedDateRef.current !== today) {
      console.log("New day detected, resetting hasGeneratedOpeningRef");
      hasGeneratedOpeningRef.current = false;
    }

    const shouldGenerate = shouldGenerateOpening(user.id);
    console.log("shouldGenerateOpening returned:", shouldGenerate);
    console.log("Will generate?", shouldGenerate && !hasGeneratedOpeningRef.current);

    // Check if we should generate an auto-opening message
    if (shouldGenerate && !hasGeneratedOpeningRef.current) {
      console.log(">>> GENERATING AUTO OPENING <<<");
      hasGeneratedOpeningRef.current = true;
      lastGeneratedDateRef.current = today;
      generateAutoOpening();
    }

    // Mark today as opened (uses debug date if set)
    localStorage.setItem(getLastOpenKey(user.id), today);
  }, [user?.id, generateAutoOpening]);

  // Track the debug date we last checked for
  const lastCheckedDateRef = useRef<string | null>(null);

  // Load messages on mount
  useEffect(() => {
    if (!user?.id) return;
    const existingMessages = loadMessages(user.id);
    setMessages(existingMessages);
    // Enable saving AFTER this effect cycle completes and state is applied
    // Using setTimeout(0) pushes this to after React has flushed state updates
    setTimeout(() => {
      readyToSaveRef.current = true;
    }, 0);
    checkAndGenerateOpening();
  }, [user?.id, checkAndGenerateOpening]);

  // Cleanup: abort any pending request when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Track if we're currently streaming to avoid interruption
  const isLoadingRef = useRef(isLoading);
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Also check on every render if the debug date has changed
  // This catches in-app navigation where other hooks might not fire
  useEffect(() => {
    if (!user?.id) return;
    // Don't interrupt an active stream
    if (isLoadingRef.current) return;
    const currentDate = getTodayString();
    if (lastCheckedDateRef.current !== currentDate) {
      console.log("=== Date changed since last check, re-checking opening ===");
      console.log("Previous date:", lastCheckedDateRef.current);
      console.log("Current date:", currentDate);
      lastCheckedDateRef.current = currentDate;
      checkAndGenerateOpening();
    }
  }); // No deps - runs on every render

  // Re-check when page becomes visible or gains focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("=== Page became visible, re-checking opening ===");
        // Don't do anything if we're currently streaming - it would interrupt the response
        if (isLoadingRef.current) return;
        if (user?.id) {
          const existingMessages = loadMessages(user.id);
          setMessages(existingMessages);
        }
        checkAndGenerateOpening();
      }
    };

    const handleFocus = () => {
      console.log("=== Window focused, re-checking opening ===");
      // Don't do anything if we're currently streaming - it would interrupt the response
      if (isLoadingRef.current) return;
      if (user?.id) {
        const existingMessages = loadMessages(user.id);
        setMessages(existingMessages);
      }
      checkAndGenerateOpening();
    };

    // pageshow fires when navigating back to a page (including bfcache)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        console.log("=== Page restored from cache, re-checking opening ===");
        // Don't do anything if we're currently streaming - it would interrupt the response
        if (isLoadingRef.current) return;
        if (user?.id) {
          const existingMessages = loadMessages(user.id);
          setMessages(existingMessages);
        }
        checkAndGenerateOpening();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [user?.id, checkAndGenerateOpening]);

  // Save messages to user-specific storage
  useEffect(() => {
    if (!user?.id) return;
    // Don't save until load effect has completed AND state has been applied
    // This prevents the save effect from running with empty [] and wiping localStorage
    if (!readyToSaveRef.current) return;
    // Don't save empty assistant messages
    const filtered = messages.filter((m) => m.role !== "assistant" || m.content.trim() !== "");
    localStorage.setItem(getStorageKey(user.id), JSON.stringify(filtered));
  }, [messages, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: getMessageTimestamp().toString(),
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
    isLoadingRef.current = true;

    const assistantMessageId = (getMessageTimestamp() + 1).toString();

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
    isLoadingRef.current = false;
  };

  // Soft reset: clears chat and triggers fresh daily greeting (keeps onboarding/memories)
  const handleRefresh = () => {
    // Clear chat messages from localStorage
    localStorage.removeItem(getStorageKey(user?.id));
    localStorage.removeItem(getLastOpenKey(user?.id));

    // Reset local state
    setMessages([]);
    setInputValue("");
    hasGeneratedOpeningRef.current = false;
    lastGeneratedDateRef.current = null;
    lastCheckedDateRef.current = null;

    // Trigger fresh daily greeting
    setTimeout(() => {
      generateAutoOpening();
    }, 100);
  };

  // Hard reset: wipes everything including onboarding and memories (accessed via debug)
  const handleFullReset = async () => {
    if (!confirm("Reset chat and onboarding? This will wipe your coach data so you can start fresh.")) return;
    // Clear localStorage (user-specific)
    localStorage.removeItem(getStorageKey(user?.id));
    localStorage.removeItem(getLastOpenKey(user?.id));
    localStorage.removeItem("netgains-current-workout");
    // Reset onboarding and memories via API
    try {
      await fetch("/api/coach-reset", { method: "POST" });
    } catch (e) {
      console.error("Reset API error:", e);
    }
    // Reset local state and regenerate opening
    setMessages([]);
    setInputValue("");
    hasGeneratedOpeningRef.current = false;
    lastGeneratedDateRef.current = null;
    lastCheckedDateRef.current = null;
    // Trigger new opening after reset
    setTimeout(() => {
      generateAutoOpening();
    }, 100);
  };

  // Filter out hidden messages and empty assistant messages for display
  const visibleMessages = messages.filter(
    (m) => !m.hidden && !m.content.startsWith(TRIGGER_PREFIX) && (m.role !== "assistant" || m.content.trim() !== "")
  );

  // Group messages by date for rendering with dividers
  const messagesWithDividers: Array<{ type: 'divider'; date: string } | { type: 'message'; message: Message }> = [];
  let lastDate: string | null = null;

  for (const message of visibleMessages) {
    const messageDate = getMessageDate(message.id);
    if (messageDate && messageDate !== lastDate) {
      messagesWithDividers.push({ type: 'divider', date: messageDate });
      lastDate = messageDate;
    }
    messagesWithDividers.push({ type: 'message', message });
  }

  return (
    <div
      ref={pageRef}
      className="flex flex-col fixed left-0 right-0 z-40"
      style={{
        background: "#0f0f13",
        top: 0,
        // When keyboard is open, use viewport height so input sits above keyboard
        // When closed, leave space for nav bar (more on desktop, less on mobile)
        ...(keyboardOpen && viewportHeight
          ? { height: viewportHeight }
          : { bottom: isMobile ? 120 : 150 }
        ),
        // Always prevent page scroll - only messages should scroll
        overflow: 'hidden',
      }}
    >
      {/* Header - hide when keyboard is open to maximize space */}
      {!keyboardOpen && (
        <div
          className="flex-shrink-0 flex items-center justify-between p-4 border-b border-white/5"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", background: "#0f0f13" }}
        >
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
              onClick={handleRefresh}
              className="p-3 rounded-lg text-muted-foreground hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Refresh conversation"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <UserMenu />
          </div>
        </div>
      )}

      {/* Daily Brief Card - hide when keyboard is open */}
      {!keyboardOpen && (
        <div className="flex-shrink-0 pb-2" style={{ background: "#0f0f13" }}>
          <DailyBriefCard />
        </div>
      )}

      {/* Messages Area - takes remaining space, hidden scrollbar */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scrollbar-hide"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
        }}
      >
        {messagesWithDividers.map((item) => {
          if (item.type === 'divider') {
            return (
              <div key={`divider-${item.date}`} className="flex flex-col items-center py-4">
                <span className="text-xs text-muted-foreground font-medium mb-2">
                  {formatDateDivider(item.date)}
                </span>
                <div className="w-full border-t border-dashed border-white/20" />
              </div>
            );
          }

          const message = item.message;
          return (
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
                {message.role === "assistant" ? (
                  <div className="text-sm prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
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

      {/* Input Area - at bottom of flex container, above nav bar */}
      <div
        className="flex-shrink-0 p-4 border-t border-white/5"
        style={{
          background: "#0f0f13",
          paddingBottom: keyboardOpen ? 8 : "env(safe-area-inset-bottom, 8px)",
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
              // Scroll to bottom when input is focused (keyboard opening)
              setTimeout(() => scrollToBottom(true), 100);
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
