export const PRIVILEGED_API_ROLES = ["ADMIN", "MANAGER"] as const;

export const AUTHENTICATED_ERP_ROLES = [
  ...PRIVILEGED_API_ROLES,
  "DESIGNER",
  "TECHNICIAN",
] as const;

export type ErpRole = (typeof AUTHENTICATED_ERP_ROLES)[number];

export function isPrivilegedApiRole(role: string): boolean {
  return PRIVILEGED_API_ROLES.some((allowedRole) => allowedRole === role);
}

export function isAuthenticatedErpRole(role: string): role is ErpRole {
  return AUTHENTICATED_ERP_ROLES.some((allowedRole) => allowedRole === role);
}
