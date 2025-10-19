import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/Auth/ProtectedRoute';
import MainLayout from '@/components/Layout/MainLayout';
import LoginPage from '@/pages/Auth/LoginPage';
import RegisterPage from '@/pages/Auth/RegisterPage';
import HomePage from '@/pages/Home/HomePage';
import UploadPage from '@/pages/Upload/UploadPage';
import FilesPage from '@/pages/Files/FilesPage';
import { PERMISSIONS } from '@/constants/permissions';

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Router>
      <Routes>
        {/* 公开路由 */}
        <Route 
          path="/login" 
          element={
            !isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />
          } 
        />
        <Route 
          path="/register" 
          element={
            !isAuthenticated ? <RegisterPage /> : <Navigate to="/" replace />
          } 
        />

        {/* 受保护的路由 */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomePage />} />
          <Route 
            path="upload" 
            element={
              <ProtectedRoute requiredPermissions={[PERMISSIONS.FILE_UPLOAD]}>
                <UploadPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="files" 
            element={
              <ProtectedRoute requiredPermissions={[PERMISSIONS.FILE_VIEW]}>
                <FilesPage />
              </ProtectedRoute>
            } 
          />
        </Route>

        {/* 404 路由 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default AppRoutes;