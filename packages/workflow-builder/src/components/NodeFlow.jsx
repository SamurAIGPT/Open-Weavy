"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from "reactflow";
// import "reactflow/dist/style.css";
import { BsArrowUpCircleFill } from "react-icons/bs";
import { FiZoomIn, FiZoomOut } from "react-icons/fi";
import { TfiText } from "react-icons/tfi";
import { MdLockOutline, MdOutlineZoomOutMap, MdSave } from "react-icons/md";
import { LuLayoutTemplate, LuMousePointer2 } from "react-icons/lu";
import { FaAngleDown, FaAngleLeft, FaCheck, FaPlay, FaPlus, FaRegHand, FaToolbox, FaUpload } from "react-icons/fa6";
import { FaRegEdit, FaTelegramPlane } from "react-icons/fa";
import { IoDuplicateOutline, IoImageOutline, IoVideocamOutline } from "react-icons/io5";
import { Toaster, toast } from "react-hot-toast";
import { FiSun, FiMoon } from "react-icons/fi";
import axios from "axios";
import TextGeneration from "./TextNode";
import ImageGeneration from "./ImageNode";
import VideoGeneration from "./VideoNode";
import { setWorkflowIds } from "./WorkflowStore";
import { apiNodeModels, audioModels, concatModels, imageModels, textModels, videoModels, videoCombinerModels, presets } from "./utility";
import Link from "next/link";
import RenderField from "./RenderField";
import PromptConcate from "./PromptConcate";
import { TbArrowMerge } from "react-icons/tb";
import { RiInputMethodLine } from "react-icons/ri";
import ApiNode from "./ApiNode";
import RenderApiField from "./RenderApiField";
import AudioGeneration from "./AudioNode";
import NodesNavbar from "./NodesNavbar"
import ChatWidget from "./ChatWidget";
import { AiOutlineAudio } from "react-icons/ai";
import VideoCombiner from "./VideoCombiner";
import { useGenerationCost } from "./useGenerationCost";

const nodeTypes = {
  textNode: TextGeneration,
  imageNode: ImageGeneration,
  videoNode: VideoGeneration,
  audioNode: AudioGeneration,
  concatNode: PromptConcate,
  vidConcatNode: VideoCombiner,
  apiNode: ApiNode
}

const initialNodes = [
  { id: "text1", position: { x: 0, y: 100 }, data: {}, type: "textNode" },
  { id: "image1", position: { x: 300, y: 100 }, data: {}, type: "imageNode" },
];

const initialEdges = [];

const edgeStyles = {
  blue: {
    stroke: '#3b82f6', // blue-500
    strokeWidth: 2,
    // animated: true,
  },
  green: {
    stroke: '#22c55e', // green-500
    strokeWidth: 2,
    // animated: true,
  },
  orange: {
    stroke: '#f97316', // orange-500
    strokeWidth: 2,
    // animated: true,
  },
  gray: {
    stroke: '#6b7280', // gray-500
    strokeWidth: 2,
  },
  yellow: {
    stroke: '#eab308', // yellow-500
    strokeWidth: 2,
  },
  white: {
    stroke: '#ffffff',
    strokeWidth: 2,
  }
};

const getEdgeColor = (sourceHandle, targetHandle, sourceNode = null, targetNode = null) => {
  if (sourceHandle === "apiOutput" && sourceNode) {
    const output = sourceNode.data.outputs?.[0];
    const modelType = sourceNode.data.formValues?.model_type;

    if (output?.type === 'text' || modelType === 'chat') return "blue";
    if (output?.type === 'video_url' || modelType === 'video') return "orange";
    if (output?.type === 'audio_url' || modelType === 'audio') return "yellow";
    return "green";
  }

  if (["textOutput", "concatOutput"].includes(sourceHandle)) return "blue";
  if (["imageOutput"].includes(sourceHandle)) return "green";
  if (["videoOutput"].includes(sourceHandle)) return "orange";
  if (["audioOutput"].includes(sourceHandle)) return "yellow";

  if (["textInput", "textInput4", "imageInput", "videoInput", "audioInput2", "concatInput", "apiInput"].includes(targetHandle)) return "blue";
  if (["textInput2", "textInput3", "imageInput2", "imageInput3", "videoInput2", "videoInput3", "videoInput6", "audioInput3", "apiInput2", "apiInput3"].includes(targetHandle)) return "green";
  if (["videoInput4", "audioInput4", "videoInput7"].includes(targetHandle)) return "orange";
  if (["audioInput", "videoInput5", "videoInput8"].includes(targetHandle)) return "yellow";

  if (sourceNode) {
    const type = sourceNode.type;
    if (type === 'textNode' || type === 'concatNode') return "blue";
    if (type === 'imageNode') return "green";
    if (type === 'videoNode' || type === 'vidConcatNode') return "orange";
    if (type === 'audioNode') return "yellow";
  }

  return "white";
};

