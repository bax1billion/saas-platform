import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import AuthModal from "@/app/components/AuthModal";

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen">{children}</main>
      <Footer />
      <AuthModal />
    </>
  );
}
