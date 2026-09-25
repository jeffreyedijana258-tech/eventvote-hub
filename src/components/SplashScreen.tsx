import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/** Static markup rendered in the HTML shell so it paints before JS loads. */
export function SplashScreen() {
  return (
    <div className="votix-splash" role="status" aria-label="Loading VOTIX Nigeria">
      <div className="votix-splash__logo-wrap">
        <div className="votix-splash__glow" />
        <img
          src="/icon-192.png"
          alt=""
          width={192}
          height={192}
          fetchPriority="high"
          decoding="async"
          className="votix-splash__logo"
        />
      </div>
      <p className="votix-splash__title">
        VOTIX <span>Nigeria</span>
      </p>
      <div className="votix-splash__bar" aria-hidden="true" />
    </div>
  );
}

/** Dismisses the splash once hydrated and the session check has finished. Runs once per page load. */
export function SplashDismisser() {
  const { loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => {
      document.documentElement.dataset["splash"] = "done";
    });
    return () => cancelAnimationFrame(id);
  }, [loading]);
  return null;
}
