"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/components/auth-provider";
import { DailyBriefCard } from "@/components/daily-brief-card";
import { CoachOnboarding } from "@/components/coach-onboarding";
import { createClient } from "@/lib/supabase/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  hidden?: boolean; // Hidden messages are used as triggers but not shown in UI
  created_at?: string; // ISO timestamp for date grouping
}

// Hidden trigger message prefix - messages starting with this won't be shown
const TRIGGER_PREFIX = "[SYSTEM_TRIGGER]";

// Supabase client instance
const supabase = createClient();

function getLastOpenKey(userId: string | undefined): string {
  return userId ? `netgains-coach-last-open-${userId}` : "netgains-coach-last-open";
}

// Load messages from database
async function loadMessagesFromDB(userId: string): Promise<Message[]> {
  console.log('[DB] Loading messages for user:', userId);

  // First check if we're authenticated
  const { data: { user: authUser } } = await supabase.auth.getUser();
  console.log('[DB] Auth user:', authUser?.id);

  if (!authUser) {
    console.error('[DB] Not authenticated!');
    return [];
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, hidden, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] Error loading messages:', error.message, error.code, error.details);
    return [];
  }

  console.log('[DB] Loaded', data?.length || 0, 'messages');
  return (data || []).map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    hidden: msg.hidden || false,
    created_at: msg.created_at,
  }));
}

// Save a single message to database
async function saveMessageToDB(userId: string, message: Message): Promise<string | null> {
  console.log('[DB] Attempting to save message:', { userId, role: message.role, contentLength: message.content.length });

  // Verify auth state
  const { data: { user: authUser } } = await supabase.auth.getUser();
  console.log('[DB] Auth check - userId param:', userId, 'auth.uid:', authUser?.id);

  if (!authUser || authUser.id !== userId) {
    console.error('[DB] Auth mismatch! userId:', userId, 'authUser:', authUser?.id);
    return null;
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      role: message.role,
      content: message.content,
      hidden: message.hidden || false,
    })
    .select('id, created_at')
    .single();

  if (error) {
    console.error('[DB] Error saving message:', error.message, error.code, error.details, error.hint);
    return null;
  }

  console.log('[DB] Message saved successfully:', data?.id);
  return data?.id || null;
}

// Update a message in database (for streaming assistant responses)
async function updateMessageInDB(messageId: string, content: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .update({ content })
    .eq('id', messageId);

  if (error) {
    console.error('Error updating message:', error);
  }
}

// Delete all messages for a user
async function clearMessagesFromDB(userId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('Error clearing messages:', error);
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

function getMessageDate(message: Message): string {
  const today = getDebugDate().toDateString();

  // Try created_at first
  if (message.created_at) {
    const date = new Date(message.created_at);
    // Validate the date is reasonable (after year 2020)
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2020) {
      return date.toDateString();
    }
  }

  // Fallback for old messages with timestamp IDs
  const timestamp = parseInt(message.id);
  if (!isNaN(timestamp) && timestamp > 1577836800000) { // After Jan 1, 2020
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toDateString();
    }
  }

  // Default to today if no valid date found
  return today;
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

  // Validate date is reasonable (after year 2020) to catch epoch/invalid dates
  if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
    return "Today";
  }

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
}

