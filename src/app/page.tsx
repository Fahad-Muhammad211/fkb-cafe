import { Header } from "@/components/layout/Header";
import { CategoryBar } from "@/components/layout/CategoryBar";
import { Footer } from "@/components/layout/Footer";
import { FloatingActions } from "@/components/layout/FloatingActions";
import { Hero } from "@/components/sections/Hero";
import { Menu } from "@/components/sections/Menu";

export default function HomePage() {
  return (
    <>
      <div className="sticky top-0 z-50">
        <Header />
        <CategoryBar />
      </div>
      <main className="flex flex-1 flex-col bg-zinc-950">
        <Hero />
        <Menu />
      </main>
      <Footer />
      <FloatingActions />
    </>
  );
}
