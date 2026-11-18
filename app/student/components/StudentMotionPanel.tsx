"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";

export default function StudentMotionPanel({ children, className = "" }: {
  children: React.ReactNode; className?: string;
}) {
  const reduced = useReducedMotion();
  return <LazyMotion features={domAnimation}>
    <m.div className={className} initial={reduced ? false : {opacity:0,y:12}}
      animate={{opacity:1,y:0}} transition={{duration:reduced ? 0 : 0.24,ease:[0.22,1,0.36,1]}}>
      {children}
    </m.div>
  </LazyMotion>;
}
