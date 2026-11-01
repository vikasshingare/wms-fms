export type Row = Record<string, any>;
export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  location_id: number;
};
export type Bootstrap = {
  user: User;
  stats: Row;
  work_orders: Row[];
  assets: Row[];
  customers: Row[];
  sites: Row[];
  engineers: Row[];
  locations: Row[];
  products: Row[];
  asns: Row[];
  cartons: Row[];
  putaway_tasks: Row[];
  transfers: Row[];
  returns: Row[];
  activities: Row[];
  attendance: Row | null;
  checklist_templates: Row[];
};
export type QueueItem = {
  id: string;
  path: string;
  body: Row;
  label: string;
  created_at: string;
  error?: string;
};
export type LocalEvidence = {
  type: string;
  name: string;
  data: string;
  uri: string;
  id?: number;
  url?: string;
};
export const pretty = (value?: string) =>
  (value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
export const done = (status: string) =>
  ["COMPLETED", "CLOSED", "QC_PENDING"].includes(status);
export const dateValue = (value: string) =>
  new Date(
    /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
      ? value.replace(" ", "T") + "Z"
      : value,
  );
export const shortDate = (date?: string) =>
  date
    ? dateValue(date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "Unscheduled";
export const time = (date?: string) =>
  date
    ? dateValue(date).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
