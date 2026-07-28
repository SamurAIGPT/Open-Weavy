"use client"

import React from "react";
import { ReactFlowProvider } from "reactflow";
import NodeFlow from "./components/NodeFlow";

export default function Home({
  initialNodeSchemas,
  initialWorkflowData,
  onGenerationComplete,
  onGenerationError,
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-full">
      <ReactFlowProvider>
        <NodeFlow 
          initialNodeSchemas={initialNodeSchemas} 
          initialWorkflowData={initialWorkflowData} 
          onGenerationComplete={onGenerationComplete}
          onGenerationError={onGenerationError}
        />
      </ReactFlowProvider>
    </div>
  );
}
