import { motion } from "framer-motion";
import { Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <AuroraBackground />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Logo size={48} className="mx-auto mb-6" />
        <h1 className="font-display text-7xl font-bold gradient-text">404</h1>
        <p className="mt-4 text-lg font-medium">This page is hidden a little too well.</p>
        <p className="mt-1 text-sm text-muted">
          We couldn't decrypt a page at that address.
        </p>
        <Link to="/" className="mt-8 inline-block">
          <Button>
            <Home className="h-4 w-4" /> Back to safety
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}
