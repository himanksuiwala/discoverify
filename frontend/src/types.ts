export type UserRole = "ADMIN" | "STAFF" | "AGENT";

export type UserProfile = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  tenant: { id: number; name: string };
};

export type CaseStatus = "PENDING_CLAIM" | "ACTIVE" | "CLOSED";

export type VehicleSummary = {
  id: number;
  vin: string;
  plate: string;
  make: string;
  model: string;
};

export type AssigneeSummary = {
  id: number;
  first_name: string;
  last_name: string;
};

export type LatestSighting = {
  scanned_at: string;
  latitude: number;
  longitude: number;
};

export type CaseSummary = {
  id: number;
  status: CaseStatus;
  vehicle: VehicleSummary;
  assignee: AssigneeSummary | null;
  latest_sighting: LatestSighting | null;
  created_at: string;
  updated_at: string;
};

export type CasePage = {
  items: CaseSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type CaseScan = {
  id: number;
  scanned_at: string;
  latitude: number;
  longitude: number;
  image_url: string;
  reported_by: { first_name: string; last_name: string } | null;
  camera: { id: number; serial_number: string } | null;
  agency_vehicle: { id: number; identifier: string } | null;
};

export type CaseDetail = CaseSummary & { scans: CaseScan[] };
