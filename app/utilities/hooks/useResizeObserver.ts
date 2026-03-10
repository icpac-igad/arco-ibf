'use client';

import { RefObject, useEffect, useState } from 'react';

export function useResizeObserver(
  ref: RefObject<HTMLElement>,
  fallbackWidth = 960,
  fallbackHeight = 400,
) {
  const [size, setSize] = useState({
    width: fallbackWidth,
    height: fallbackHeight,
  });

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const { width, height } = entry.contentRect;
        setSize({
          width: width || fallbackWidth,
          height: height || fallbackHeight,
        });
      });
    });

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref, fallbackHeight, fallbackWidth]);

  return size;
}
