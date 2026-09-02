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

export type UserRole = 'admin' | 'sales';

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