const iconMap = {
  "plus": <FaPlus size={20} />,
  "image": <IoImageOutline size={20} />,
  "video": <IoVideocamOutline size={20} />,
  "audio": <AiOutlineAudio size={20} />,
  "text": <TfiText size={20} />,
};

const SPECIAL_MODEL_NAMES = {
  "text-passthrough": "Input Text",
  "image-passthrough": "Input Image",
  "video-passthrough": "Input Video",
  "audio-passthrough": "Input Audio",
};

const formatName = (id) => id.replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const getModelObjStatic = (category, modelId, nodeSchemas) => {
  if (category === "api") {
    // We can't easily access filteredApiNodeModels statically without passing it, 
    // but we can compute it on the fly or just return null and let useEffect handle it if needed.
    // For now, let's just use the shared logic.
    const apiModelsFromBackend = nodeSchemas?.categories?.api?.models ? Object.keys(nodeSchemas.categories.api.models) : [];
    const filtered = apiNodeModels.filter(model => apiModelsFromBackend.includes(model.id));
    return filtered.find(m => m.id === modelId) || null;
  }
  if (!modelId || !nodeSchemas?.categories) return null;
  const rawModel = nodeSchemas.categories[category]?.models?.[modelId];
  if (!rawModel) return null;

  return {
    ...rawModel,
    id: modelId,
    name: SPECIAL_MODEL_NAMES[modelId] || formatName(modelId)
  };
};

