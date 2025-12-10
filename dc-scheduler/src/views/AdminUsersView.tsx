import { useState, useEffect, useCallback } from 'react';
import { 
  Users, Plus, Search, Edit2, Trash2, UserCheck, UserX, 
  Shield, Briefcase, HardHat, User as UserIcon, Loader2, AlertCircle,
  Link as LinkIcon, Unlink
} from 'lucide-react';
import { api } from '../api/client';
import type { User, UserRole } from '../stores/authStore';
import { roleLabels, roleColors } from '../stores/authStore';
import { useEngineerStore } from '../stores/engineerStore';
import clsx from 'clsx';

interface UserFormData {
  login: string;
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}

const emptyForm: UserFormData = {
  login: '',
  email: '',
  password: '',
  fullName: '',
  role: 'TRP',
};

const roleIcons: Record<UserRole, React.ComponentType<{ size?: number; className?: string }>> = {
  ADMIN: Shield,
  EXPERT: Briefcase,
  TRP: UserIcon,
  ENGINEER: HardHat,
};

export function AdminUsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  
  // Link engineer modal
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkingUser, setLinkingUser] = useState<User | null>(null);
  const [selectedEngineerId, setSelectedEngineerId] = useState('');
  
  const { engineers, fetchEngineers } = useEngineerStore();

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.users.list({
        search: search || undefined,
        role: roleFilter || undefined,
      });
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    fetchUsers();
    fetchEngineers();
  }, [fetchUsers, fetchEngineers]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      login: user.login,
      email: user.email,
      password: '',
      fullName: user.fullName || '',
      role: user.role,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (editingUser) {
        await api.users.update(editingUser.id, {
          email: formData.email,
          fullName: formData.fullName || undefined,
          role: formData.role,
          password: formData.password || undefined,
        });
      } else {
        await api.users.create({
          login: formData.login,
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName || undefined,
          role: formData.role,
        });
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await api.users.update(user.id, { isActive: !user.isActive });
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Удалить пользователя ${user.login}?`)) return;
    try {
      await api.users.delete(user.id);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  };

  const openLinkModal = (user: User) => {
    setLinkingUser(user);
    setSelectedEngineerId('');
    setLinkModalOpen(true);
  };

  const handleLinkEngineer = async () => {
    if (!linkingUser || !selectedEngineerId) return;
    try {
      await api.users.linkEngineer(linkingUser.id, selectedEngineerId);
      setLinkModalOpen(false);
      fetchUsers();
      fetchEngineers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка связывания');
    }
  };

  const handleUnlinkEngineer = async (user: User) => {
    try {
      await api.users.unlinkEngineer(user.id);
      fetchUsers();
      fetchEngineers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отвязки');
    }
  };

  // Найти инженера связанного с пользователем
  const getLinkedEngineer = (userId: string) => {
    return engineers.find(e => (e as any).userId === userId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Управление пользователями</h1>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary">
          <Plus size={20} />
          Добавить
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск по логину, email, имени..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
          className="input w-40"
        >
          <option value="">Все роли</option>
          {(Object.keys(roleLabels) as UserRole[]).map(role => (
            <option key={role} value={role}>{roleLabels[role]}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <AlertCircle size={18} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-sm underline">Закрыть</button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Пользователь</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Роль</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Статус</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Инженер</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const RoleIcon = roleIcons[user.role];
                const linkedEngineer = getLinkedEngineer(user.id);
                return (
                  <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div>
                        <div className="font-medium text-foreground">{user.fullName || user.login}</div>
                        <div className="text-sm text-muted-foreground">@{user.login}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-foreground">{user.email}</td>
                    <td className="py-3 px-4">
                      <span className={clsx(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                        roleColors[user.role]
                      )}>
                        <RoleIcon size={16} />
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400">
                          <UserCheck className="w-5 h-5" />
                          Активен
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
                          <UserX className="w-5 h-5" />
                          Заблокирован
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {linkedEngineer ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{linkedEngineer.name}</span>
                          <button
                            onClick={() => handleUnlinkEngineer(user)}
                            className="text-muted-foreground hover:text-red-500"
                            title="Отвязать от инженера"
                          >
                            <Unlink className="w-5 h-5" />
                          </button>
                        </div>
                      ) : user.role === 'ENGINEER' ? (
                        <button
                          onClick={() => openLinkModal(user)}
                          className="text-sm text-primary hover:underline flex items-center gap-1.5"
                          title="Связать с инженером"
                        >
                          <LinkIcon className="w-5 h-5" />
                          Связать
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleActive(user)}
                          className={clsx(
                            "btn-ghost rounded-lg h-12 w-12 flex items-center justify-center",
                            user.isActive ? "text-yellow-600 hover:text-yellow-700" : "text-green-600 hover:text-green-700"
                          )}
                          title={user.isActive ? "Заблокировать" : "Разблокировать"}
                        >
                          {user.isActive ? <UserX className="w-6 h-6" /> : <UserCheck className="w-6 h-6" />}
                        </button>
                        <button
                          onClick={() => openEditModal(user)}
                          className="btn-ghost rounded-lg h-12 w-12 flex items-center justify-center text-muted-foreground hover:text-foreground"
                          title="Редактировать"
                        >
                          <Edit2 className="w-6 h-6" />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="btn-ghost rounded-lg h-12 w-12 flex items-center justify-center text-muted-foreground hover:text-red-500"
                          title="Удалить"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Пользователи не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              {editingUser ? 'Редактировать пользователя' : 'Новый пользователь'}
            </h2>
            
            <div className="space-y-4">
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Логин *</label>
                  <input
                    type="text"
                    value={formData.login}
                    onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                    className="input w-full"
                    placeholder="username"
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input w-full"
                  placeholder="user@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ФИО</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="input w-full"
                  placeholder="Иванов Иван Иванович"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {editingUser ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль *'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input w-full"
                  placeholder="••••••••"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Роль *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="input w-full"
                >
                  {(Object.keys(roleLabels) as UserRole[]).map(role => (
                    <option key={role} value={role}>{roleLabels[role]}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setIsModalOpen(false)} className="btn btn-ghost">
                Отмена
              </button>
              <button onClick={handleSave} disabled={isSaving} className="btn btn-primary">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingUser ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Engineer Modal */}
      {linkModalOpen && linkingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              Связать с инженером
            </h2>
            <p className="text-muted-foreground">
              Пользователь: <strong>{linkingUser.fullName || linkingUser.login}</strong>
            </p>
            
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Выберите инженера</label>
              <select
                value={selectedEngineerId}
                onChange={(e) => setSelectedEngineerId(e.target.value)}
                className="input w-full"
              >
                <option value="">-- Выберите --</option>
                {engineers
                  .filter(e => !(e as any).userId)  // Только несвязанные
                  .map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))
                }
              </select>
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setLinkModalOpen(false)} className="btn btn-ghost">
                Отмена
              </button>
              <button 
                onClick={handleLinkEngineer} 
                disabled={!selectedEngineerId}
                className="btn btn-primary"
              >
                Связать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
