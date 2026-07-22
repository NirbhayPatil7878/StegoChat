import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "@/components/ui";
import { AppLayout } from "@/components/layout/AppLayout";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { useAuthStore } from "@/store/auth";

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const ShareRedeem = lazy(() => import("@/pages/ShareRedeem"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Chat = lazy(() => import("@/pages/Chat"));
const Studio = lazy(() => import("@/pages/Studio"));
const Tokens = lazy(() => import("@/pages/Tokens"));
const History = lazy(() => import("@/pages/History"));
const Forensics = lazy(() => import("@/pages/Forensics"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const About = lazy(() => import("@/pages/static/About"));
const Docs = lazy(() => import("@/pages/static/Docs"));
const Faq = lazy(() => import("@/pages/static/Faq"));
const Privacy = lazy(() => import("@/pages/static/Privacy"));
const Terms = lazy(() => import("@/pages/static/Terms"));
const Contact = lazy(() => import("@/pages/static/Contact"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  return isAuthed ? <>{children}</> : <Navigate to="/login" replace />;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  return isAuthed ? <Navigate to="/app/chat" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />

        {/* Marketing / static pages */}
        <Route element={<MarketingLayout />}>
          <Route path="/about" element={<About />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/contact" element={<Contact />} />
        </Route>

        {/* Auth */}
        <Route
          path="/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnly>
              <Register />
            </GuestOnly>
          }
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* Public share-token redeem page */}
        <Route path="/t/:token" element={<ShareRedeem />} />

        {/* Authenticated app */}
        <Route
          path="/app"
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="studio" element={<Studio />} />
          <Route path="embed" element={<Studio />} />
          <Route path="extract" element={<Studio />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="history" element={<History />} />
          <Route path="forensics" element={<Forensics />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