function shouldGenerateOpening(messages: Message[], userId: string | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;

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
    const messageDate = getMessageDate(lastVisibleMessage);
    if (messageDate === today) {
      return false;
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
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null); // null = loading
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const hasGeneratedOpeningRef = useRef(false);
  const hasLoadedFromDBRef = useRef(false); // Track if we've loaded from DB this session
  const isAutoOpeningRef = useRef(false); // Track if auto-opening is in progress (blocks DB reload)

  // Timeout refs for cleanup (prevent memory leaks)
  const keyboardScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const orientationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const focusScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Check onboarding status on mount
  useEffect(() => {
    if (!user?.id) return;

    const checkOnboarding = async () => {
      console.log('[Coach] Checking onboarding for user:', user.id);

      // Check if supabase has auth session
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[Coach] Auth session:', sessionData?.session?.user?.id ?? 'NO SESSION');

      // Try without .single() first to see what rows exist
      const { data: allRows, error: allError } = await supabase
        .from('profiles')
        .select('id, onboarding_complete')
        .eq('id', user.id);

      console.log('[Coach] All matching rows:', allRows, 'Error:', allError?.code);

      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('id', user.id)
        .single();

      console.log('[Coach] Onboarding check result:', { data, error: error?.code });

      if (error) {
        console.error('[Coach] Error checking onboarding:', error.code, error.message, error.details);
        // PGRST116 = no rows returned, which means profile doesn't exist yet
        // In either case, show onboarding
        setOnboardingComplete(false);
        return;
      }

      setOnboardingComplete(data?.onboarding_complete ?? false);
    };

    checkOnboarding();
  }, [user?.id]);

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    setOnboardingComplete(true);
    // Clear any existing messages - user just saw closing message in onboarding UI
    setMessages([]);
    lastSavedContentRef.current.clear();
    // Mark today as opened so we don't generate another greeting
    // The onboarding closing message already told them what to do
    hasGeneratedOpeningRef.current = true;
    const today = new Date().toDateString();
    localStorage.setItem(getLastOpenKey(user?.id), today);
  };

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
        // Scroll to bottom when keyboard opens (clear previous timeout first)
        if (keyboardScrollTimeoutRef.current) {
          clearTimeout(keyboardScrollTimeoutRef.current);
        }
        keyboardScrollTimeoutRef.current = setTimeout(() => scrollToBottom(true), 50);
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
      if (orientationTimeoutRef.current) {
        clearTimeout(orientationTimeoutRef.current);
      }
      orientationTimeoutRef.current = setTimeout(() => {
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
      // Clear any pending timeouts
      if (keyboardScrollTimeoutRef.current) {
        clearTimeout(keyboardScrollTimeoutRef.current);
      }
      if (orientationTimeoutRef.current) {
        clearTimeout(orientationTimeoutRef.current);
      }
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
        localDate: formatLocalDate(new Date()), // Client's local date for timezone-aware queries
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

    // Mark that auto-opening is in progress - blocks DB reload during this time
    isAutoOpeningRef.current = true;

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
        isAutoOpeningRef.current = false;
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

    // Keep auto-opening flag set briefly to let the save effect run before allowing DB reload
    // This prevents visibility change from overwriting streamed content with empty DB
    setTimeout(() => {
      isAutoOpeningRef.current = false;
      console.log(">>> Auto-opening complete, DB reload unblocked <<<");
    }, 500);
  }, [user?.id, sendRequest, streamResponse]);

  // Track which date we last generated an opening for
  const lastGeneratedDateRef = useRef<string | null>(null);

  // Check and potentially generate opening message
  const checkAndGenerateOpening = useCallback((currentMessages: Message[]) => {
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

    const shouldGenerate = shouldGenerateOpening(currentMessages, user.id);
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

  // Load messages from database on mount
  useEffect(() => {
    if (!user?.id) return;
    if (!onboardingComplete) return; // Don't load messages until onboarding is done

    const loadMessages = async () => {
      console.log(">>> Loading messages from DB <<<");
      const dbMessages = await loadMessagesFromDB(user.id);
      console.log(">>> Loaded", dbMessages.length, "messages from DB <<<");

      // Initialize tracking refs with loaded messages so save effect doesn't re-save them
      lastSavedContentRef.current.clear();
      for (const msg of dbMessages) {
        lastSavedContentRef.current.set(msg.id, msg.content);
      }

      setMessages(dbMessages);
      setMessagesLoaded(true);

      // Check if we should generate an opening
      const today = getTodayString();
      const lastOpenStr = localStorage.getItem(getLastOpenKey(user.id));

      // If we have ANY messages, just show them - don't generate new opening
      // This ensures messages persist across tab switches
      if (dbMessages.length > 0) {
        console.log(">>> Messages exist in DB, showing them <<<");
        // Update localStorage to mark today as opened if we have messages from today
        const lastMessage = dbMessages[dbMessages.length - 1];
        const lastMessageDate = getMessageDate(lastMessage);
        if (lastMessageDate === today) {
          localStorage.setItem(getLastOpenKey(user.id), today);
        }
        return;
      }

      // No messages at all - check if we already generated today via localStorage
      if (lastOpenStr === today) {
        console.log(">>> Already opened today per localStorage, skipping <<<");
        return;
      }

      // No messages and haven't opened today - generate opening
      console.log(">>> No messages, generating opening <<<");
      localStorage.setItem(getLastOpenKey(user.id), today);
      generateAutoOpening();
    };

    loadMessages();
  }, [user?.id, generateAutoOpening, onboardingComplete]);

  // Cleanup: abort any pending request when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup abort controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Cleanup all pending timeouts to prevent memory leaks
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
      if (focusScrollTimeoutRef.current) {
        clearTimeout(focusScrollTimeoutRef.current);
      }
    };
  }, []);

  // Track if we're currently streaming to avoid interruption
  const isLoadingRef = useRef(isLoading);
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Reload messages when page becomes visible (for cross-device sync)
  useEffect(() => {
    const reloadMessages = async () => {
      if (!user?.id) return;
      // Don't reload if currently streaming
      if (isLoadingRef.current) return;
      // Don't reload during auto-opening - let streamed content stay in state
      if (isAutoOpeningRef.current) {
        console.log(">>> Skipping DB reload - auto-opening in progress <<<");
        return;
      }

      console.log(">>> Reloading messages from DB <<<");
      const dbMessages = await loadMessagesFromDB(user.id);

      // Update tracking refs with loaded messages
      for (const msg of dbMessages) {
        if (!lastSavedContentRef.current.has(msg.id)) {
          lastSavedContentRef.current.set(msg.id, msg.content);
        }
      }

      setMessages(dbMessages);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reloadMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user?.id]);

  // Track messages that need to be saved to DB
  const pendingSaveRef = useRef<Set<string>>(new Set());
  const lastSavedContentRef = useRef<Map<string, string>>(new Map());

  // Save new messages to database when they're added or updated
  useEffect(() => {
    if (!user?.id || !messagesLoaded) return;

    const saveNewMessages = async () => {
      for (const message of messages) {
        // Skip empty assistant messages (still streaming)
        if (message.role === "assistant" && !message.content.trim()) continue;

        // Check if this message needs to be saved (new or updated)
        const lastSaved = lastSavedContentRef.current.get(message.id);

        if (lastSaved === undefined) {
          // New message - save to DB
          console.log(">>> Saving new message to DB:", message.id, message.role);
          const dbId = await saveMessageToDB(user.id, message);
          console.log(">>> Saved, got DB ID:", dbId);
          if (dbId) {
            // Track both IDs to prevent double-save
            // Don't change message ID in state - it causes UI issues during streaming
            lastSavedContentRef.current.set(dbId, message.content);
            lastSavedContentRef.current.set(message.id, message.content);
          } else {
            console.error(">>> Failed to save message to DB");
          }
        } else if (lastSaved !== message.content && message.content.trim()) {
          // Content changed - update in DB
          console.log(">>> Updating message in DB:", message.id);
          await updateMessageInDB(message.id, message.content);
          lastSavedContentRef.current.set(message.id, message.content);
        }
      }
    };

    saveNewMessages();
  }, [messages, user?.id, messagesLoaded]);

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
            ? { ...m, content: "Coach hit an error — try again." }
            : m
        )
      );
    }

    setIsLoading(false);
    isLoadingRef.current = false;
  };

  // Soft reset: clears chat and triggers fresh daily greeting (keeps onboarding/memories)
  const handleRefresh = async () => {
    // Clear chat messages from database
    if (user?.id) {
      await clearMessagesFromDB(user.id);
    }
    localStorage.removeItem(getLastOpenKey(user?.id));

    // Reset tracking refs
    lastSavedContentRef.current.clear();
    pendingSaveRef.current.clear();
    hasLoadedFromDBRef.current = false;

    // Reset local state
    setMessages([]);
    setInputValue("");
    hasGeneratedOpeningRef.current = false;
    lastGeneratedDateRef.current = null;
    lastCheckedDateRef.current = null;

    // Trigger fresh daily greeting (clear previous timeout first)
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      generateAutoOpening();
    }, 100);
  };

  // Hard reset: wipes everything including onboarding and memories (accessed via debug)
  const handleFullReset = async () => {
    if (!confirm("Reset chat and onboarding? This will wipe your coach data so you can start fresh.")) return;
    // Clear chat messages from database
    if (user?.id) {
      await clearMessagesFromDB(user.id);
    }
    localStorage.removeItem(getLastOpenKey(user?.id));
    localStorage.removeItem("netgains-current-workout");

    // Reset tracking refs
    lastSavedContentRef.current.clear();
    pendingSaveRef.current.clear();
    hasLoadedFromDBRef.current = false;

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
    // Trigger new opening after reset (clear previous timeout first)
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
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
    const messageDate = getMessageDate(message);
    if (messageDate && messageDate !== lastDate) {
      messagesWithDividers.push({ type: 'divider', date: messageDate });
      lastDate = messageDate;
    }
    messagesWithDividers.push({ type: 'message', message });
  }

  // Show loading state while checking onboarding
  if (onboardingComplete === null) {
    return (
      <div
        className="flex flex-col fixed left-0 right-0 z-40 items-center justify-center"
        style={{
          background: "#0f0f13",
          top: 0,
          bottom: isMobile ? 120 : 150,
        }}
      >
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Show structured onboarding if not complete
  if (!onboardingComplete) {
    return (
      <div
        ref={pageRef}
        className="flex flex-col fixed left-0 right-0 z-40"
        style={{
          background: "#0f0f13",
          top: 0,
          bottom: isMobile ? 120 : 150,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
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
          <UserMenu />
        </div>

        {/* Onboarding Flow - component manages its own layout */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CoachOnboarding onComplete={handleOnboardingComplete} />
        </div>
      </div>
    );
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
              if (focusScrollTimeoutRef.current) {
                clearTimeout(focusScrollTimeoutRef.current);
              }
              focusScrollTimeoutRef.current = setTimeout(() => scrollToBottom(true), 100);
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
