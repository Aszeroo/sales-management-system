export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sales {
  id: string;
  user_id: string;
  sales_code: string;
  full_name: string;
  username: string;
  email: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Customer {
  id: string;
  customer_code: string;
  customer_name: string;
  company_name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  description: string;
  sales_id: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Project {
  id: string;
  project_code: string;
  project_name: string;
  customer_id: string;
  description: string;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  status: 'planning' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Exactly three roles (ADR-0001). Role comes from user metadata; Admin is
// never Owner-capable, Sales and Manager each own a sales row.
export type UserRole = 'admin' | 'manager' | 'sales';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  user_metadata: {
    role: UserRole;
    full_name?: string;
  };
}

// Extended types with joins
export interface SalesWithCounts extends Sales {
  customer_count?: number;
  project_count?: number;
  total_budget?: number;
}

export interface CustomerWithCounts extends Customer {
  project_count?: number;
  total_budget?: number;
  sales?: Sales;
}

export interface ProjectWithCustomer extends Project {
  customer?: Customer;
}

// Unified user-management row (issue #7). Shaped by the admin_list_users
// RPC: every User of every role in one list — admins included, who have no
// sales row (ADR-0001). `is_active` mirrors the real ban state
// (auth.users.banned_until), not just a display flag.
export interface ManagedUser {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  sales_id: string | null;
  sales_code: string | null;
  created_at: string;
}

// Dashboard stats
export interface AdminDashboardStats {
  totalSales: number;
  totalCustomers: number;
  totalProjects: number;
  totalBudget: number;
  budgetBySales: { name: string; budget: number }[];
  projectsByStatus: { name: string; value: number }[];
  customersBySales: { name: string; count: number }[];
}

export interface SalesDashboardStats {
  myCustomers: number;
  myProjects: number;
  myTotalBudget: number;
  projectsByStatus: { name: string; value: number }[];
  recentProjects: ProjectWithCustomer[];
}

// Role-true dashboard data (issue #6). `scope` states whose reality the
// numbers describe — 'own' covers only the current Sales user's customers and
// projects, 'org' covers the whole system (Manager/Admin). Labels must match
// the scope: org-wide numbers must never be captioned "my …" and vice versa.
export type DashboardScope = 'own' | 'org';

export interface OwnDashboardData {
  scope: 'own';
  /** The current user's Sales Owner row (ADR-0001) — null when they have none. */
  salesId: string | null;
  customers: CustomerWithCounts[];
  projects: ProjectWithCustomer[];
}

export interface OrgDashboardData {
  scope: 'org';
  salesList: SalesWithCounts[];
  totalCustomers: number;
  totalProjects: number;
  totalBudget: number;
}

export type DashboardData = OwnDashboardData | OrgDashboardData;
