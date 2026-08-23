import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import PainPoints from "./components/PainPoints";
import Features from "./components/Features";
import Dashboard from "./components/Dashboard";
import Standards from "./components/Standards";
import Pricing from "./components/Pricing";
import Footer from "./components/Footer";
import EarlyAccessModal from "./components/EarlyAccessModal";
import AuthModal from "./components/AuthModal";
import { siteConfig } from "@/config/site";
import { tiers } from "@/config/pricing";

const coreTier = tiers.find((tier) => tier.id === "CORE");

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.company.brandName,
  url: siteConfig.urls.base,
  description: siteConfig.product.description,
  brand: {
    "@type": "Brand",
    name: siteConfig.product.name,
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.product.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: siteConfig.product.description,
  offers: {
    "@type": "Offer",
    price: coreTier ? coreTier.price.replace("$", "") : "0",
    priceCurrency: "USD",
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareSchema),
        }}
      />
      <Navbar />
      <Hero />
      <PainPoints />
      <Features />
      <Dashboard />
      <Standards />
      <Pricing />
      <Footer />
      <EarlyAccessModal />
      <AuthModal />
    </>
  );
}
