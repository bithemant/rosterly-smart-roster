import "server-only";
import type { UserRole } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";

export const ALL_ROLES: UserRole[] = ["ADMIN", "OPERATIONS_MANAGER"];
export const POD_ROLES: UserRole[] = ["ADMIN", "OPERATIONS_MANAGER", "POD_LEAD"];

export function employeeFilter(user: SessionUser) {
  if (ALL_ROLES.includes(user.role)) return {};
  if (user.role === "POD_LEAD" && user.managedPodId) {
    return { podId: user.managedPodId };
  }
  if (user.role === "EMPLOYEE" && user.employeeId) {
    return { id: user.employeeId };
  }
  throw new HttpError(403, "This account has no roster scope configured.");
}

export function podScope(user: SessionUser) {
  if (ALL_ROLES.includes(user.role)) return {};
  if (user.role === "POD_LEAD" && user.managedPodId) {
    return { id: user.managedPodId };
  }
  if (user.role === "EMPLOYEE" && user.employeeId) {
    return { members: { some: { id: user.employeeId } } };
  }
  throw new HttpError(403, "This account has no pod scope configured.");
}

export function assertPodAccess(user: SessionUser, podId: string | null) {
  if (ALL_ROLES.includes(user.role)) return;
  if (user.role === "POD_LEAD" && user.managedPodId === podId) return;
  throw new HttpError(403, "You cannot access this pod.");
}
