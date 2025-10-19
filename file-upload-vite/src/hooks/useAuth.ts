import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from './redux';
import { login, register, logout, getCurrentUser, clearError } from '@/store/slices/authSlice';
import { LoginForm, RegisterForm } from '@/types';
import { PERMISSIONS } from '@/constants/permissions';

export const useAuth = () => {
  const dispatch = useAppDispatch();
  const { user, token, isAuthenticated, loading, error } = useAppSelector(
    (state) => state.auth
  );

  const handleLogin = async (credentials: LoginForm) => {
    return dispatch(login(credentials)).unwrap();
  };

  const handleRegister = async (userData: RegisterForm) => {
    return dispatch(register(userData)).unwrap();
  };

  const handleLogout = () => {
    dispatch(logout());
  };

  const handleClearError = () => {
    dispatch(clearError());
  };

  const checkPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions.includes(permission);
  }, [user]);

  const hasAnyPermission = useCallback((permissions: string[]): boolean => {
    return permissions.some(permission => checkPermission(permission));
  }, [checkPermission]);

  return {
    user,
    token,
    isAuthenticated,
    loading,
    error,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    clearError: handleClearError,
    getCurrentUser: () => dispatch(getCurrentUser()),
    checkPermission,
    hasAnyPermission,
  };
};