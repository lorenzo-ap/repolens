import { TopBar } from "@/components/layout/header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-20 sm:px-6">
        {children}
      </main>
    </>
  );
}
