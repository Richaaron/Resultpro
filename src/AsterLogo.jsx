import React from "react";

export default function AsterLogoMark({ className = "" }) {
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 5.5L22.4 12.1L29 14.5L22.4 16.9L20 23.5L17.6 16.9L11 14.5L17.6 12.1L20 5.5Z" fill="#D9B66E" />
      <path d="M7.5 20.5C12.2 19.8 16.1 21 20 23.6C23.9 21 27.8 19.8 32.5 20.5V31.5C27.7 30.9 23.7 32.2 20 35C16.3 32.2 12.3 30.9 7.5 31.5V20.5Z" fill="currentColor" fillOpacity=".16" />
      <path d="M20 23.6C16.1 21 12.2 19.8 7.5 20.5V31.5C12.3 30.9 16.3 32.2 20 35M20 23.6C23.9 21 27.8 19.8 32.5 20.5V31.5C27.7 30.9 23.7 32.2 20 35M20 23.6V35" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
