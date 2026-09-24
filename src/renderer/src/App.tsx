import { useEffect } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApplyScreen } from "@/screens/Apply";
import { HistoryScreen } from "@/screens/History";
import { Home } from "@/screens/Home";
import { RulesScreen } from "@/screens/Rules";
import { Scanning } from "@/screens/Scanning";
import { Studio } from "@/screens/Studio";
import { useApp } from "@/store/app";

export function App() {
  const screen = useApp((s) => s.screen);
  const init = useApp((s) => s.init);
  const ready = useApp((s) => s.settings !== null);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <TooltipProvider delayDuration={300}>
      {!ready ? null : screen === "home" ? (
        <Home />
      ) : screen === "scanning" ? (
        <Scanning />
      ) : screen === "studio" ? (
        <Studio />
      ) : screen === "apply" ? (
        <ApplyScreen />
      ) : screen === "history" ? (
        <HistoryScreen />
      ) : (
        <RulesScreen />
      )}
      <Toaster theme="dark" position="bottom-center" toastOptions={{ className: "font-sans" }} />
    </TooltipProvider>
  );
}
