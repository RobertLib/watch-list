"use client";

import { useEffect, useRef, useState } from "react";
import { throttle } from "@/lib/throttle";

/**
 * Hook for detecting if cursor is already over an element when component mounts
 * This solves the issue where users navigate to a new page and their cursor is already
 * over a section, but the hover state wasn't triggered because mouseenter didn't fire
 */
export function useInitialHover<T extends HTMLElement = HTMLElement>() {
  const elementRef = useRef<T>(null);
  const [isInitiallyHovered, setIsInitiallyHovered] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Throttled check function to prevent excessive calculations
    const checkInitialHover = throttle((event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const isOver =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (isOver) {
        setIsInitiallyHovered(true);
        setIsHovered(true);
      }
    }, 100);

    // Add a small delay to ensure DOM is ready and get initial mouse position
    const timeoutId = setTimeout(() => {
      // Listen for the next mouse move to get current position
      const handleMouseMove = (event: MouseEvent) => {
        checkInitialHover(event);
        document.removeEventListener("mousemove", handleMouseMove);
      };

      document.addEventListener("mousemove", handleMouseMove, { once: true });

      // Also check immediately in case mouse doesn't move
      // Use a fallback method with CSS :hover detection
      const isCurrentlyHovered =
        element.matches(":hover") || element.querySelector(":hover") !== null;

      if (isCurrentlyHovered) {
        setIsInitiallyHovered(true);
        setIsHovered(true);
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return {
    elementRef,
    isInitiallyHovered,
    isHovered,
    handleMouseEnter,
    handleMouseLeave,
  };
}
