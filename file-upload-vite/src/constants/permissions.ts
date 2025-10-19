export const PERMISSIONS = {
  FILE_UPLOAD: 'file:upload',
  FILE_DOWNLOAD: 'file:download',
  FILE_DELETE: 'file:delete',
  FILE_VIEW: 'file:view',
  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',
  SYSTEM_CONFIG: 'system:config',
} as const;

export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest',
} as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLES.ADMIN]: [
    PERMISSIONS.FILE_UPLOAD,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_DELETE,
    PERMISSIONS.FILE_VIEW,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.SYSTEM_CONFIG,
  ],
  [ROLES.USER]: [
    PERMISSIONS.FILE_UPLOAD,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_VIEW,
  ],
  [ROLES.GUEST]: [
    PERMISSIONS.FILE_VIEW,
  ],
};