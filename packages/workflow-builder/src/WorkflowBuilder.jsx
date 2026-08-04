"use client"

import React from "react";
import { ReactFlowProvider } from "reactflow";
import NodeFlow from "./components/NodeFlow";

export default function Home({
  apiKey,
  initialNodeSchemas,
  initialWorkflowData,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-full">
      <ReactFlowProvider>
        <NodeFlow
          apiKey={apiKey}
          initialNodeSchemas={initialNodeSchemas}
          initialWorkflowData={initialWorkflowData}
          onGenerationStart={onGenerationStart}
          onGenerationEnd={onGenerationEnd}
          onGenerationComplete={onGenerationComplete}
          onGenerationError={onGenerationError}
        />
      </ReactFlowProvider>
    </div>
  );
}
