import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  deleteItem as ssDelete,
  getItem as ssGet,
  setItem as ssSet,
} from "@/src/utils/safeSecureStore";
import { useAuth } from "./AuthProvider";

type RoleType = "Patient" | "PhysicalTherapist" | null;

interface RoleContextValue {
  selectedRole: RoleType;
  setSelectedRole: (role: RoleType) => void;
  clearRole: () => void;
  isBootstrapping: boolean;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export const RoleProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { user } = useAuth();
  const [selectedRole, setSelectedRoleState] = useState<RoleType>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  // Track if role was loaded from storage to prevent derivation from overriding it
  const roleLoadedFromStorage = useRef(false);

  const setSelectedRole = useCallback((role: RoleType) => {
    setSelectedRoleState(role);
    setIsBootstrapping(false);
    // persist role for app restarts / deep links
    try {
      void ssSet("selectedRole", role, { scope: "local" });
    } catch { }
  }, []);

  const clearRole = useCallback(() => {
    setSelectedRoleState(null);
    setIsBootstrapping(false);
    try {
      void ssDelete("selectedRole");
    } catch { }
  }, []);

  const value = useMemo(
    () => ({ selectedRole, setSelectedRole, clearRole, isBootstrapping }),
    [selectedRole, setSelectedRole, clearRole, isBootstrapping]
  );

  // Rehydrate role on mount so downstream screens reliably know current role
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await ssGet("selectedRole");
        if (!mounted) return;
        if (saved === "Patient" || saved === "PhysicalTherapist") {
          // Mark that role was loaded from storage before setting state
          roleLoadedFromStorage.current = true;
          // Set role first, then mark bootstrapping as done
          setSelectedRoleState(saved as RoleType);
          // Use a microtask to ensure state update is batched correctly
          queueMicrotask(() => {
            if (mounted) setIsBootstrapping(false);
          });
          return;
        }
      } catch { }
      if (mounted) {
        setIsBootstrapping(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Only derive role from user if no role is already selected (e.g., first-time login)
  // This effect should NOT override a persisted role from storage
  useEffect(() => {
    // Skip if role was loaded from storage (prevents race condition)
    if (roleLoadedFromStorage.current) return;
    // Skip if we already have a role selected (either from storage or user selection)
    if (selectedRole) return;
    // Skip if still bootstrapping (waiting for storage to load)
    if (isBootstrapping) return;
    if (!user) return;
    if (isBootstrapping) return;
    if (!user) return;

    const roles: string[] | null = Array.isArray(user?.roles)
      ? (user.roles as string[])
      : Array.isArray(user?.Roles)
        ? (user.Roles as string[])
        : null;

    const preferredRole: string | null =
      user?.preferredRole ??
      user?.PreferredRole ??
      null;

    let derived: RoleType = null;

    // First check if user has a preferred role stored in their profile
    if (preferredRole === "Patient" || preferredRole === "PhysicalTherapist") {
      derived = preferredRole as RoleType;
    } else if (user?.therapistVerificationStatus != null) {
      derived = "PhysicalTherapist";
    } else if (roles?.includes("PhysicalTherapist")) {
      derived = "PhysicalTherapist";
    } else if (roles?.includes("Patient")) {
      derived = "Patient";
    }

    if (derived) {
      setSelectedRole(derived);
    }
  }, [selectedRole, isBootstrapping, user, setSelectedRole]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};

export const useRole = () => {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
};
