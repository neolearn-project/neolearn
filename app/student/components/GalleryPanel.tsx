"use client";
import { Component, Suspense, lazy, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GalleryViewProps } from "./GalleryView";

class GalleryLoadBoundary extends Component<{children:ReactNode;onRetry:()=>void},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    if (this.state.failed) return <div role="alert" className="rounded-xl border p-4 text-sm">History tools could not load. Check your connection and retry.<button type="button" onClick={this.props.onRetry} className="ml-2 rounded border px-3 py-1">Retry history tools</button></div>;
    return this.props.children;
  }
}

export default function GalleryPanel(props: GalleryViewProps) {
  const [attempt,setAttempt] = useState(0);
  const View = useMemo(() => lazy(() => import("./GalleryView")), [attempt]);
  return <GalleryLoadBoundary key={attempt} onRetry={()=>setAttempt(value=>value+1)}><Suspense fallback={<div role="status" className="p-4 text-sm">Loading class history tools…</div>}><View {...props}/></Suspense></GalleryLoadBoundary>;
}
