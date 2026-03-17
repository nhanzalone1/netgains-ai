"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
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

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: March 15, 2026</p>

        <div className="space-y-8 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold mb-3">Acceptance of Terms</h2>
            <p>
              By using NetGains AI (&quot;the app&quot;), you agree to these terms. If you do not
              agree, do not use the app.
            </p>
          </section>

          <section className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <h2 className="text-xl font-semibold mb-3 text-primary">
              Important: AI Coaching Disclaimer
            </h2>
            <div className="space-y-3">
              <p>
                <strong>NetGains AI provides general fitness guidance only, not medical advice.</strong>{" "}
                The AI coach is a tool to help you track workouts, log nutrition, and receive
                fitness suggestions based on your stated goals.
              </p>
              <p>
                <strong>Consult a doctor before starting any fitness or nutrition program.</strong>{" "}
                This is especially important if you have any medical conditions, injuries, or
                health concerns.
              </p>
              <p>
                <strong>
                  The AI coach is not a substitute for professional medical, nutritional, or
                  fitness advice.
                </strong>{" "}
                Always seek guidance from qualified healthcare providers for health-related
                decisions.
              </p>
            </div>
          </section>

          <section className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
            <h2 className="text-xl font-semibold mb-3 text-red-400">
              Assumption of Risk & Liability Limitation
            </h2>
            <div className="space-y-3">
              <p>
                <strong>You assume all risk for your fitness activities.</strong> Exercise and
                dietary changes carry inherent risks including but not limited to injury, illness,
                or death.
              </p>
              <p>
                <strong>
                  NetGains AI is not responsible for any injury, health issues, or damages
                  resulting from following AI-generated advice.
                </strong>{" "}
                This includes workout recommendations, nutrition suggestions, or any other guidance
                provided by the app.
              </p>
              <p>
                By using this app, you acknowledge that you are solely responsible for your own
                health and fitness decisions. You agree to hold NetGains AI, its creators, and
                affiliates harmless from any claims arising from your use of the app.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Description of Service</h2>
            <p>NetGains AI provides:</p>
            <ul className="list-disc list-inside space-y-2 text-foreground/80 mt-2">
              <li>AI-powered fitness coaching conversations</li>
              <li>Workout logging and tracking</li>
              <li>Nutrition logging and macro tracking</li>
              <li>Progress statistics and analysis</li>
              <li>Personalized recommendations based on your data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">User Responsibilities</h2>
            <ul className="list-disc list-inside space-y-2 text-foreground/80">
              <li>Provide accurate information about yourself</li>
              <li>Use the app responsibly and within your physical capabilities</li>
              <li>Consult healthcare professionals before making health decisions</li>
              <li>Keep your account credentials secure</li>
              <li>Not use the app for any unlawful purpose</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">AI & Third-Party Services</h2>
            <p className="mb-3">
              The AI coach is powered by Anthropic&apos;s Claude. Your interactions are processed
              by their systems according to their terms of service.
            </p>
            <p>
              We also use Supabase (data storage), Pinecone (memory retrieval), Resend (email), and
              Vercel (hosting). Your use of NetGains AI is subject to these providers&apos;
              respective terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Intellectual Property</h2>
            <p>
              The app, its design, and AI coaching system are owned by NetGains AI. Your personal
              data (workouts, nutrition logs, etc.) remains yours. You grant us license to use this
              data to provide and improve the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Account Termination</h2>
            <p>
              We may suspend or terminate accounts that violate these terms or abuse the service.
              You may delete your account at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Disclaimer of Warranties</h2>
            <p>
              The app is provided &quot;as is&quot; without warranties of any kind. We do not
              guarantee that the service will be uninterrupted, error-free, or that AI advice will
              be accurate or suitable for your situation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, NetGains AI shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages, including loss of
              profits, data, or health, arising from your use of the app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Changes to Terms</h2>
            <p>
              We may update these terms from time to time. Continued use of the app after changes
              constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p>
              For questions about these terms, contact us at{" "}
              <a href="mailto:support.netgainsai@gmail.com" className="text-primary hover:underline">
                support.netgainsai@gmail.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-sm text-muted-foreground">
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
