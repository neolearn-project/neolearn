"use client";

import { useId } from "react";
import { BookOpen, Images, Play, ClipboardCheck, Target } from "lucide-react";
import { LazyMotion, domAnimation, m, MotionConfig, LayoutGroup, useReducedMotion } from "framer-motion";

export default function StudentMobileNavigation({ activeTab, onHome, onClass, onTest, onNotes, onProfile }: {
  activeTab: string; onHome: () => void; onClass: () => void; onTest: () => void;
  onNotes: () => void; onProfile: () => void;
}) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  const items = [
    { key: "dashboard", label: "Home", icon: BookOpen, action: onHome },
    { key: "gallery", label: "Library", icon: Images, action: onNotes },
    { key: "classroom", label: "Classroom", icon: Play, action: onClass },
    { key: "test", label: "Test", icon: ClipboardCheck, action: onTest },
    { key: "payments", label: "Plan", icon: Target, action: onProfile },
  ];
  return <MotionConfig reducedMotion="user"><LazyMotion features={domAnimation}><LayoutGroup id={id}>
    <nav className="neo-mobile-bottom-nav hidden" aria-label="Student mobile navigation">
      {items.map(({key,label,icon:Icon,action}) => <m.button key={key} type="button"
        onClick={action} aria-current={activeTab === key ? "page" : undefined}
        className={activeTab === key ? "is-active" : ""}
        whileTap={reducedMotion ? undefined : {scale:0.96}}>
        {activeTab === key && <m.span className="neo-nav-selection" layoutId="selection"
          transition={{duration:reducedMotion ? 0 : 0.2, ease:"easeOut"}} aria-hidden="true" />}
        <Icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span>
      </m.button>)}
    </nav>
  </LayoutGroup></LazyMotion></MotionConfig>;
}
