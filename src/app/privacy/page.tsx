"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: March 15, 2026</p>

        <div className="space-y-8 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold mb-3">Overview</h2>
            <p>
              NetGains AI (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;) is a fitness coaching
              application that uses artificial intelligence to provide personalized workout and
              nutrition guidance. This policy explains how we collect, use, and protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data We Collect</h2>
            <ul className="list-disc list-inside space-y-2 text-foreground/80">
              <li>
                <strong>Account information:</strong> Email address for authentication
              </li>
              <li>
                <strong>Profile data:</strong> Height, weight, fitness goals, and preferences you
                provide
              </li>
              <li>
                <strong>Workout logs:</strong> Exercises, sets, reps, and weights you record
              </li>
              <li>
                <strong>Nutrition logs:</strong> Meals and macronutrient data you enter
              </li>
              <li>
                <strong>Chat history:</strong> Conversations with the AI coach
              </li>
              <li>
                <strong>Coach memories:</strong> Key facts the AI extracts to personalize your
                experience (training preferences, injuries, goals)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-2 text-foreground/80">
              <li>Provide personalized AI coaching based on your history and goals</li>
              <li>Track your workouts, nutrition, and progress over time</li>
              <li>Improve the AI coach&apos;s responses and recommendations</li>
              <li>Send transactional emails (account verification, password reset)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">AI Processing</h2>
            <p className="mb-3">
              Your conversations with the AI coach are processed by Anthropic&apos;s Claude API. This
              means your messages and relevant context (profile, recent workouts, memories) are sent
              to Anthropic&apos;s servers to generate responses.
            </p>
            <p>
              Anthropic processes this data according to their{" "}
              <a
                href="https://www.anthropic.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                privacy policy
              </a>
              . We use their API in a way that does not allow training on your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Third-Party Services</h2>
            <p className="mb-3">We use the following services to operate the app:</p>
            <ul className="list-disc list-inside space-y-2 text-foreground/80">
              <li>
                <strong>Supabase:</strong> Database and authentication (stores your account and app
                data)
              </li>
              <li>
                <strong>Anthropic Claude:</strong> AI processing for coach conversations
              </li>
              <li>
                <strong>Pinecone:</strong> Vector database for coach memory retrieval
              </li>
              <li>
                <strong>Resend:</strong> Transactional email delivery
              </li>
              <li>
                <strong>Vercel:</strong> Application hosting
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Storage & Security</h2>
            <p>
              Your data is stored securely in Supabase (PostgreSQL database) with row-level security
              policies ensuring you can only access your own data. Coach memories are stored in
              Pinecone with user-specific namespacing. All data transmission uses HTTPS encryption.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. You can view what the coach
              remembers about you in the app settings. To delete your account and all associated
              data, contact us at the email below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Your Rights</h2>
            <ul className="list-disc list-inside space-y-2 text-foreground/80">
              <li>Access your data through the app</li>
              <li>View and manage coach memories in settings</li>
              <li>Request deletion of your account and data</li>
              <li>Export your workout and nutrition history</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p>
              For privacy questions or data requests, contact us at{" "}
              <a href="mailto:support.netgainsai@gmail.com" className="text-primary hover:underline">
                support.netgainsai@gmail.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Changes</h2>
            <p>
              We may update this policy from time to time. Significant changes will be communicated
              through the app or via email.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-sm text-muted-foreground">
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
