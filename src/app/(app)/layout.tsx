import { BottomNav } from "@/components/bottom-nav";
import { SplashScreen } from "@/components/splash-screen";
import { AppTour } from "@/components/app-tour";
import { TermsGate } from "@/components/terms-gate";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SplashScreen>
      <TermsGate>
        <main className="pb-32 min-h-screen">
          {children}
        </main>
        <BottomNav />
        <AppTour />
      </TermsGate>
    </SplashScreen>
  );
}
