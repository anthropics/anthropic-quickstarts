"use client";

import React from 'react';
import TopNavBar from "@/components/TopNavBar";
import DocGenerator from "@/components/DocGenerator";

export default function DocsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopNavBar
        features={{
          showDomainSelector: false,
          showViewModeSelector: false,
          showPromptCaching: false,
        }}
      />
      
      <main className="flex-1 pb-12">
        <DocGenerator />
      </main>
    </div>
  );
}