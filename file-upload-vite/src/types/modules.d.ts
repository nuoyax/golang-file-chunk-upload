declare module '@/hooks/useAuth' {
  export const useAuth: () => {
    user: any;
    isAuthenticated: boolean;
    login: (credentials: any) => Promise<void>;
    logout: () => void;
    checkPermission: (permission: string) => boolean;
    hasAnyPermission: (permissions: string[]) => boolean;
    loading: boolean;
    error: string | null;
  };
}

declare module '@/hooks/redux' {
  export const useAppDispatch: () => any;
  export const useAppSelector: any;
}

declare module '@/store' {
  export const store: any;
}

declare module '@/routes' {
  const AppRoutes: React.ComponentType;
  export default AppRoutes;
}