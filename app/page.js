"use client";
import dynamic from "next/dynamic";
const Presentation = dynamic(() => import("../components/Presentation"), { ssr: false });
export default function Page() { return <Presentation />; }
