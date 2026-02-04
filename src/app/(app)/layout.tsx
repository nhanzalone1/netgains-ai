import { BottomNav } from "@/components/bottom-nav";
import { AICoach } from "@/components/ai-coach";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="pb-32 min-h-screen">
        {children}
      </main>
      <BottomNav />
      <AICoach />
    </>
  );
}
