import { useEffect, useState } from "react";
import type { SIOSIdentity } from "../lib/identity";

const OWNER_GID = "399152573423";

export interface IdentityMemory {
  gid: string;
  lastActive: number;
  preferences: {
    moduleOrder?: string[];
    favoriteCommands?: string[];
    colorTint?: string;
    animationSpeed?: "slow" | "normal" | "fast";
  };
  sessionCount: number;
  firstSeen: number;
  lastCommand?: string;
}

const STORAGE_KEY = "sios_identity_memory";

export function useIdentityMemory(gid: string) {
  const [memory, setMemory] = useState<IdentityMemory | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    setIsOwner(gid === OWNER_GID);
    
    // Load or create identity memory
    const stored = localStorage.getItem(`${STORAGE_KEY}:${gid}`);
    let current: IdentityMemory;

    if (stored) {
      current = JSON.parse(stored);
      current.sessionCount++;
      current.lastActive = Date.now();
    } else {
      current = {
        gid,
        lastActive: Date.now(),
        preferences: {
          moduleOrder: getDefaultModuleOrder(gid),
          colorTint: getDefaultColorTint(gid),
          animationSpeed: "normal",
        },
        sessionCount: 1,
        firstSeen: Date.now(),
      };
    }

    localStorage.setItem(`${STORAGE_KEY}:${gid}`, JSON.stringify(current));
    setMemory(current);
  }, [gid]);

  const updateMemory = (updates: Partial<IdentityMemory>) => {
    if (!memory) return;
    const updated = { ...memory, ...updates, lastActive: Date.now() };
    localStorage.setItem(`${STORAGE_KEY}:${gid}`, JSON.stringify(updated));
    setMemory(updated);
  };

  const recordCommand = (cmd: string) => {
    updateMemory({ lastCommand: cmd });
  };

  return { memory, isOwner, updateMemory, recordCommand };
}

// Dynamic module ordering based on identity patterns
function getDefaultModuleOrder(gid: string): string[] {
  const isOwner = gid === OWNER_GID;
  
  if (isOwner) {
    return ["Dashboard", "Identity", "Syncori", "IoT", "Modules", "Nova Fin", "Status", "Live"];
  }

  // Hash GID to determine user-specific ordering
  const hash = gid.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const base = ["Dashboard", "Identity", "Syncori", "IoT", "Modules", "Nova Fin", "Status", "Live"];
  
  // Rotate array based on GID hash for personalized feel
  const rotations = hash % base.length;
  return [...base.slice(rotations), ...base.slice(0, rotations)];
}

// Identity-specific color tinting
function getDefaultColorTint(gid: string): string {
  const isOwner = gid === OWNER_GID;
  
  if (isOwner) {
    return "cyan"; // Owner gets pure cyan
  }

  // Hash-based subtle color variations for other users
  const hash = gid.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const tints = ["cyan", "blue", "purple", "magenta"];
  return tints[hash % tints.length];
}

// Get trust/clearance based on session history
export function getIdentityClearance(memory: IdentityMemory | null, isOwner: boolean): string {
  if (isOwner) return "Commander";
  
  if (!memory) return "Initiate";
  
  // Progressive trust based on session history
  if (memory.sessionCount >= 20) return "Commander";
  if (memory.sessionCount >= 10) return "Operator";
  if (memory.sessionCount >= 5) return "Explorer";
  if (memory.sessionCount >= 2) return "Initiate";
  return "Guest";
}

// Get trust percentage
export function getIdentityTrust(memory: IdentityMemory | null): number {
  if (!memory) return 0;
  
  const daysSinceFirst = (Date.now() - memory.firstSeen) / (1000 * 60 * 60 * 24);
  const sessionTrust = Math.min(memory.sessionCount * 5, 60);
  const timeTrust = Math.min(daysSinceFirst, 40);
  
  return Math.round(sessionTrust + timeTrust);
}

// Persistence helpers
export function saveRuntimeSnapshot(gid: string, state: any) {
  const key = `sios_runtime_snapshot:${gid}`;
  localStorage.setItem(key, JSON.stringify({ ...state, savedAt: Date.now() }));
}

export function loadRuntimeSnapshot(gid: string) {
  const key = `sios_runtime_snapshot:${gid}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  
  const snapshot = JSON.parse(stored);
  // Only restore if within 24 hours
  if (Date.now() - snapshot.savedAt > 24 * 60 * 60 * 1000) {
    localStorage.removeItem(key);
    return null;
  }
  
  return snapshot;
}
