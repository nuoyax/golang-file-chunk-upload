import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin, Result, Button } from 'antd';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermissions?: string[];
  requiredAnyPermission?: string[];
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermissions = [],
  requiredAnyPermission = [],
  redirectTo = '/login',
}) => {
  const { isAuthenticated, user, loading, checkPermission, hasAnyPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (requiredPermissions.length > 0 && !requiredPermissions.every(checkPermission)) {
    return (
      <div style={{ padding: '50px' }}>
        <Result
          status="403"
          title="403"
          subTitle="抱歉，您没有访问此页面的权限。"
          extra={
            <Button type="primary" onClick={() => window.history.back()}>
              返回
            </Button>
          }
        />
      </div>
    );
  }

  if (requiredAnyPermission.length > 0 && !hasAnyPermission(requiredAnyPermission)) {
    return (
      <div style={{ padding: '50px' }}>
        <Result
          status="403"
          title="403"
          subTitle="抱歉，您没有访问此页面的权限。"
          extra={
            <Button type="primary" onClick={() => window.history.back()}>
              返回
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;