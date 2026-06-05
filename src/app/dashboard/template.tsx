"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * template.tsx re-monta a cada navegação entre páginas internas,
 * aplicando uma transição discreta apenas no conteúdo principal
 * (a sidebar e o header permanecem no layout, sem recarregar).
 */
export default function DashboardTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
