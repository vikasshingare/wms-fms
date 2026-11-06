import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, key, newId, request, tokenStore } from "./api";
import { Bootstrap, QueueItem, Row, User, canPutAway } from "./types";

type Store = {
  token: string | null;
  user: User | null;
  data: Bootstrap | null;
  ready: boolean;
  busy: boolean;
  offline: boolean;
  queue: QueueItem[];
  notice: string;
  setNotice: (s: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  submit: (
    path: string,
    body: Row,
    label: string,
  ) => Promise<{ queued: boolean; result?: any }>;
  sync: () => Promise<void>;
  discard: (id: string) => Promise<void>;
};
const Context = createContext<Store>(null as any);
export function Provider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null),
    [user, setUser] = useState<User | null>(null),
    [data, setData] = useState<Bootstrap | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false),
    [queue, setQueue] = useState<QueueItem[]>([]),
    [notice, setNotice] = useState("");
  const queueRef = useRef<QueueItem[]>([]),
    syncing = useRef(false),
    tokenRef = useRef<string | null>(null),
    userRef = useRef<User | null>(null);
  const saveQueue = async (items: QueueItem[]) => {
    if (userRef.current)
      await AsyncStorage.setItem(
        `${key}.${userRef.current.id}.queue`,
        JSON.stringify(items),
      );
    queueRef.current = items;
    setQueue(items);
  };
  const applyQueue = useCallback(
    (snapshot: Bootstrap, pending: QueueItem[]) => ({
      ...snapshot,
      attendance: pending
        .filter((q) => q.path === "/attendance")
        .reduce(
          (record, q) => ({
            ...(record || {}),
            [q.body.action]: q.body.captured_at,
            pending_sync: true,
          }),
          snapshot.attendance,
        ),
      transfers: snapshot.transfers.map((t) =>
        pending.some((q) => q.path === `/transfers/${t.id}/receive`)
          ? { ...t, status: "RECEIPT_QUEUED", pending_sync: true }
          : t,
      ),
      returns: [
        ...snapshot.returns.filter((r) => !r.pending_sync),
        ...pending
          .filter((q) => q.path === "/returns")
          .map((q) => ({
            id: q.id,
            code: "Awaiting sync",
            ...q.body,
            status: "PENDING_SYNC",
            pending_sync: true,
            serial: snapshot.assets.find((a) => a.id === q.body.asset_id)
              ?.serial,
            destination_name: snapshot.locations.find(
              (l) => l.id === q.body.destination_location_id,
            )?.name,
          })),
      ],
      work_orders: snapshot.work_orders.map((w) => {
        const events = pending.filter(
          (q) => q.path === `/work-orders/${w.id}/action`,
        );
        if (!events.length) return w;
        const states: Row = {
          accept: "ACCEPTED",
          en_route: "EN_ROUTE",
          check_in: "CHECKED_IN",
          start: "IN_PROGRESS",
          pending: "PENDING",
          resume: "ACCEPTED",
        };
        return events.reduce(
          (current, event) => ({
            ...current,
            status: states[event.body.action] || current.status,
            pending_sync: true,
          }),
          w,
        );
      }),
    }),
    [],
  );
  const fetchData = useCallback(
    async (t = tokenRef.current) => {
      if (!t) return;
      try {
        const result: Bootstrap = await request("/bootstrap", t);
        setData(applyQueue(result, queueRef.current));
        setUser(result.user);
        userRef.current = result.user;
        setOffline(false);
        await AsyncStorage.setItem(
          `${key}.${result.user.id}.bootstrap`,
          JSON.stringify(result),
        );
      } catch (e: any) {
        if (e.status === 0) {
          setOffline(true);
          setNotice("Offline. Showing the last saved workspace.");
        } else throw e;
      }
    },
    [applyQueue],
  );
  useEffect(() => {
    (async () => {
      try {
        const t = await tokenStore.get();
        const saved = await AsyncStorage.getItem(`${key}.user`);
        if (t && saved) {
          const u = JSON.parse(saved);
          tokenRef.current = t;
          userRef.current = u;
          setToken(t);
          setUser(u);
          const [q, d] = await Promise.all([
            AsyncStorage.getItem(`${key}.${u.id}.queue`),
            AsyncStorage.getItem(`${key}.${u.id}.bootstrap`),
          ]);
          queueRef.current = q ? JSON.parse(q) : [];
          setQueue(queueRef.current);
          if (d) setData(applyQueue(JSON.parse(d), queueRef.current));
          await fetchData(t);
        }
      } catch (e: any) {
        setNotice(e.message);
        if (e.status === 401) {
          await tokenStore.remove();
          setToken(null);
          setUser(null);
        }
      } finally {
        setReady(true);
      }
    })();
  }, [fetchData, applyQueue]);
  const login = async (email: string, password: string) => {
    setBusy(true);
    try {
      const auth = await request("/auth/login", null, { email, password });
      if (!["engineer","FIELD_ENGINEER"].includes(auth.user.role) && !canPutAway(auth.user))
        throw new Error(
          "Use a field engineer or warehouse account in the mobile app.",
        );
      tokenRef.current = auth.token;
      userRef.current = auth.user;
      setToken(auth.token);
      setUser(auth.user);
      await tokenStore.set(auth.token);
      await tokenStore.setRefresh(auth.refresh_token);
      await AsyncStorage.setItem(`${key}.user`, JSON.stringify(auth.user));
      const saved = await AsyncStorage.getItem(`${key}.${auth.user.id}.queue`);
      queueRef.current = saved ? JSON.parse(saved) : [];
      setQueue(queueRef.current);
      await fetchData(auth.token);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    try { await request("/auth/logout",await tokenStore.get(),{}); } catch {}
    await tokenStore.removeRefresh();
    await tokenStore.remove();
    await AsyncStorage.removeItem(`${key}.user`);
    setToken(null);
    setUser(null);
    setData(null);
    setQueue([]);
    queueRef.current = [];
    tokenRef.current = null;
    userRef.current = null;
  };
  const send = async (item: QueueItem) => {
    const body = { ...item.body };
    if (body._local_evidence) {
      const uploaded = [...(body.evidence || [])];
      for (const photo of body._local_evidence) {
        const evidence = await request("/evidence", tokenRef.current, {
          work_order_id: body.work_order_id,
          type: photo.type,
          name: photo.name,
          data: photo.data,
          mobile_txn_id: `${item.id}-photo-${photo.type}`,
        });
        uploaded.push(evidence);
      }
      body.evidence = uploaded;
      delete body._local_evidence;
      delete body.work_order_id;
    }
    return request(item.path, tokenRef.current, body);
  };
  const submit = async (path: string, body: Row, label: string) => {
    if (
      queueRef.current.some(
        (q) =>
          q.path === path &&
          q.body.action === body.action &&
          q.body.asset_id === body.asset_id,
      )
    ) {
      throw new ApiError(
        "This action is already waiting to sync. Open your outbox to review it.",
        409,
      );
    }
    const item: QueueItem = {
      id: body.mobile_txn_id || newId(),
      path,
      body: {
        ...body,
        mobile_txn_id: body.mobile_txn_id || newId(),
        captured_at: new Date().toISOString(),
      },
      label,
      created_at: new Date().toISOString(),
    };
    item.body.mobile_txn_id = item.id;
    if (queueRef.current.length) {
      await saveQueue([...queueRef.current, item]);
      if (data) setData(applyQueue(data, queueRef.current));
      setNotice("Saved to your outbox. Sync pending changes in order.");
      return { queued: true };
    }
    try {
      const result = await send(item);
      setOffline(false);
      await fetchData();
      return { queued: false, result };
    } catch (e: any) {
      if (e.status !== 0) throw e;
      await saveQueue([...queueRef.current, item]);
      if (data) setData(applyQueue(data, queueRef.current));
      setOffline(true);
      setNotice("Saved on this device. It will be submitted when you sync.");
      return { queued: true };
    }
  };
  const sync = async () => {
    if (syncing.current) return;
    syncing.current = true;
    setBusy(true);
    try {
      while (queueRef.current.length) {
        const item = queueRef.current[0];
        try {
          await send(item);
          await saveQueue(queueRef.current.slice(1));
        } catch (e: any) {
          await saveQueue([
            { ...item, error: e.message },
            ...queueRef.current.slice(1),
          ]);
          if (e.status === 0) setOffline(true);
          throw e;
        }
      }
      await fetchData();
      setNotice("All changes are synced. Your workspace is up to date.");
    } finally {
      syncing.current = false;
      setBusy(false);
    }
  };
  const discard = async (id: string) => {
    await saveQueue(queueRef.current.filter((q) => q.id !== id));
    await fetchData();
  };
  const refresh = async () => {
    setBusy(true);
    try {
      await fetchData();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{
        token,
        user,
        data,
        ready,
        busy,
        offline,
        queue,
        notice,
        setNotice,
        login,
        logout,
        refresh,
        submit,
        sync,
        discard,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
