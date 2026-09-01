import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export const TOKEN_KEY = "saferoute_token";

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await storage.secureGet(TOKEN_KEY, "");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.detail || "Something went wrong");
  }
  return data as T;
}

export const api = {
  // auth
  sendOtp: (phone: string) => request("/auth/send-otp", { method: "POST", body: { phone }, auth: false }),
  verifyOtp: (phone: string, otp: string) =>
    request("/auth/verify-otp", { method: "POST", body: { phone, otp }, auth: false }),
  me: () => request("/auth/me"),

  // driver
  driverBatches: () => request("/driver/batches"),
  driverActiveTrip: () => request("/driver/active-trip"),
  startTrip: (batch_id: string) => request("/driver/trips/start", { method: "POST", body: { batch_id } }),
  updateTripStatus: (status: string) => request("/driver/trips/status", { method: "POST", body: { status } }),
  updateLocation: (lat: number, lng: number) =>
    request("/driver/trips/location", { method: "POST", body: { lat, lng } }),
  endTrip: () => request("/driver/trips/end", { method: "POST" }),
  markAbsent: (studentId: string, absent: boolean) =>
    request(`/driver/students/${studentId}/absent`, { method: "POST", body: { absent } }),
  moveStudent: (studentId: string, batch_id: string) =>
    request(`/driver/students/${studentId}/move`, { method: "POST", body: { batch_id } }),

  // parent
  parentChildren: () => request("/parent/children"),
  parentTrips: () => request("/parent/trips"),
  parentAlerts: () => request("/parent/alerts"),
  readAllAlerts: () => request("/parent/alerts/read-all", { method: "POST" }),

  // admin
  adminOverview: () => request("/admin/overview"),
  adminDrivers: () => request("/admin/drivers"),
  addDriver: (b: any) => request("/admin/drivers", { method: "POST", body: b }),
  deleteDriver: (id: string) => request(`/admin/drivers/${id}`, { method: "DELETE" }),
  adminParents: () => request("/admin/parents"),
  addParent: (b: any) => request("/admin/parents", { method: "POST", body: b }),
  deleteParent: (id: string) => request(`/admin/parents/${id}`, { method: "DELETE" }),
  adminBatches: () => request("/admin/batches"),
  addBatch: (b: any) => request("/admin/batches", { method: "POST", body: b }),
  adminStudents: () => request("/admin/students"),
  addStudent: (b: any) => request("/admin/students", { method: "POST", body: b }),
  moveStudentAdmin: (id: string, batch_id: string) =>
    request(`/admin/students/${id}`, { method: "PATCH", body: { batch_id } }),
  updateSubscription: (id: string, plan: string, status: string) =>
    request(`/admin/students/${id}/subscription`, { method: "POST", body: { plan, status } }),
  deleteStudent: (id: string) => request(`/admin/students/${id}`, { method: "DELETE" }),
};

export default api;
