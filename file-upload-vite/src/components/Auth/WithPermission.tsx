import React from 'react';
import { useAuth } from '@/hooks/useAuth';

interface WithPermissionProps {
  children: React.ReactNode;
  permission: string;
  fallback?: React.ReactNode;
}

const WithPermission: React.FC<WithPermissionProps> = ({
  children,
  permission,
  fallback = null,
}) => {
  const { checkPermission } = useAuth();

  if (!checkPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default WithPermission;