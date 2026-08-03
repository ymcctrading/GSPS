import { AppNav } from "@/components/app/nav";

/**
 * App shell. The container widens by device class — a phone gets edge-to-edge
 * cards with a 12px gutter, a laptop the 72rem reading width, a desktop 80rem —
 * and `min-w-0` keeps a wide child (options chain, portfolio table) scrolling
 * inside itself instead of stretching the page past the viewport.
 *
 * The bottom padding clears the phone tab bar; from `md` up that bar is gone
 * and the padding relaxes.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav />
      <main className="pb-tabbar mx-auto w-full min-w-0 max-w-6xl flex-1 px-3 pt-4 sm:px-4 sm:pt-5 lg:px-6 lg:pt-6 2xl:max-w-7xl">
        {children}
      </main>
    </div>
  );
}
