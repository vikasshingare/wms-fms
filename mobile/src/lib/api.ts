import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const host = Constants.expoConfig?.hostUri?.split(":")[0] || "localhost";
const browserHost =
  typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
const webHost = browserHost === "localhost" ? "127.0.0.1" : browserHost;
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  `http://${Platform.OS === "web" ? webHost : host}:4000/api`;
export const key = "service360.mobile";
export const tokenStore = {
  getRefresh:()=>Platform.OS === "web" ? AsyncStorage.getItem(`${key}.refresh`) : SecureStore.getItemAsync(`${key}.refresh`),
  setRefresh:(value:string)=>Platform.OS === "web" ? AsyncStorage.setItem(`${key}.refresh`,value) : SecureStore.setItemAsync(`${key}.refresh`,value),
  removeRefresh:()=>Platform.OS === "web" ? AsyncStorage.removeItem(`${key}.refresh`) : SecureStore.deleteItemAsync(`${key}.refresh`),
  get: () =>
    Platform.OS === "web"
      ? AsyncStorage.getItem(`${key}.token`)
      : SecureStore.getItemAsync(`${key}.token`),
  set: (token: string) =>
    Platform.OS === "web"
      ? AsyncStorage.setItem(`${key}.token`, token)
      : SecureStore.setItemAsync(`${key}.token`, token),
  remove: () =>
    Platform.OS === "web"
      ? AsyncStorage.removeItem(`${key}.token`)
      : SecureStore.deleteItemAsync(`${key}.token`),
};
let refreshFlight: Promise<any> | null = null;
async function refreshSession(){
 if(!refreshFlight)refreshFlight=(async()=>{const refresh_token=await tokenStore.getRefresh();if(!refresh_token)return null;const response=await fetch(API_URL+'/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token})});if(!response.ok)return null;const session=await response.json();await tokenStore.set(session.token);await tokenStore.setRefresh(session.refresh_token);return session;})().finally(()=>{refreshFlight=null;});
 return refreshFlight;
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function request(
  path: string,
  token?: string | null,
  body?: unknown,
) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15000);
  try {
    let res = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${await tokenStore.get() || token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: abort.signal,
    });
    if(res.status===401&&token&&!path.startsWith('/auth/')){const session=await refreshSession();if(session)res=await fetch(API_URL+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:abort.signal});}
    const json = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new ApiError(
        json.error || `Request failed (${res.status})`,
        res.status,
      );
    return json;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      "Connection unavailable. Check the local server or your Wi-Fi.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}
export const newId = () =>
  `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
