import { BottomNav } from "@/components/bottom-nav";
import { SplashScreen } from "@/components/splash-screen";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SplashScreen>
      <main className="pb-32 min-h-screen">
        {children}
      </main>
      <BottomNav />
    </SplashScreen>
  );
}
