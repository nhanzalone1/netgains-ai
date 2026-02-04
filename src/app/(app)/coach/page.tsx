"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { UserMenu } from "@/components/user-menu";

export default function CoachPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0f0f13" }}>
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
        <UserMenu />
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(255, 71, 87, 0.15)" }}
            >
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">NetGains Coach</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
              I'm your no-nonsense bodybuilding coach. Let's get your stats and start building.
            </p>
            <div
              className="inline-block px-4 py-2 rounded-xl text-sm text-muted-foreground"
              style={{ background: "#1a1a24" }}
            >
              Say "hey" to get started
            </div>
          </div>
        )}

        {messages.map((message) => (
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
              className="rounded-2xl px-4 py-3"
              style={{ background: "#1a1a24" }}
            >
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/5 pb-36">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input ?? ""}
            onChange={handleInputChange}
            placeholder="Message your coach..."
            className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px]"
            style={{ background: "#1a1a24" }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="submit"
            disabled={!input?.trim() || isLoading}
            className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
