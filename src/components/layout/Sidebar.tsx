import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCog,
  FolderKanban,
  BriefcaseBusiness,
  User,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Globe,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}

export function Sidebar({ collapsed, onToggle, onCloseMobile }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const { isAdmin, signOut } = useAuth();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'th' : 'en';
    i18n.changeLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  const navItems = [
    { path: '/dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard },
    { path: '/sales', label: t('sidebar.sales'), icon: Users },
    { path: '/customers', label: t('sidebar.customers'), icon: BriefcaseBusiness },
    { path: '/projects', label: t('sidebar.projects'), icon: FolderKanban },
    { path: '/profile', label: t('sidebar.myProfile'), icon: User },
  ];

  const adminItems = [
    { path: '/admin/sales', label: t('sidebar.salesManagement'), icon: UserCog },
    { path: '/admin/customers', label: t('sidebar.customerManagement'), icon: BriefcaseBusiness },
    { path: '/admin/projects', label: t('sidebar.projectManagement'), icon: FolderKanban },
  ];

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  return (
    <aside
      className={`h-full bg-slate-900 text-white transition-all duration-300 flex flex-col ${
        collapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700/50">
        {!collapsed && (
          <span className="text-lg font-bold text-white truncate">SMS</span>
        )}
        <div className="flex items-center gap-1">
          {/* Mobile close button */}
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors lg:hidden"
          >
            <X size={18} />
          </button>
          {/* Desktop collapse toggle */}
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors hidden lg:block"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={onCloseMobile}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.path)
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={20} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className={`my-3 border-t border-slate-700/50 ${collapsed ? 'mx-2' : ''}`} />
            {!collapsed && (
              <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t('sidebar.adminManagement')}
              </div>
            )}
            {adminItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.path)
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={20} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-slate-700/50 p-2 space-y-1">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
          title={collapsed ? (i18n.language === 'en' ? 'ไทย' : 'English') : undefined}
        >
          <Globe size={20} className="shrink-0" />
          {!collapsed && (
            <span>{i18n.language === 'en' ? 'ไทย' : 'English'}</span>
          )}
        </button>
        <button
          onClick={() => {
            signOut();
            onCloseMobile?.();
          }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors"
          title={collapsed ? t('common.logout') : undefined}
        >
          <LogOut size={20} className="shrink-0" />
          {!collapsed && <span>{t('common.logout')}</span>}
        </button>
      </div>
    </aside>
  );
}
