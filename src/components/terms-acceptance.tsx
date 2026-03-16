"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";

interface TermsAcceptanceProps {
  onAccept: () => void;
}

export function TermsAcceptance({ onAccept }: TermsAcceptanceProps) {
  const { user } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const supabase = createClient();

  const handleAccept = async () => {
    if (!user) return;

    setAccepting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ terms_accepted_at: new Date().toISOString() })
        .eq("id", user.id);

      if (!error) {
        onAccept();
      }
    } catch (error) {
      console.error("Failed to accept terms:", error);
    }
    setAccepting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex-shrink-0 p-6 pt-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Before We Begin</h1>
        <p className="text-muted-foreground text-sm">
          Please review and accept our Terms of Service and Privacy Policy to continue.
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Terms of Service Accordion */}
        <div className="mb-3 rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
          <button
            onClick={() => setShowTerms(!showTerms)}
            className="w-full flex items-center gap-3 p-4 text-left"
          >
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="font-medium flex-1">Terms of Service</span>
            {showTerms ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
          {showTerms && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="px-4 pb-4"
            >
              <div className="text-sm text-muted-foreground space-y-4 max-h-[300px] overflow-y-auto pr-2">
                <p><strong>Last Updated:</strong> March 2025</p>

                <div>
                  <p className="font-semibold text-foreground mb-1">1. AI Coaching Disclaimer</p>
                  <p>NetGains AI provides AI-generated fitness and nutrition guidance for informational purposes only. This is NOT medical advice. The AI coach is not a licensed healthcare provider, dietitian, or certified personal trainer. Always consult with qualified healthcare professionals before starting any fitness or nutrition program.</p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-1">2. Assumption of Risk</p>
                  <p>By using NetGains AI, you acknowledge that physical exercise carries inherent risks of injury. You assume full responsibility for any injuries, damages, or losses that may occur from following AI-generated workout or nutrition recommendations.</p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-1">3. Limitation of Liability</p>
                  <p>NetGains AI and its creators shall not be liable for any direct, indirect, incidental, consequential, or punitive damages arising from your use of the app or reliance on AI-generated advice.</p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-1">4. User Responsibilities</p>
                  <p>You agree to: (a) provide accurate information about your health and fitness level, (b) stop exercising if you feel pain or discomfort, (c) consult a doctor before starting any new fitness program, especially if you have pre-existing health conditions.</p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-1">5. Account & Data</p>
                  <p>You are responsible for maintaining the security of your account. We reserve the right to terminate accounts that violate these terms.</p>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Privacy Policy Accordion */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
          <button
            onClick={() => setShowPrivacy(!showPrivacy)}
            className="w-full flex items-center gap-3 p-4 text-left"
          >
            <Shield className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="font-medium flex-1">Privacy Policy</span>
            {showPrivacy ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
          {showPrivacy && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="px-4 pb-4"
            >
              <div className="text-sm text-muted-foreground space-y-4 max-h-[300px] overflow-y-auto pr-2">
                <p><strong>Last Updated:</strong> March 2025</p>

                <div>
                  <p className="font-semibold text-foreground mb-1">Information We Collect</p>
                  <p>We collect: account information (email), health and fitness data you provide (weight, workouts, meals), and usage data to improve the app.</p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-1">How We Use Your Data</p>
                  <p>Your data is used to: provide personalized AI coaching, track your fitness progress, and improve our services. We do NOT sell your personal data to third parties.</p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-1">AI Processing</p>
                  <p>Your conversations and fitness data are processed by AI models (Claude by Anthropic) to provide coaching. This data is used to generate personalized responses and is subject to Anthropic's privacy practices.</p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-1">Data Storage</p>
                  <p>Your data is stored securely using Supabase (PostgreSQL) and Pinecone (for AI memory). We implement industry-standard security measures to protect your information.</p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-1">Your Rights</p>
                  <p>You can request to view, export, or delete your data at any time by contacting us. Account deletion will remove all associated data.</p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer with Accept Button */}
      <div className="flex-shrink-0 p-4 pb-8 border-t border-white/5">
        <p className="text-xs text-muted-foreground text-center mb-4">
          By tapping "I Accept", you agree to our Terms of Service and Privacy Policy.
        </p>
        <Button
          onClick={handleAccept}
          loading={accepting}
          className="w-full"
        >
          I Accept
        </Button>
      </div>
    </div>
  );
}
