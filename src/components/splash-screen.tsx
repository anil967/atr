import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/lib/theme-store";

/* ─── Main SplashScreen ───────────────────────────────────── */
export default function SplashScreen({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const isDark = useThemeStore((s) => s.theme === "dark");
  const [phase, setPhase] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Animation phases
    timers.push(setTimeout(() => setPhase(1), 200));   // Entry
    
    // Smooth progress simulation
    const iv = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(iv);
          return 100;
        }
        const inc = Math.random() * 8; 
        return Math.min(prev + inc, 100);
      });
    }, 250);

    // Completion sequence
    const checkCompletion = setInterval(() => {
      if (progress >= 100) {
        clearInterval(checkCompletion);
        setTimeout(() => {
          setExiting(true);
          setTimeout(onComplete, 800);
        }, 500);
      }
    }, 100);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(iv);
      clearInterval(checkCompletion);
    };
  }, [progress, onComplete]);

  return (
    <>
      <style>{`
        @keyframes bcetPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes bcetDotFlow {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        @keyframes bcetBarShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          opacity: exiting ? 0 : 1,
          transition: "opacity 0.8s ease-in-out",
          // Dynamic base matching Login UI
          background: isDark ? "oklch(0.12 0.01 165)" : "oklch(0.22 0.012 165)", 
        }}
      >
        {/* Background Image with Overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('/campus-bg.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            // Darker green grading
            filter: isDark 
              ? "brightness(0.2) contrast(1.1) saturate(0.5) sepia(0.2) hue-rotate(40deg)"
              : "brightness(0.3) contrast(1.1) saturate(0.6) sepia(0.2) hue-rotate(40deg)",
            transform: exiting ? "scale(1.1)" : "scale(1)",
            transition: "transform 8s ease-out",
          }}
        />
        
        {/* Deep Green Gradient Overlay (Matching Login UI) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: isDark
              ? "linear-gradient(180deg, rgba(26, 46, 37, 0.6) 0%, rgba(12, 21, 17, 0.95) 100%)"
              : "linear-gradient(180deg, rgba(45, 74, 62, 0.45) 0%, rgba(26, 46, 37, 0.9) 100%)",
          }}
        />

        {/* Content Container */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
            maxWidth: 1200,
            padding: "0 20px",
            textAlign: "center",
          }}
        >
          {/* 1. Logo */}
          <div
            style={{
              opacity: phase >= 1 ? 1 : 0,
              transform: phase >= 1 ? "scale(1)" : "scale(0.9)",
              transition: "all 1s cubic-bezier(0.22, 1, 0.36, 1)",
              marginBottom: 0,
              width: 120,
              height: 120,
              borderRadius: "50%",
              overflow: "hidden",
              border: "3px solid rgba(255,255,255,0.2)",
              background: "#ffffff",
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img 
              src="/bcet-logo.jpg" 
              alt="BCET Logo" 
              style={{ 
                width: "90%", 
                height: "90%", 
                objectFit: "contain",
              }} 
            />
          </div>

          {/* 2. BCET Text */}
          <div
            style={{
              opacity: phase >= 1 ? 1 : 0,
              transform: phase >= 1 ? "translateY(0)" : "translateY(15px)",
              transition: "all 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.2s",
              marginBottom: 40,
              marginTop: 20,
            }}
          >
            <span
              style={{
                fontFamily: "serif",
                fontSize: 48,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "0.1em",
                textShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            >
              BCET
            </span>
          </div>

          {/* 3. Main Title */}
          <div
            style={{
              opacity: phase >= 1 ? 1 : 0,
              transform: phase >= 1 ? "translateY(0)" : "translateY(20px)",
              transition: "all 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.4s",
              marginBottom: 10,
            }}
          >
            <h1
              style={{
                fontFamily: "sans-serif",
                fontSize: 64,
                fontWeight: 800,
                color: "#ffffff",
                margin: 0,
                letterSpacing: "-0.01em",
                textShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              BCET ATR System
            </h1>
          </div>

          {/* 4. Subtitle */}
          <div
            style={{
              opacity: phase >= 1 ? 1 : 0,
              transform: phase >= 1 ? "translateY(0)" : "translateY(15px)",
              transition: "all 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.6s",
              marginBottom: 60,
            }}
          >
            <p
              style={{
                fontFamily: "sans-serif",
                fontSize: 20,
                fontWeight: 400,
                color: "rgba(255,255,255,0.8)",
                margin: 0,
                letterSpacing: "0.02em",
              }}
            >
              Action Taken Report Management System
            </p>
          </div>

          {/* 5. Loading Dots */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 25,
              opacity: phase >= 1 ? 1 : 0,
              transition: "opacity 0.5s ease 0.8s",
            }}
          >
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  // Using forest green / success green for the active dot
                  background: i === 0 ? "oklch(0.6 0.12 155)" : "#ffffff", 
                  animation: `bcetDotFlow 1.5s infinite ${i * 0.2}s`,
                }}
              />
            ))}
          </div>

          {/* 6. Initializing Text */}
          <div
            style={{
              marginBottom: 20,
              opacity: phase >= 1 ? 1 : 0,
              transition: "opacity 0.5s ease 1s",
            }}
          >
            <span
              style={{
                fontFamily: "sans-serif",
                fontSize: 18,
                color: "#ffffff",
                fontWeight: 500,
                letterSpacing: "0.03em",
              }}
            >
              {progress < 100 ? "Initializing System..." : "System Ready"}
            </span>
          </div>

          {/* 7. Progress Bar Wrapper */}
          <div
            style={{
              width: "100%",
              maxWidth: 450,
              display: "flex",
              alignItems: "center",
              gap: 15,
              opacity: phase >= 1 ? 1 : 0,
              transition: "opacity 0.5s ease 1.2s",
            }}
          >
            <div
              style={{
                flex: 1,
                height: 6,
                background: "rgba(255,255,255,0.2)",
                borderRadius: 3,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  // Forest green bar
                  background: "oklch(0.6 0.12 155)",
                  borderRadius: 3,
                  transition: "width 0.4s ease-out",
                  boxShadow: "0 0 10px rgba(96, 191, 155, 0.4)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                  transform: "translateX(-100%)",
                  animation: "bcetBarShimmer 2s infinite",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "sans-serif",
                fontSize: 16,
                color: "#ffffff",
                fontWeight: 600,
                minWidth: 40,
              }}
            >
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
