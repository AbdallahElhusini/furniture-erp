export const PROJECT_STATUSES = [
  "LEAD",
  "INSPECTION",
  "DESIGNING",
  "PENDING_APPROVAL",
  "APPROVED",
  "IN_PRODUCTION",
  "READY",
  "INSTALLING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_TYPES = [
  "SUPPLIER_FOLLOWUP",
  "DESIGN",
  "INSTALLATION",
  "DELIVERY",
  "INSPECTION",
  "GENERAL",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PROJECT_ITEM_STATUSES = [
  "PENDING",
  "ORDERED",
  "IN_PRODUCTION",
  "READY",
  "DELIVERED",
  "INSTALLED",
] as const;
export type ProjectItemStatus = (typeof PROJECT_ITEM_STATUSES)[number];

export const SUPPLIER_ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "IN_PRODUCTION",
  "READY",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type SupplierOrderStatus = (typeof SUPPLIER_ORDER_STATUSES)[number];

export type ParsedAssistantAction =
  | {
      kind: "CREATE_CLIENT";
      source: string;
      name: string;
      phone: string;
      company?: string;
      notes?: string;
    }
  | {
      kind: "CREATE_ORDER_BUNDLE";
      source: string;
      clientName: string;
      clientPhone: string;
      projectTitle: string;
      productSku: string;
      quantity: number;
      unitPrice?: number;
      unitCost?: number;
      supplierQuery?: string;
      clientCompany?: string;
      clientEmail?: string;
      clientAddress?: string;
      clientNotes?: string;
      projectPriority?: TaskPriority;
      projectNotes?: string;
      estimatedDelivery?: string;
      itemNotes?: string;
    }
  | {
      kind: "UPDATE_PROJECT_STATUS";
      source: string;
      projectRef: string;
      status: ProjectStatus;
    }
  | {
      kind: "CREATE_TASK";
      source: string;
      title: string;
      dueDate: string;
      projectRef?: string;
      priority: TaskPriority;
      taskType: TaskType;
      description?: string;
    }
  | {
      kind: "ADD_PROJECT_ITEM";
      source: string;
      projectRef: string;
      productSku: string;
      quantity: number;
      notes?: string;
    }
  | {
      kind: "UPDATE_CLIENT";
      source: string;
      clientRef: string;
      name?: string;
      phone?: string;
      company?: string | null;
      email?: string | null;
      address?: string | null;
      notes?: string | null;
    }
  | {
      kind: "DELETE_CLIENT";
      source: string;
      clientRef: string;
    }
  | {
      kind: "UPDATE_PROJECT";
      source: string;
      projectRef: string;
      title?: string;
      status?: ProjectStatus;
      priority?: TaskPriority;
      notes?: string | null;
      estimatedDelivery?: string | null;
    }
  | {
      kind: "DELETE_PROJECT";
      source: string;
      projectRef: string;
    }
  | {
      kind: "UPDATE_PROJECT_ITEM";
      source: string;
      projectRef: string;
      productSku: string;
      quantity?: number;
      status?: ProjectItemStatus;
      notes?: string | null;
    }
  | {
      kind: "REMOVE_PROJECT_ITEM";
      source: string;
      projectRef: string;
      productSku: string;
    }
  | {
      kind: "UPDATE_TASK";
      source: string;
      taskRef: string;
      title?: string;
      dueDate?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      taskType?: TaskType;
      description?: string | null;
    }
  | {
      kind: "DELETE_TASK";
      source: string;
      taskRef: string;
    }
  | {
      kind: "UPDATE_SUPPLIER_ORDER_STATUS";
      source: string;
      orderRef: string;
      status: SupplierOrderStatus;
    };

export type AssistantRisk = "LOW" | "MEDIUM" | "HIGH";

export interface CreateClientPayload {
  name: string;
  phone: string;
  company?: string;
  notes?: string;
}

export interface CreateOrderBundlePayload {
  client: {
    existingId: number | null;
    name: string;
    phone: string;
    company?: string;
    email?: string;
    address?: string;
    notes?: string;
  };
  project: {
    existingId: number | null;
    title: string;
    priority: TaskPriority;
    notes?: string;
    estimatedDelivery?: string;
  };
  catalogItem: {
    id: number;
    sku: string;
    nameAr: string;
    costPrice: number;
    sellingPrice: number;
    leadTimeDays: number;
  };
  quantity: number;
  supplier: { id: number; name: string } | null;
  supplierOverride?: boolean;
  itemNotes?: string;
  commercialOverrides?: {
    unitPrice: boolean;
    unitCost: boolean;
  };
}

export interface UpdateProjectStatusPayload {
  projectId: number;
  title: string;
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
}

export interface CreateTaskPayload {
  title: string;
  dueDate: string;
  projectId: number | null;
  projectTitle: string | null;
  priority: TaskPriority;
  taskType: TaskType;
  description?: string;
}

export interface AddProjectItemPayload {
  projectId: number;
  projectTitle: string;
  catalogItem: {
    id: number;
    sku: string;
    nameAr: string;
    costPrice: number;
    sellingPrice: number;
    leadTimeDays: number;
  };
  quantity: number;
  notes?: string;
}

export interface UpdateClientPayload {
  clientId: number;
  clientName: string;
  before: Record<string, string | null>;
  changes: Record<string, string | null>;
}

export interface DeleteClientPayload {
  clientId: number;
  clientName: string;
  phone: string;
  projectCount: number;
}

export interface UpdateProjectPayload {
  projectId: number;
  projectTitle: string;
  before: Record<string, string | null>;
  changes: Record<string, string | null>;
}

export interface DeleteProjectPayload {
  projectId: number;
  projectTitle: string;
  clientName: string;
  itemCount: number;
  taskCount: number;
  supplierOrderCount: number;
  paymentCount: number;
}

export interface UpdateProjectItemPayload {
  itemId: number;
  projectId: number;
  projectTitle: string;
  productSku: string;
  productName: string;
  before: { quantity: number; status: ProjectItemStatus; notes: string | null };
  changes: { quantity?: number; status?: ProjectItemStatus; notes?: string | null };
  linkedOrderItemCount: number;
}

export interface RemoveProjectItemPayload {
  itemId: number;
  projectId: number;
  projectTitle: string;
  productSku: string;
  productName: string;
  quantity: number;
  linkedOrderItemCount: number;
}

export interface UpdateTaskPayload {
  taskId: number;
  taskTitle: string;
  before: Record<string, string | null>;
  changes: Record<string, string | null>;
}

export interface DeleteTaskPayload {
  taskId: number;
  taskTitle: string;
  projectTitle: string | null;
}

export interface UpdateSupplierOrderStatusPayload {
  orderId: number;
  supplierName: string;
  projectTitle: string;
  fromStatus: SupplierOrderStatus;
  toStatus: SupplierOrderStatus;
}

export type ResolvedAssistantPayload =
  | CreateClientPayload
  | CreateOrderBundlePayload
  | UpdateProjectStatusPayload
  | CreateTaskPayload
  | AddProjectItemPayload
  | UpdateClientPayload
  | DeleteClientPayload
  | UpdateProjectPayload
  | DeleteProjectPayload
  | UpdateProjectItemPayload
  | RemoveProjectItemPayload
  | UpdateTaskPayload
  | DeleteTaskPayload
  | UpdateSupplierOrderStatusPayload;

export interface AssistantFieldDetail {
  label: string;
  value: string;
  previousValue?: string;
}

export interface AssistantPlanAction {
  id: string;
  kind: ParsedAssistantAction["kind"];
  title: string;
  description: string;
  risk: AssistantRisk;
  details: AssistantFieldDetail[];
  payload: ResolvedAssistantPayload;
}

export interface AssistantOperationContractInfo {
  schemaVersion: string;
  contractVersion: number;
  hash: string;
}

export interface AssistantModelBinding {
  activeModelKey: string;
  baseModel: string;
  baseModelRevision: string;
  baseModelArtifactSha256: string;
  modelIdentitySha256: string;
  adapter: string;
  adapterModelSha256: string;
  adapterConfigSha256: string;
  adapterManifestSha256: string;
  evaluationReportSha256: string;
  readinessSemanticSha256: string;
  promptSha256: string;
  promotionVerified: true;
}

export interface AssistantPlan {
  version: 2;
  planId: string;
  actorId: number;
  actorEmail: string;
  createdAt: string;
  expiresAt: string;
  operationContract: AssistantOperationContractInfo;
  modelBinding: AssistantModelBinding | null;
  actions: AssistantPlanAction[];
  warnings: string[];
}

export interface AssistantPreview {
  understood: boolean;
  actions: AssistantPlanAction[];
  warnings: string[];
  blockingIssues: string[];
  planToken: string | null;
  expiresAt: string | null;
  conversation?: {
    reply: string;
    summary: string | null;
    needsReply: boolean;
    links?: Array<{ label: string; href: string }>;
    questions: Array<{ field: string; text: string; suggestions: Array<{ label: string; message: string }> }>;
  };
  operationContract: AssistantOperationContractInfo;
  run?: {
    conversationId: string;
    runId: string;
    status: string;
    planRevision: number | null;
    planHash: string | null;
  };
  retrieval: {
    matches: Array<{
      kind: "client" | "project" | "product" | "task" | "supplier-order" | "supplier";
      ref: string;
      label: string;
    }>;
  };
  extractor: {
    mode: "deterministic" | "local-model" | "deterministic-fallback";
    localModelAvailable: boolean | null;
    model: string | null;
    latencyMs: number | null;
    modelBinding: AssistantModelBinding | null;
  };
}

export interface AssistantApplyResult {
  duplicate: boolean;
  jobId: number;
  status: string;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  backupFile: string | null;
  summary: string[];
}