const processWorkflowData = (workflowData, nodeSchemas, id) => {
  if (!workflowData || !nodeSchemas?.categories) return null;

  const workflow = workflowData?.data;
  if (!workflow?.nodes) return null;

  const restoredNodes = workflow.nodes.map(n => ({
    id: n.id,
    type: n.category === "utility" 
      ? (n.model === "video-combiner" ? "vidConcatNode" : "concatNode") 
      : `${n.category}Node`,
    position: {
      x: n.position?.x ?? 350,
      y: n.position?.y ?? 0
    },
    data: {
      nodeSchemas,
      modelId: n.model,
      selectedModel: getModelObjStatic(n.category, n.model, nodeSchemas),
      outputs: n.output_params?.outputs || [],
      resultUrl: n.output_params?.resultUrl || null,
      formValues: n.input_params || {},
      outputHistory: (workflowData.run_history?.[n.id] || [])
        .sort((a, b) => new Date(a.started_at) - new Date(b.started_at)),
    }
  }));

  const restoredEdges = (workflowData.edges || []).map((e) => {
    const sourceNode = restoredNodes.find(n => n.id === e.source);
    const targetNode = restoredNodes.find(n => n.id === e.target);
    let edgeColor = getEdgeColor(e.sourceHandle, e.targetHandle, sourceNode, targetNode);

    return {
      id: e.id || `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
      style: edgeStyles[edgeColor],
    }
  });

  return {
    nodes: restoredNodes,
    edges: restoredEdges,
    metadata: {
      workflowId: id,
      runId: workflowData?.run_id,
      workflowName: workflowData.name,
      interactionMode: workflowData.is_owner,
      publishWorkflow: workflowData.is_published,
      template: {
        showTemplateBtn: workflowData.show_temp_button,
        isPublishedTemplate: workflowData.is_template,
      },
      category: workflowData?.category || "General"
    }
  };
};

const NodeFlow = ({
  initialNodeSchemas,
  initialWorkflowData,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}) => {
  const params = useParams();
  const { id } = params;

  // Pre-calculate initial state if data is provided
  const initialState = useMemo(() => {
    return processWorkflowData(initialWorkflowData, initialNodeSchemas, id);
  }, [initialWorkflowData, initialNodeSchemas, id]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialState?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialState?.edges || initialEdges);
  const [activeHandleColor, setActiveHandleColor] = useState(null);
  const [loadingNodes, setLoadingNodes] = useState({});
  const [isRunning, setIsRunning] = useState(0);
  const [dropDown, setDropDown] = useState(0);
  const [workflowName, setWorkflowName] = useState(initialState?.metadata?.workflowName || "Untitled");
  const [workflowId, setWorkflowId] = useState(id);
  const [runId, setRunId] = useState(initialState?.metadata?.runId || null);
  const [hasFit, setHasFit] = useState(false);
  const [nodeSchemas, setNodeSchemas] = useState(initialNodeSchemas || {});
  const [contextMenu, setContextMenu] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [draggedEdgeInfo, setDraggedEdgeInfo] = useState(null);
  const [edgePicker, setEdgePicker] = useState(null);
  const connectionMadeRef = useRef(false);
  const onConnectRef = useRef(null);
  const [interactionMode, setInteractionMode] = useState(initialState?.metadata?.interactionMode || false);
  const [publishWorkflow, setPublishWorkflow] = useState(initialState?.metadata?.publishWorkflow || false);
  const [template, setTemplate] = useState(initialState?.metadata?.template || {
    showTemplateBtn: false,
    isPublishedTemplate: false
  });
  const [isDragging, setIsDragging] = useState(true);
  const [modelSearch, setModelSearch] = useState("");
  const [isPresetsDismissed, setIsPresetsDismissed] = useState(true);
  const [isRestoring, setIsRestoring] = useState(!initialState);
  const [totalWorkflowCost, setTotalWorkflowCost] = useState(0);

  useEffect(() => {
    const total = nodes.reduce((sum, node) => {
      const cost = parseFloat(node.data?.cost) || 0;
      return sum + cost;
    }, 0);
    setTotalWorkflowCost(total.toFixed(3));
  }, [nodes]);

  // Sync global store with initial data if provided
  useEffect(() => {
    if (initialState?.metadata) {
      setWorkflowIds(id, initialState.metadata.runId);
    }
  }, [id, initialState]);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [workflowCategory, setWorkflowCategory] = useState(initialState?.metadata?.category || "General");
  const [categoryInput, setCategoryInput] = useState(initialState?.metadata?.category || "General");
  const [isCategoryPopupOpen, setIsCategoryPopupOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModelDropdownUp, setIsModelDropdownUp] = useState(false);
  const modelDropdownTriggerRef = useRef(null);

  const { zoomIn, zoomOut, fitView, getNodes, screenToFlowPosition } = useReactFlow();

  const apiModelsFromBackend =
    nodeSchemas?.categories?.api?.models
      ? Object.keys(nodeSchemas.categories.api.models)
      : [];

  const filteredApiNodeModels = apiNodeModels.filter(model =>
    apiModelsFromBackend.includes(model.id)
  );

  const loadPreset = (preset) => {
    setIsPresetsDismissed(true);
    setNodes(preset.nodes);
    setEdges(preset.edges);
    setTimeout(() => fitView({ padding: 0.4, duration: 500 }), 100);
  };

  // Moved SPECIAL_MODEL_NAMES, formatName and getModelObj logic to static helpers above

  useEffect(() => {
    if (!initialNodeSchemas) {
      axios.get(`/api/workflow/${id}/node-schemas`)
        .then(res => setNodeSchemas(res.data || {}))
        .catch(err => console.error("Failed to load node schemas", err));
    }

    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useLayoutEffect(() => {
    if (dropDown === 3 && modelDropdownTriggerRef.current) {
      const rect = modelDropdownTriggerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - rect.bottom;
      setIsModelDropdownUp(spaceBelow < 250);
    }
  }, [dropDown]);

  useEffect(() => {
    if (!nodeSchemas?.categories) return;
    setNodes((prev) => {
      const needsUpdate = prev.some((n) => n.data.nodeSchemas !== nodeSchemas);
      if (!needsUpdate) return prev;

      return prev.map((n) => ({
        ...n,
        data: {
          ...n.data,
          nodeSchemas,
        },
      }));
    });
  }, [nodeSchemas]);
  const getModelObj = useCallback((category, modelId) => {
    return getModelObjStatic(category, modelId, nodeSchemas);
  }, [nodeSchemas]);

  const restoreWorkflow = useCallback((workflowData) => {
    const workflow = workflowData?.data;
    if (!workflow?.nodes) return;

    const restoredNodes = workflow.nodes.map(n => ({
      id: n.id,
      type: n.category === "utility" 
        ? (n.model === "video-combiner" ? "vidConcatNode" : "concatNode") 
        : `${n.category}Node`,
      position: {
        x: n.position?.x ?? 350,
        y: n.position?.y ?? 0
      },
      data: {
        nodeSchemas,
        modelId: n.model,
        selectedModel: getModelObj(n.category, n.model),
        outputs: n.output_params?.outputs || [],
        resultUrl: n.output_params?.resultUrl || null,
        formValues: n.input_params || {},
        outputHistory: (workflowData.run_history?.[n.id] || [])
          .sort((a, b) => new Date(a.started_at) - new Date(b.started_at)),
      }
    }));

    const restoredEdges = (workflowData.edges || []).map((e) => {
      const sourceNode = restoredNodes.find(n => n.id === e.source);
      const targetNode = restoredNodes.find(n => n.id === e.target);
      let edgeColor = getEdgeColor(e.sourceHandle, e.targetHandle, sourceNode, targetNode);

      return {
        id: e.id || `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || null,
        targetHandle: e.targetHandle || null,
        style: edgeStyles[edgeColor],
      }
    });

    setNodes(restoredNodes);
    setEdges(restoredEdges);
    setWorkflowId(id);
    setRunId(workflowData?.run_id);
    setWorkflowName(workflowData.name);
    setWorkflowCategory(workflowData?.category || "General");
    setWorkflowIds(workflowData.workflow_id, workflowData?.run_id);
    setInteractionMode(workflowData.is_owner);
    setPublishWorkflow(workflowData.is_published);
    setTemplate(prev => ({
      ...prev,
      showTemplateBtn: workflowData.show_temp_button,
      isPublishedTemplate: workflowData.is_template,
    }));
    setIsRestoring(false);
  }, [id, nodeSchemas, getModelObj, setNodes, setEdges])ÛÝuêÚ$z{-®éÜj×WFFTæöFTg&öÕæVÂ†f–VÆBÂfÇVR“° ¢–b†f–VÆBÓÓÒvÖöFVÅöæÖRrbb6VÆV7FVDæöFRæFFæG–æÖ–566†VÖ2’°¢6öç7BÖF6†VDÖöFVÂÒö&¦V7BçfÇVW2‡6VÆV7FVDæöFRæFFæG–æÖ–566†VÖ2’æf–æB†ÒÓâÒæÖöFVÅö–BÓÓÒfÇVR“°¢–b†ÖF6†VDÖöFVÂbbÖF6†VDÖöFVÂæÖöFVÅ÷G—R’°¢WFFTæöFTg&öÕæVÂ‚vÖöFVÅ÷G—RrÂÖF6†VDÖöFVÂæÖöFVÅ÷G—R“°¢Ð¢Ð¢×Ð¢óà¢“°¢Ò—Ð¢ÂöF—cà¢’¢†–çWE66†VÖòç&÷W'F–W2ÇÂ†–çWE66†VÖbbö&¦V7Bæ¶W—2†–çWE66†VÖ’æÆVæwF‚â’’ò€¢ö&¦V7BæVçG&–W2†–çWE66†VÖòç&÷W'F–W2ÇÂ–çWE66†VÖ’æÖ‚…¶¶W’ÂÖWFÒÂ–G‚’Óâ°¢–b†¶W’ÓÓÒ'66†VÖ2"’&WGW&âçVÆÃ°¢&WGW&â€¢Å&VæFW$f–VÆ@¢¶W“×¶¶W—Ð¢f–VÆDæÖS×¶¶W—Ð¢ÖWF×¶ÖWFÐ¢–Gƒ×¶–G‡Ð¢f÷&ÕfÇVW3×·6VÆV7FVDæöFSòæFFòæf÷&ÕfÇVW2ÇÂ·×Ð¢6WDf÷&ÕfÇVW3×²†æWufÇVW2’Óâ°¢6WDæöFW2‚†æG2’Óà¢æG2æÖ‚†æöFR’Óâ°¢–b†æöFRæ–BÓÓÒ6VÆV7FVDæöFSòæ–B’°¢&WGW&â°¢ââææöFRÀ¢FF¢°¢ââææöFRæFFÀ¢f÷&ÕfÇVW3¢G—VöbæWufÇVW2ÓÓÒvgVæ7F–öâp¢òæWufÇVW2†æöFRæFFòæf÷&ÕfÇVW2ÇÂ·Ò¢¢æWufÇVW2À¢ÒÀ¢Ó°¢Ð¢&WGW&âæöFS°¢Ò¢“°¢×Ð¢†æFÆT6†ævS×·WFFTæöFTg&öÕæVÇÐ¢FF×¶–çWE66†VÖÐ¢ÖöFVÄæÖS×·6VÆV7FVDæöFSòæFFòç6VÆV7FVDÖöFVÃòææÖWÐ¢óà¢“°¢Ò’æf–ÇFW"„&ööÆVâ¢’¢€¢ÆF—b6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó‚#à¢Ç6Æ74æÖSÒ'FW‡B×6ÒFW‡BÖw&’ÓC#äæò&÷W'F–W2f–Æ&ÆSÂ÷à¢ÂöF—cà¢“°¢Ò’‚¢’¢€¢ÆF—b6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó‚#à¢Ç6Æ74æÖSÒ'FW‡B×6ÒFW‡BÖw&’ÓC#åÆV6R6VÆV7BÖöFVÂf—'7CÂ÷à¢ÂöF—cà¢—Ð¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ'ÓBfÆW‚fÆW‚Ö6öÂvÓ2#à¢²ò¢Ö¶R÷WGWBFövvÆR¢÷Ð¢ÆÆ&VÂ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâ7W'6÷"×ö–çFW"w&÷W#à¢Ç7â6Æ74æÖSÒ'FW‡B×‡2FW‡BÖw&’Ó3föçBÖÖVF—VÒ#äÖ&²2÷WGWCÂ÷7ãà¢ÆF—b6Æ74æÖSÒ'&VÆF—fR#à¢Æ–çW@¢G—SÒ&6†V6¶&÷‚ ¢6Æ74æÖSÒ'7"ÖöæÇ’VW" ¢6†V6¶VC×·6VÆV7FVDæöFSòæFFòæf÷&ÕfÇVW3òæÖ¶Uö÷WGWBÓÓÒG'VWÐ¢öä6†ævS×²†R’Óâ°¢6öç7B6†V6¶VBÒRçF&vWBæ6†V6¶VC°¢6WDæöFW2‚†æG2’Óà¢æG2æÖ‚†â’Óà¢âæ–BÓÓÒ6VÆV7FVDæöFRæ–@¢ò°¢ââæâÀ¢FF¢°¢ââæâæFFÀ¢f÷&ÕfÇVW3¢°¢ââæâæFFæf÷&ÕfÇVW2À¢Ö¶Uö÷WGWC¢6†V6¶VBÀ¢ÒÀ¢ÒÀ¢Ð¢¢à¢¢“°¢×Ð¢óà¢ÆF—b6Æ74æÖSÒ'rÓ’‚ÓR&rÖw&’Ós&÷VæFVBÖgVÆÂVW"VW"Ö6†V6¶VC¦&rÖ&ÇVRÓcG&ç6—F–öâÖ6öÆ÷'2#ãÂöF—cà¢ÆF—b6Æ74æÖSÒ&'6öÇWFRÆVgBÓãRF÷ÓãRrÓB‚ÓB&r×v†—FR&÷VæFVBÖgVÆÂVW"Ö6†V6¶VC§G&ç6ÆFR×‚ÓBG&ç6—F–öâ×G&ç6f÷&Ò#ãÂöF—cà¢ÂöF—cà¢ÂöÆ&VÃà¢²6VÆV7FVDæöFSòæFFòç6VÆV7FVDÖöFVÃòæ–Còæ–æ6ÇVFW2‚'77F‡&÷Vv‚"’bb€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢7W&W74‡–G&F–öåv&æ–æs×·G'VWÐ¢öä6Æ–6³×²‚’Óâ6VÆV7FVDæöFRbb'VäæöFTg&öÔfÆ÷r‡6VÆV7FVDæöFRæ–B—Ð¢F—6&ÆVC×¶ÆöF–ætæöFW5·6VÆV7FVDæöFRæ–E×Ð¢6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"7W'6÷"×ö–çFW"F—6&ÆVC¦÷6—G’Ósw&÷WF—6&ÆVC¦7W'6÷"Öæ÷BÖÆÆ÷vVB&÷VæFVBÖÆrFW‡B×v†—FR&rÖ&ÇVRÓS‚ÓB’Ó"&÷&FW"&÷&FW"Ö&ÇVRÓSóS†÷fW#¦&rÖ&ÇVRÓcrÖgVÆÂG&ç6—F–öâÖÆÂ6†F÷rÖÆr6†F÷rÖ&ÇVRÓ“ó#7F—fS§66ÆRÕ³ã“…Ò ¢à¢¶ÆöF–ætæöFW5·6VÆV7FVDæöFRæ–EÒò€¢ÃãÆF—b6Æ74æÖSÒ'rÓB‚ÓB&÷VæFVBÖgVÆÂ&÷&FW"Ó"&÷&FW"×v†—FRó#&÷&FW"×B×v†—FRæ–ÖFR×7–â#ãÂöF—cävVæW&F–ærââãÂóà¢’¢€¢Ãà¢ÄfÆ’6—¦S×³gÒóâ ¢vVæW&FP¢¶vVæW&F–öä6÷7BÓÒçVÆÂbb€¢Ç7â6Æ74æÖSÒ'FW‡B×‡2föçBÖÖVF—VÒ#à¢¶—5&Vg&W6†–æt6÷7Bò€¢ÆF—b6Æ74æÖSÒ'rÓ2‚Ó2&÷&FW"Ó"&÷&FW"×v†—FRó3&÷&FW"×B×v†—FR&÷VæFVBÖgVÆÂæ–ÖFR×7–â–æÆ–æRÖ&Æö6²Æ–vâÖÖ–FFÆR#ãÂöF—cà¢’¢€¢vVæW&F–öä6÷7BÓÓÒòtg&VRr¢BG¶vVæW&F–öä6÷7GÖ ¢—Ð¢Â÷7ãà¢—Ð¢Âóà¢—Ð¢Âö'WGFöãà¢—Ð¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢—Ð¢¶6öçFW‡DÖVçRbb€¢ÆF—`¢6Æ74æÖSÒ&f—†VB¢ÓC ¢7G–ÆS×·°¢F÷¢6öçFW‡DÖVçRç’À¢ÆVgC¢6öçFW‡DÖVçRç‚À¢×Ð¢öä6Æ–6³×²†R’ÓâRç7F÷&÷vF–öâ‚—Ð¢à¢ÄæöFW4æf& ¢FDæöFS×²‡G—RÂòÂFF’ÓâFDæöFR‡G—RÂ6öçFW‡DÖVçRç÷6—F–öâÂFF—Ð¢”æöFTÖöFVÇ3×¶f–ÇFW&VD”æöFTÖöFVÇ7Ð¢æöFU66†VÖ3×¶æöFU66†VÖ7Ð¢óà¢ÂöF—cà¢—Ð¢ÆF—`¢6Æ74æÖS×¶f—†VB–ç6WBÓfÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"¢ÓS÷fW&fÆ÷rÖWFò&rÖ&Æ6²ó3&6¶G&÷Ö&ÇW"G&ç6—F–öâÖÆÂGW&F–öâÓ#V6RÖ–âÖ÷WBG°¢G&÷F÷vâÓÓÒ"ò&÷6—G’Ó66ÆRÓf—6–&ÆR"¢&÷6—G’Ó66ÆRÓƒ–çf—6–&ÆR ¢ÖÐ¢öä6Æ–6³×²‚’Óâ6WDG&÷F÷vâƒ—Ð¢à¢ÆF—b6Æ74æÖSÒ&&rÕ²3#C#c#•Ò&÷VæFVBÖÆrÓBrÓs"6†F÷rÖÆrfÆW‚fÆW‚Ö6öÂvÓB"öä6Æ–6³×²†R’ÓâRç7F÷&÷vF–öâ‚—Óà¢Æƒ26Æ74æÖSÒ'FW‡BÖ&6RFW‡BÖ6VçFW"föçB×6VÖ–&öÆBFW‡B×v†—FR#å6fRv÷&¶fÆ÷sÂöƒ3à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ"rÖgVÆÂ#à¢ÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2FW‡B×7F'BFW‡BÖw&’Ó3#åv÷&¶fÆ÷ræÖSÂöÆ&VÃà¢Æ–çW@¢G—SÒ'FW‡B ¢fÇVS×·v÷&¶fÆ÷tæÖWÐ¢WFôfö7W0¢öä6†ævS×²†R’Óâ6WEv÷&¶fÆ÷tæÖR†RçF&vWBçfÇVR—Ð¢Æ6V†öÆFW#Ò$VçFW"v÷&¶fÆ÷ræÖR ¢6Æ74æÖSÒ&&÷&FW"&÷&FW"Öw&’Ós‚Ó"’ÓãRFW‡B×6ÒFW‡B×v†—FR&÷VæFVB&r×G&ç7&VçBrÖgVÆÂ ¢óà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"rÖgVÆÂvÓ"#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢7W&W74‡–G&F–öåv&æ–æs×·G'VWÐ¢öä6Æ–6³×²‚’Óâ6WDG&÷F÷vâƒ—Ð¢6Æ74æÖSÒ'‚ÓB’Ó"&rÖw&’ÓsóSFW‡B×v†—FR&÷VæFVBÖgVÆÂFW‡B×6Ò†÷fW#¦&rÖw&’ÓcóSG&ç6—F–öârÖgVÆÂ7W'6÷"×ö–çFW" ¢à¢6æ6VÀ¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢7W&W74‡–G&F–öåv&æ–æs×·G'VWÐ¢öä6Æ–6³×¶†æFÆU6fUv÷&´fÆ÷wÐ¢6Æ74æÖSÒ'‚ÓB’Ó"&r×v†—FRFW‡BÖ&Æ6²&÷VæFVBÖgVÆÂ†÷fW#¦&rÖ&ÇVRÓS†÷fW#§FW‡B×v†—FRG&ç6—F–öârÖgVÆÂFW‡B×6Ò7W'6÷"×ö–çFW" ¢à¢6fP¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢¶æöFW2æÆVæwF‚ÓÓÒbb—5&W6WG4F—6Ö—76VBbb–çFW&7F–öäÖöFRbb€¢ÆF—b6Æ74æÖSÒ&'6öÇWFR–ç6WBÓ¢ÓfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"ö–çFW"ÖWfVçG2ÖæöæR#à¢ÆF—b6Æ74æÖSÒ'ö–çFW"ÖWfVçG2ÖWFòfÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"vÓbæ–ÖFRÖ–âfFRÖ–â¦ööÒÖ–âGW&F–öâÓ3G&ç6f÷&Ò66ÆRÓ“ÖC§66ÆRÓ÷fW&fÆ÷r×’ÖWFò7W7FöÒ×67&öÆÆ&"Ö‚×rÕ³“UÒÖ‚Ö‚Õ³ƒUÒÓ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"vÓ"&rÖ&Æ6²óC&6¶G&÷Ö&ÇW"ÖÖB‚Ób’Ó2&÷VæFVBÖÆr&÷&FW"&÷&FW"×v†—FRó6†F÷r×†Â#à¢Æƒ"6Æ74æÖSÒ'FW‡B×†ÂföçB×6VÖ–&öÆBFW‡B×v†—FRG&6¶–ær×F–v‡B#å6VÆV7Bv÷&¶fÆ÷sÂöƒ#à¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖw&’ÓCföçBÖÖVF—VÒWW&66RG&6¶–ær×v–FW7B#æ÷"7F'Bg&öÒ67&F6ƒÂ÷à¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2ÓÖC¦w&–BÖ6öÇ2Ó"Æs¦w&–BÖ6öÇ2ÓRvÓB#à¢·&W6WG2æÖ‚‡&W6WB’Óâ€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢7W&W74‡–G&F–öåv&æ–æs×·G'VWÐ¢¶W“×·&W6WBæ–GÐ¢öä6Æ–6³×²‚’ÓâÆöE&W6WB‡&W6WB—Ð¢6Æ74æÖSÒ&w&÷W&VÆF—fRfÆW‚fÆW‚Ö6öÂ&rÕ²3Sc…Ò7V7BÕ³Bó5Ò&÷&FW"&÷&FW"Öw&’Ós†÷fW#¦&÷&FW"Öw&’ÓS&÷VæFVBÖÆr6†F÷r×†Â†÷fW#§6†F÷rÓ'†Â†÷fW#§66ÆRÓR7W'6÷"×ö–çFW"G&ç6—F–öâÖÆÂGW&F–öâÓ#÷fW&fÆ÷rÖ†–FFVâFW‡BÖÆVgB ¢à¢ÆF—b6Æ74æÖSÒ'¢ÓÓ"&rÕ²3#C#c#•Ò&÷&FW"Ö"&÷&FW"Öw&’ÓsfÆW‚—FV×2Ö6VçFW"‚Ó2§W7F–g’Ö&WGvVVâ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"#à¢ÆF—b6Æ74æÖS×¶rÓ"‚Ó"&÷VæFVBÖgVÆÂG·&W6WBæ–BÓÓÒ&V×G’×v÷&¶fÆ÷r"ò&&rÖw&’ÓC"¢&&rÖ&ÇVRÓS'ÖÓãÂöF—cà¢Ç7â6Æ74æÖSÒ'FW‡BÕ³…ÒföçBÖ&öÆBFW‡BÖw&’Ó3WW&66RG&6¶–ær×v–FW"#ç·&W6WBæ–BÓÓÒ&V×G’×v÷&¶fÆ÷r"ò$äUr"¢%$U4UB'ÓÂ÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ#à¢ÆF—b6Æ74æÖSÒ'rÓãR‚ÓãR&÷VæFVBÖgVÆÂ&rÖw&’Óc#ãÂöF—cà¢ÆF—b6Æ74æÖSÒ'rÓãR‚ÓãR&÷VæFVBÖgVÆÂ&rÖw&’Óc#ãÂöF—cà¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ'¢ÓÓBfÆW‚fÆW‚Ö6öÂvÓ2‚ÖgVÆÂ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"¢ÓrÖgVÆÂ‚ÖgVÆÂ#à¢ÆF—b6Æ74æÖSÒ'FW‡B×v†—FRw&÷WÖ†÷fW#§FW‡BÖ&ÇVRÓCG&ç6—F–öâÖ6öÆ÷'2#à¢¶–6öäÖ·&W6WBæ–6öåÒÇÂÅ&”–çWDÖWF†öDÆ–æR6—¦S×³gÒóçÐ¢ÂöF—cà¢Æƒ26Æ74æÖSÒ'FW‡B×6ÒföçBÖÖVF—VÒFW‡B×v†—FRÆVF–ær×F–v‡Bw&÷WÖ†÷fW#§FW‡BÖ&ÇVRÓCG&ç6—F–öâÖ6öÆ÷'2#à¢·&W6WBçF—FÆWÐ¢Âöƒ3à¢ÂöF—cà¢·&W6WBæ–ÖvRbb€¢ÆF—b6Æ74æÖSÒ&'6öÇWFR–ç6WBÓ¢ÓrÖgVÆÂ‚ÖgVÆÂ&÷VæFVB÷fW&fÆ÷rÖ†–FFVâ&÷&FW"&÷&FW"Öw&’Óƒ#à¢Æ–Ör7&3×·&W6WBæ–ÖvWÒÇCÒ""6Æ74æÖSÒ'rÖgVÆÂ‚ÖgVÆÂö&¦V7BÖ6÷fW"÷6—G’Ósw&÷WÖ†÷fW#¦÷6—G’ÓG&ç6—F–öâÖ÷6—G’"óà¢ÆF—b6Æ74æÖSÒ&'6öÇWFR–ç6WBÓ¢ÓrÖgVÆÂ‚ÖgVÆÂ&rÖ&Æ6²óc#ãÂöF—cà¢ÂöF—cà¢—Ð¢·&W6WBæFW67&—F–öâbb€¢Ç6Æ74æÖSÒ'¢ÓFW‡BÕ³…ÒFW‡BÖw&’Ó3ÆVF–ær×&VÆ†VB&÷&FW"×B&÷&FW"Öw&’ÓSBÓ"×BÖWFò#à¢·&W6WBæFW67&—F–öçÐ¢Â÷à¢—Ð¢ÂöF—cà¢Âö'WGFöãà¢’—Ð¢ÂöF—cà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢7W&W74‡–G&F–öåv&æ–æs×·G'VWÐ¢öä6Æ–6³×²‚’Óâ6WD—5&W6WG4F—6Ö—76VB‡G'VR—Ð¢6Æ74æÖSÒ&×BÓB‚ÓR’Ó"&÷VæFVBÖgVÆÂ&rÖw&’Óƒóƒ†÷fW#¦&rÖw&’ÓsFW‡B×‡2FW‡BÖw&’Ó3föçBÖÖVF—VÒG&ç6—F–öâÖ6öÆ÷'2&÷&FW"&÷&FW"Öw&’Ós†÷fW#¦&÷&FW"Öw&’ÓS ¢à¢F—6Ö—72bVçFW"V×G’6çf0¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢—Ð¢¶–çFW&7F–öäÖöFRbb€¢Ä6†Ev–FvW@¢—4÷Vã×¶—46†D÷VçÐ¢FövvÆT6†C×²‚’Óâ6WD—46†D÷Vâ‚—46†D÷Vâ—Ð¢ÖW76vW3×¶6†DÖW76vW7Ð¢öå6VæDÖW76vS×¶†æFÆU6VæDÖW76vWÐ¢—4ÆöF–æs×¶—46†DÆöF–æwÐ¢öä6ÆV$†—7F÷'“×²‚’Óâ6WD6†DÖW76vW2…µÒ—Ð¢óà¢—Ð¢¶—46FVv÷'•÷W÷Vâbb€¢ÆF—b6Æ74æÖSÒ&f—†VB–ç6WBÓ¢Õ³ÒfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&rÖ&Æ6²óc&6¶G&÷Ö&ÇW"×6Ò‚ÓB#à¢ÆF—b6Æ74æÖSÒ&&rÕ²3#S#5Ò&÷&FW"&÷&FW"Öw&’Ós&÷VæFVBÓ'†ÂrÖgVÆÂÖ‚×rÖÖB6†F÷rÓ'†Â÷fW&fÆ÷rÖ†–FFVâæ–ÖFRÖ–âfFRÖ–â¦ööÒÖ–âGW&F–öâÓ##à¢ÆF—b6Æ74æÖSÒ'Ób#à¢Æƒ26Æ74æÖSÒ'FW‡BÖÆrföçB×6VÖ–&öÆBFW‡B×v†—FRÖ"ÓB#äVF—Bv÷&¶fÆ÷r6FVv÷'“Âöƒ3à¢ÆF—b6Æ74æÖSÒ'76R×’ÓB#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ"#à¢ÆÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2FW‡BÖw&’ÓCWW&66RG&6¶–ær×v–FW"#ä6FVv÷'’æÖSÂöÆ&VÃà¢Æ–çW@¢G—SÒ'FW‡B ¢fÇVS×¶6FVv÷'”–çWGÐ¢öä6†ævS×²†R’Óâ6WD6FVv÷'”–çWB†RçF&vWBçfÇVR—Ð¢Æ6V†öÆFW#Ò$VçFW"6FVv÷'’âââ ¢6Æ74æÖSÒ'rÖgVÆÂ‚ÓB’Ó2&rÕ²3Sc…Ò&÷&FW"&÷&FW"Öw&’Ós&÷VæFVB×†ÂFW‡B×v†—FRÆ6V†öÆFW"Öw&’ÓSfö7W3¦÷WFÆ–æRÖæöæRfö7W3§&–ærÓ"fö7W3§&–ærÖ&ÇVRÓSóS†÷fW#¦&÷&FW"Öw&’ÓcG&ç6—F–öâÖÆÂ ¢WFôfö7W0¢óà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ'ÓB&rÕ²3Sc…ÒóSfÆW‚—FV×2Ö6VçFW"§W7F–g’ÖVæBvÓ2&÷&FW"×B&÷&FW"Öw&’ÓsóS#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢7W&W74‡–G&F–öåv&æ–æs×·G'VWÐ¢öä6Æ–6³×²‚’Óâ6WD—46FVv÷'•÷W÷Vâ†fÇ6R—Ð¢6Æ74æÖSÒ'‚Ób’Ó"ãRFW‡B×6ÒföçBÖÖVF—VÒFW‡BÖw&’ÓC†÷fW#§FW‡B×v†—FR†÷fW#¦&rÖw&’Óƒ&÷VæFVB×†ÂG&ç6—F–öâÖÆÂ ¢à¢6æ6VÀ¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢7W&W74‡–G&F–öåv&æ–æs×·G'VWÐ¢öä6Æ–6³×¶†æFÆT6FVv÷'•6fWÐ¢6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"‚Ób’Ó"ãRFW‡B×6ÒföçBÖÖVF—VÒ&rÖ&ÇVRÓc†÷fW#¦&rÖ&ÇVRÓSFW‡B×v†—FR&÷VæFVB×†ÂG&ç6—F–öâÖÆÂ6†F÷rÖÆr6†F÷rÖ&ÇVRÓ“ó#7F—fS§66ÆRÓ“R ¢à¢ÄÖE6fR6—¦S×³‡Òóà¢6fR6FVv÷'¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢—Ð¢ÅFö7FW"óà¢ÂöF—cà¢“°§Ó° ¦W‡÷'BFVfVÇBæöFTfÆ÷s°