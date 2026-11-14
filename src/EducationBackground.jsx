import React from "react";

const ELEMENTS = [
  { kind: "book", left: "6%", top: "14%", size: 34, delay: 0, duration: 19, drift: 28, rotate: -12 },
  { kind: "cap", left: "82%", top: "10%", size: 38, delay: 1.4, duration: 22, drift: 34, rotate: 14 },
  { kind: "pencil", left: "14%", top: "68%", size: 30, delay: 0.8, duration: 17, drift: 26, rotate: 32 },
  { kind: "star", left: "74%", top: "40%", size: 22, delay: 2.1, duration: 15, drift: 22, rotate: 0 },
  { kind: "bulb", left: "46%", top: "12%", size: 28, delay: 1.1, duration: 24, drift: 30, rotate: -8 },
  { kind: "atom", left: "90%", top: "72%", size: 36, delay: 2.6, duration: 26, drift: 36, rotate: 0 },
  { kind: "math", left: "30%", top: "40%", size: 24, delay: 1.8, duration: 18, drift: 20, rotate: 18 },
  { kind: "ruler", left: "60%", top: "82%", size: 30, delay: 0.4, duration: 21, drift: 24, rotate: -22 },
  { kind: "book", left: "38%", top: "88%", size: 26, delay: 3, duration: 20, drift: 22, rotate: 10 },
  { kind: "cap", left: "8%", top: "38%", size: 26, delay: 2.2, duration: 23, drift: 28, rotate: -16 },
];

function EducationIcon({ kind, size }) {
  const common = { width: size, height: size, viewBox: "0 0 48 48", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" };
  switch (kind) {
    case "book":
      return (
        <svg {...common}>
          <path d="M10 13c4-2 9-2 14 0v24c-5-2-10-2-14 0V13Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M38 13c-4-2-9-2-14 0v24c5-2 10-2 14 0V13Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M24 13v24" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "cap":
      return (
        <svg {...common}>
          <path d="M24 8L4 17l20 9 20-9-20-9Z" fill="currentColor" opacity=".85" />
          <path d="M12 21v9c0 2.5 5.4 4.5 12 4.5s12-2 12-4.5v-9" stroke="currentColor" strokeWidth="2" />
          <path d="M42 16v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="42" cy="26" r="2" fill="currentColor" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M28 10l10 10-22 22H6V32L28 10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M28 10l4-4 10 10-4 4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 42l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="M24 5l5.3 11.6L42 18l-9 8.7 2.5 13.3L24 33.6 12.5 40 15 26.7 6 18l12.7-1.4L24 5Z" fill="currentColor" />
        </svg>
      );
    case "bulb":
      return (
        <svg {...common}>
          <path d="M24 6c-7 0-13 5.6-13 12.8 0 4 2.4 7 6 8.6V32h14v-4.6c3.6-1.6 6-4.6 6-8.6C37 11.6 31 6 24 6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M20 36h8M20 40h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "atom":
      return (
        <svg {...common}>
          <ellipse cx="24" cy="24" rx="18" ry="8" stroke="currentColor" strokeWidth="2" />
          <ellipse cx="24" cy="24" rx="18" ry="8" stroke="currentColor" strokeWidth="2" transform="rotate(60 24 24)" />
          <ellipse cx="24" cy="24" rx="18" ry="8" stroke="currentColor" strokeWidth="2" transform="rotate(120 24 24)" />
          <circle cx="24" cy="24" r="3.5" fill="currentColor" />
        </svg>
      );
    case "math":
      return (
        <svg {...common}>
          <path d="M14 14h20M14 34h20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M20 22l8 6M28 22l-8 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case "ruler":
      return (
        <svg {...common}>
          <rect x="8" y="18" width="32" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M14 18v4M20 18v6M26 18v4M32 18v6M38 18v4" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    default:
      return null;
  }
}

export default function EducationBackground({ variant = "light" }) {
  return (
    <div className={`education-bg education-bg--${variant}`} aria-hidden="true">
      <div className="education-bg__grid" />
      {ELEMENTS.map((element, index) => (
        <span
          key={index}
          className="education-bg__item"
          style={{
            left: element.left,
            top: element.top,
            width: element.size,
            height: element.size,
            animationDelay: `${element.delay}s`,
            animationDuration: `${element.duration}s`,
            ["--drift" /* CSS custom property */]: `${element.drift}px`,
            ["--rot" /* CSS custom property */]: `${element.rotate}deg`,
          }}
        >
          <EducationIcon kind={element.kind} size={element.size} />
        </span>
      ))}
    </div>
  );
}
