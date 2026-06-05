"use client";

import type { ReactNode } from "react";
import { domAnimation, LazyMotion } from "framer-motion";

/**
 * Carrega só o subconjunto "domAnimation" do framer-motion (animações, variants,
 * exit/AnimatePresence) em vez do bundle completo. Use os componentes `m.*`
 * (não `motion.*`) nas telas. `strict` evita o import acidental do bundle cheio.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
