import type {
  Client,
  Project,
  ProjectItem,
  Supplier,
  SupplierOrder,
  OrderItem,
  Category,
  CatalogItem,
  Technician,
  Task,
  QuoteRequest,
  QuoteItem,
  PortfolioProject,
  Payment,
  User,
  Setting,
  Prisma,
} from '@prisma/client';

// ==========================================
// 1. RE-EXPORT BASE PRISMA TYPES
// ==========================================
export type {
  Client,
  Project,
  ProjectItem,
  Supplier,
  SupplierOrder,
  OrderItem,
  Category,
  CatalogItem,
  Technician,
  Task,
  QuoteRequest,
  QuoteItem,
  PortfolioProject,
  Payment,
  User,
  Setting,
};

// ==========================================
// 2. ENUMS & CONSTANT UNION TYPES
// ==========================================

export type ProjectStatus =
  | 'LEAD'
  | 'INSPECTION'
  | 'DESIGNING'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'INSTALLING'
  | 'COMPLETED'
  | 'CANCELLED';

export const PROJECT_STATUSES: Record<ProjectStatus, { labelAr: string; labelEn: string; color: string }> = {
  LEAD: { labelAr: 'عميل محتمل', labelEn: 'Lead', color: 'bg-gray-100 text-gray-700' },
  INSPECTION: { labelAr: 'معاينة', labelEn: 'Inspection', color: 'bg-blue-100 text-blue-700' },
  DESIGNING: { labelAr: 'جاري التصميم', labelEn: 'Designing', color: 'bg-purple-100 text-purple-700' },
  PENDING_APPROVAL: { labelAr: 'في انتظار الموافقة', labelEn: 'Pending Approval', color: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { labelAr: 'تمت الموافقة', labelEn: 'Approved', color: 'bg-green-100 text-green-700' },
  IN_PRODUCTION: { labelAr: 'جاري التصنيع', labelEn: 'In Production', color: 'bg-orange-100 text-orange-700' },
  READY: { labelAr: 'جاهز للتسليم', labelEn: 'Ready', color: 'bg-emerald-100 text-emerald-700' },
  INSTALLING: { labelAr: 'جاري التركيب', labelEn: 'Installing', color: 'bg-indigo-100 text-indigo-700' },
  COMPLETED: { labelAr: 'مكتمل', labelEn: 'Completed', color: 'bg-green-100 text-green-800' },
  CANCELLED: { labelAr: 'ملغي', labelEn: 'Cancelled', color: 'bg-red-100 text-red-700' },
};

export type ProjectType = 'LARGE_PROJECT' | 'SIMPLE_ORDER';

export const PROJECT_TYPES: Record<ProjectType, { labelAr: string; labelEn: string }> = {
  LARGE_PROJECT: { labelAr: 'مشروع كبير', labelEn: 'Large Project' },
  SIMPLE_ORDER: { labelAr: 'طلب بسيط', labelEn: 'Simple Order' },
};

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const PRIORITIES: Record<Priority, { labelAr: string; labelEn: string; color: string }> = {
  LOW: { labelAr: 'منخفض', labelEn: 'Low', color: 'bg-gray-100 text-gray-600' },
  MEDIUM: { labelAr: 'متوسط', labelEn: 'Medium', color: 'bg-blue-100 text-blue-600' },
  HIGH: { labelAr: 'عالي', labelEn: 'High', color: 'bg-orange-100 text-orange-600' },
  URGENT: { labelAr: 'عاجل', labelEn: 'Urgent', color: 'bg-red-100 text-red-600' },
};

export type ProjectItemStatus =
  | 'PENDING'
  | 'ORDERED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'DELIVERED'
  | 'INSTALLED';

export const PROJECT_ITEM_STATUSES: Record<ProjectItemStatus, { labelAr: string; labelEn: string }> = {
  PENDING: { labelAr: 'معلق', labelEn: 'Pending' },
  ORDERED: { labelAr: 'تم الطلب من المورد', labelEn: 'Ordered' },
  IN_PRODUCTION: { labelAr: 'قيد التصنيع بالمصنع', labelEn: 'In Production' },
  READY: { labelAr: 'جاهز للاستلام', labelEn: 'Ready' },
  DELIVERED: { labelAr: 'تم التسليم بالموقع', labelEn: 'Delivered' },
  INSTALLED: { labelAr: 'تم التركيب', labelEn: 'Installed' },
};

export type SupplierOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'SHIPPED'
  | 'DELIVERED';

export const SUPPLIER_ORDER_STATUSES: Record<SupplierOrderStatus, { labelAr: string; labelEn: string; color: string }> = {
  PENDING: { labelAr: 'معلق', labelEn: 'Pending', color: 'bg-gray-100 text-gray-700' },
  CONFIRMED: { labelAr: 'مؤكد', labelEn: 'Confirmed', color: 'bg-blue-100 text-blue-700' },
  IN_PRODUCTION: { labelAr: 'جاري التصنيع', labelEn: 'In Production', color: 'bg-orange-100 text-orange-700' },
  READY: { labelAr: 'جاهز للاستلام', labelEn: 'Ready', color: 'bg-emerald-100 text-emerald-700' },
  SHIPPED: { labelAr: 'تم الشحن', labelEn: 'Shipped', color: 'bg-indigo-100 text-indigo-700' },
  DELIVERED: { labelAr: 'تم الاستلام', labelEn: 'Delivered', color: 'bg-green-100 text-green-700' },
};

export type TaskType =
  | 'SUPPLIER_FOLLOWUP'
  | 'DESIGN'
  | 'INSTALLATION'
  | 'DELIVERY'
  | 'INSPECTION'
  | 'GENERAL';

export const TASK_TYPES: Record<TaskType, { labelAr: string; labelEn: string; icon: string }> = {
  SUPPLIER_FOLLOWUP: { labelAr: 'متابعة موردين', labelEn: 'Supplier Follow-up', icon: '🏭' },
  DESIGN: { labelAr: 'تصميم', labelEn: 'Design', icon: '🎨' },
  INSTALLATION: { labelAr: 'تركيب', labelEn: 'Installation', icon: '🔧' },
  DELIVERY: { labelAr: 'توصيل وشحن', labelEn: 'Delivery', icon: '🚚' },
  INSPECTION: { labelAr: 'معاينة موقع', labelEn: 'Inspection', icon: '📋' },
  GENERAL: { labelAr: 'مهمة عامة', labelEn: 'General Task', icon: '📌' },
};

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export const TASK_STATUSES: Record<TaskStatus, { labelAr: string; labelEn: string; color: string }> = {
  TODO: { labelAr: 'للتنفيذ', labelEn: 'To Do', color: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { labelAr: 'قيد التنفيذ', labelEn: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  DONE: { labelAr: 'مكتملة', labelEn: 'Done', color: 'bg-green-100 text-green-700' },
};

export type QuoteStatus = 'NEW' | 'CONTACTED' | 'QUOTED' | 'CONVERTED' | 'REJECTED';

export const QUOTE_STATUSES: Record<QuoteStatus, { labelAr: string; labelEn: string; color: string }> = {
  NEW: { labelAr: 'جديد', labelEn: 'New', color: 'bg-blue-100 text-blue-700' },
  CONTACTED: { labelAr: 'تم التواصل', labelEn: 'Contacted', color: 'bg-yellow-100 text-yellow-700' },
  QUOTED: { labelAr: 'تم تقديم العرض', labelEn: 'Quoted', color: 'bg-purple-100 text-purple-700' },
  CONVERTED: { labelAr: 'تم التحويل لمشروع', labelEn: 'Converted', color: 'bg-green-100 text-green-700' },
  REJECTED: { labelAr: 'مرفوض', labelEn: 'Rejected', color: 'bg-red-100 text-red-700' },
};

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK';

export const PAYMENT_METHODS: Record<PaymentMethod, { labelAr: string; labelEn: string }> = {
  CASH: { labelAr: 'نقدي', labelEn: 'Cash' },
  BANK_TRANSFER: { labelAr: 'تحويل بنكي', labelEn: 'Bank Transfer' },
  CHECK: { labelAr: 'شيك مصرفي', labelEn: 'Check' },
};

export type UserRole = 'ADMIN' | 'MANAGER' | 'DESIGNER' | 'TECHNICIAN';

export const USER_ROLES: Record<UserRole, { labelAr: string; labelEn: string }> = {
  ADMIN: { labelAr: 'مدير النظام', labelEn: 'Administrator' },
  MANAGER: { labelAr: 'مدير العمليات', labelEn: 'Operations Manager' },
  DESIGNER: { labelAr: 'مصمم داخلي', labelEn: 'Interior Designer' },
  TECHNICIAN: { labelAr: 'فني تنفيذ وتركيب', labelEn: 'Technician' },
};

// ==========================================
// 3. PRISMA MODELS WITH RELATIONS
// ==========================================

export type CatalogItemWithRelations = CatalogItem & {
  category?: Category | null;
  supplier?: Supplier | null;
  projectItems?: ProjectItem[];
  quoteItems?: QuoteItem[];
};

export type CategoryWithRelations = Category & {
  items?: CatalogItem[];
  _count?: {
    items: number;
  };
};

export type OrderItemWithRelations = OrderItem & {
  supplierOrder?: SupplierOrder | null;
  projectItem: ProjectItem & {
    catalogItem: CatalogItem;
  };
};

export type SupplierOrderWithRelations = SupplierOrder & {
  supplier: Supplier;
  project: Project;
  items: OrderItemWithRelations[];
};

export type SupplierWithRelations = Supplier & {
  catalogItems?: CatalogItem[];
  supplierOrders?: (SupplierOrder & {
    project: Project;
    items: OrderItem[];
  })[];
  _count?: {
    catalogItems: number;
    supplierOrders: number;
  };
};

export type ProjectItemWithRelations = ProjectItem & {
  catalogItem: CatalogItem & {
    category?: Category | null;
    supplier?: Supplier | null;
  };
  project?: Project;
  orderItems?: (OrderItem & {
    supplierOrder: SupplierOrder & {
      supplier: Supplier;
    };
  })[];
};

export type TaskWithRelations = Task & {
  project?: (Project & { client: Client }) | null;
  technician?: Technician | null;
};

export type TechnicianWithRelations = Technician & {
  tasks?: (Task & {
    project?: Project | null;
  })[];
  _count?: {
    tasks: number;
  };
};

export type PaymentWithRelations = Payment & {
  project: Project & {
    client: Client;
  };
};

export type QuoteItemWithRelations = QuoteItem & {
  quote?: QuoteRequest;
  catalogItem: CatalogItem & {
    category?: Category | null;
    supplier?: Supplier | null;
  };
};

export type QuoteRequestWithRelations = QuoteRequest & {
  items: QuoteItemWithRelations[];
};

export type ProjectWithRelations = Project & {
  client: Client;
  items: ProjectItemWithRelations[];
  supplierOrders: (SupplierOrder & {
    supplier: Supplier;
    items: (OrderItem & {
      projectItem: ProjectItem & {
        catalogItem: CatalogItem;
      };
    })[];
  })[];
  tasks: (Task & {
    technician?: Technician | null;
  })[];
  payments: Payment[];
};

export type ClientWithRelations = Client & {
  projects: (Project & {
    items: ProjectItem[];
    payments: Payment[];
  })[];
  _count?: {
    projects: number;
  };
};

// ==========================================
// 4. SYNC ENGINE & TIMELINE TYPES
// ==========================================

export type MilestoneStatus = 'completed' | 'in_progress' | 'pending' | 'overdue';

export interface TimelineMilestone {
  id: string;
  phaseOrder: number;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  plannedDate: Date | null;
  actualDate: Date | null;
  status: MilestoneStatus;
  progress: number; // 0 to 100
  icon: string;
  tasks?: Task[];
}

export interface ProjectTimeline {
  projectId: number;
  projectTitle: string;
  clientName: string;
  projectType: ProjectType;
  status: ProjectStatus;
  priority: Priority;
  progressPercentage: number;
  currentPhase: string;
  isDelayed: boolean;
  daysRemaining: number;
  createdAt: Date;
  inspectionDate: Date | null;
  designDeadline: Date | null;
  approvalDate: Date | null;
  syncDate: Date | null;
  estimatedDelivery: Date | null;
  milestones: TimelineMilestone[];
  bottlenecks: string[];
}

export interface SyncStatusItem {
  id: number; // projectItem id
  catalogItemId: number;
  nameAr: string;
  nameEn: string;
  sku: string;
  categoryNameAr?: string;
  supplierId: number | null;
  supplierName: string | null;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  leadTimeDays: number;
  status: ProjectItemStatus;
  isReady: boolean;
  supplierOrderId: number | null;
  supplierOrderStatus: SupplierOrderStatus | null;
  expectedDeliveryDate: Date | null;
  daysRemaining: number;
  isBottleneck: boolean;
}

export interface ProjectSyncStatus {
  projectId: number;
  projectTitle: string;
  projectStatus: ProjectStatus;
  isFullySynced: boolean;
  totalItems: number;
  readyItemsCount: number;
  inProductionItemsCount: number;
  orderedItemsCount: number;
  pendingItemsCount: number;
  completionPercentage: number;
  longestLeadTimeDays: number;
  bottleneckItem: SyncStatusItem | null;
  calculatedSyncDate: Date | null;
  estimatedDelivery: Date | null;
  items: SyncStatusItem[];
  supplierOrders: Array<{
    id: number;
    supplierId: number;
    supplierName: string;
    status: SupplierOrderStatus;
    orderDate: Date;
    expectedDate: Date | null;
    totalAmount: number;
    amountPaid: number;
    itemsCount: number;
    isReady: boolean;
  }>;
}

export interface SupplierDispatchResult {
  success: boolean;
  projectId: number;
  message: string;
  createdOrdersCount: number;
  totalSuppliersInvolved: number;
  dispatchedOrders: Array<{
    supplierOrderId: number;
    supplierId: number;
    supplierName: string;
    itemsCount: number;
    totalAmount: number;
    maxLeadTimeDays: number;
    expectedDeliveryDate: Date;
  }>;
  unassignedItemsCount: number;
  calculatedSyncDate: Date;
}

// ==========================================
// 5. REPORTING & EXPORT TYPES
// ==========================================

export interface SupplierCostReportItem {
  supplierId: number;
  supplierName: string;
  contactPerson: string;
  phone: string;
  specialization: string;
  ordersCount: number;
  totalOrderedAmount: number;
  totalAmountPaid: number;
  remainingBalance: number;
  qualityRating: number;
  deliveryRating: number;
  recentOrders: Array<{
    orderId: number;
    projectId: number;
    projectTitle: string;
    orderDate: Date;
    expectedDate: Date | null;
    status: string;
    amount: number;
    paid: number;
  }>;
}

export interface SupplierCostReportSummary {
  startDate: Date;
  endDate: Date;
  totalSuppliers: number;
  totalOrdersCount: number;
  grandTotalCost: number;
  grandTotalPaid: number;
  grandTotalRemaining: number;
  suppliers: SupplierCostReportItem[];
}

export interface ClientRevenueReportItem {
  projectId: number;
  projectTitle: string;
  projectType: string;
  projectStatus: string;
  clientName: string;
  company: string;
  phone: string;
  totalPrice: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPercentage: number;
  amountPaid: number;
  remainingBalance: number;
  shippingCost: number;
  installationCost: number;
  createdAt: Date;
  estimatedDelivery: Date | null;
  paymentsCount: number;
}

export interface ClientRevenueReportSummary {
  startDate: Date;
  endDate: Date;
  totalProjects: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageMarginPercentage: number;
  totalCollected: number;
  totalOutstanding: number;
  totalShippingCost: number;
  totalInstallationCost: number;
  projects: ClientRevenueReportItem[];
}

export interface ShippingReportItem {
  projectId: number;
  projectTitle: string;
  clientName: string;
  clientAddress: string;
  projectStatus: string;
  shippingCost: number;
  installationCost: number;
  totalLogisticsCost: number;
  deliveryDate: Date | null;
  techniciansAssigned: string[];
  tasksCount: number;
  completedTasksCount: number;
}

export interface ShippingReportSummary {
  startDate: Date;
  endDate: Date;
  totalProjects: number;
  grandTotalShippingCost: number;
  grandTotalInstallationCost: number;
  grandTotalLogisticsCost: number;
  totalInstallationsCompleted: number;
  totalInstallationsPending: number;
  projects: ShippingReportItem[];
}

export interface ProjectDetailedReport {
  project: ProjectWithRelations;
  syncStatus: ProjectSyncStatus;
  timeline: ProjectTimeline;
  financialSummary: {
    totalPrice: number;
    totalCost: number;
    grossProfit: number;
    grossMarginPercentage: number;
    amountPaid: number;
    remainingBalance: number;
    shippingCost: number;
    installationCost: number;
    netProfit: number;
  };
}

// ==========================================
// 6. FORM DATA & INPUT DTO TYPES
// ==========================================

export interface CreateClientInput {
  name: string;
  company?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface UpdateClientInput extends Partial<CreateClientInput> {
  id: number;
}

export interface CreateProjectItemInput {
  catalogItemId: number;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  status?: ProjectItemStatus;
  notes?: string | null;
  leadTimeDays?: number;
}

export interface UpdateProjectItemInput extends Partial<CreateProjectItemInput> {
  id?: number;
}

export interface CreateProjectInput {
  clientId: number;
  title: string;
  type?: ProjectType;
  status?: ProjectStatus;
  inspectionDate?: Date | string | null;
  designDeadline?: Date | string | null;
  approvalDate?: Date | string | null;
  estimatedDelivery?: Date | string | null;
  shippingCost?: number;
  installationCost?: number;
  priority?: Priority;
  notes?: string | null;
  items?: CreateProjectItemInput[];
}

export interface UpdateProjectInput extends Partial<Omit<CreateProjectInput, 'items'>> {
  id: number;
  items?: (CreateProjectItemInput & { id?: number })[];
  totalCost?: number;
  totalPrice?: number;
  amountPaid?: number;
  syncDate?: Date | string | null;
}

export interface CreateSupplierInput {
  name: string;
  contactPerson?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  specialization?: string | null;
  qualityRating?: number;
  deliveryRating?: number;
  notes?: string | null;
  isActive?: boolean;
}

export interface UpdateSupplierInput extends Partial<CreateSupplierInput> {
  id: number;
}

export interface CreateSupplierOrderInput {
  supplierId: number;
  projectId: number;
  status?: SupplierOrderStatus;
  expectedDate?: Date | string | null;
  totalAmount?: number;
  amountPaid?: number;
  notes?: string | null;
  itemIds?: number[]; // projectItem ids
}

export interface UpdateSupplierOrderInput extends Partial<CreateSupplierOrderInput> {
  id: number;
  actualDeliveryDate?: Date | string | null;
}

export interface CreateCatalogItemInput {
  categoryId: number;
  supplierId?: number | null;
  nameAr: string;
  nameEn: string;
  sku: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  costPrice: number;
  sellingPrice: number;
  leadTimeDays?: number;
  dimensions?: string | null;
  material?: string | null;
  color?: string | null;
  images?: string; // JSON array string
  specifications?: string | null; // JSON string
  isActive?: boolean;
  isFeatured?: boolean;
}

export interface UpdateCatalogItemInput extends Partial<CreateCatalogItemInput> {
  id: number;
}

export interface CreateCategoryInput {
  nameAr: string;
  nameEn: string;
  slug: string;
  image?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateCategoryInput extends Partial<CreateCategoryInput> {
  id: number;
}

export interface CreateTechnicianInput {
  name: string;
  phone: string;
  specialization?: string | null;
  isAvailable?: boolean;
  dailyRate?: number;
  notes?: string | null;
}

export interface UpdateTechnicianInput extends Partial<CreateTechnicianInput> {
  id: number;
}

export interface CreateTaskInput {
  projectId?: number | null;
  technicianId?: number | null;
  type: TaskType;
  title: string;
  description?: string | null;
  dueDate: Date | string;
  status?: TaskStatus;
  priority?: Priority;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  id: number;
}

export interface CreateQuoteItemInput {
  catalogItemId: number;
  quantity: number;
}

export interface CreateQuoteRequestInput {
  clientName: string;
  clientEmail?: string | null;
  clientPhone: string;
  company?: string | null;
  message?: string | null;
  items?: CreateQuoteItemInput[];
}

export interface UpdateQuoteRequestInput extends Partial<CreateQuoteRequestInput> {
  id: number;
  status?: QuoteStatus;
  totalEstimate?: number;
}

export interface CreatePaymentInput {
  projectId: number;
  amount: number;
  method?: PaymentMethod;
  notes?: string | null;
  date?: Date | string;
}

export interface UpdatePaymentInput extends Partial<CreatePaymentInput> {
  id: number;
}

export interface CreatePortfolioProjectInput {
  titleAr: string;
  titleEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  clientName?: string | null;
  location?: string | null;
  images?: string;
  isFeatured?: boolean;
  sortOrder?: number;
}

export interface UpdatePortfolioProjectInput extends Partial<CreatePortfolioProjectInput> {
  id: number;
}

// ==========================================
// 7. API RESPONSE TYPES
// ==========================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface DashboardMetrics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalClients: number;
  totalSuppliers: number;
  totalCatalogItems: number;
  totalRevenue: number;
  totalCost: number;
  totalCollected: number;
  totalPendingReceivables: number;
  totalSupplierPayables: number;
  overdueTasksCount: number;
  pendingQuotesCount: number;
  projectsByStatus: Record<ProjectStatus, number>;
  tasksByStatus: Record<TaskStatus, number>;
  recentProjects: ProjectWithRelations[];
  upcomingTasks: TaskWithRelations[];
}
