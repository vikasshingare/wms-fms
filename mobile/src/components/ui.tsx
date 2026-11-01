import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { pretty, Row, shortDate, time } from "../lib/types";
import { useStore } from "../lib/store";

export const C = {
  purple: "#663BE5",
  purpleDark: "#40238B",
  navy: "#181E41",
  ink: "#202240",
  muted: "#85879D",
  line: "#ECECF4",
  bg: "#F7F7FC",
  lavender: "#F0EBFF",
  green: "#1D9F70",
  amber: "#C88315",
  red: "#D55E76",
};
export const Icon = ({
  name,
  size = 20,
  color = C.purple,
}: {
  name: any;
  size?: number;
  color?: string;
}) => <Feather name={name} size={size} color={color} />;
export function Logo({
  small = false,
  light = false,
}: {
  small?: boolean;
  light?: boolean;
}) {
  return (
    <View style={s.logo}>
      <LinearGradient
        colors={["#A389FF", "#6539E5"]}
        style={[s.logoIcon, small && { width: 34, height: 38 }]}
      >
        <Icon name="box" size={small ? 23 : 35} color="#FFF" />
      </LinearGradient>
      <View>
        <Text
          style={[
            s.logoText,
            light && { color: "#FFF" },
            small && { fontSize: 19 },
          ]}
        >
          Service360
        </Text>
        <Text style={[s.logoSub, light && { color: "#DDD4FC" }]}>
          FIELD SERVICE + WMS
        </Text>
      </View>
    </View>
  );
}
export function Header({
  title,
  subtitle,
  back = false,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={["#392279", "#623CD0"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <SafeAreaView edges={["top"]}>
        <View style={s.header}>
          {back && (
            <Pressable
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={s.headerBack}
            >
              <Icon name="arrow-left" color="#FFF" />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>{title}</Text>
            {subtitle && <Text style={s.headerSub}>{subtitle}</Text>}
          </View>
          {right}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
export function Screen({
  children,
  header,
  scroll = true,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  scroll?: boolean;
}) {
  const { notice, setNotice, offline, queue } = useStore();
  return (
    <View style={s.screen}>
      {header}
      {(offline || queue.length > 0) && (
        <Pressable style={s.offline} onPress={() => router.push("/sync")}>
          <Icon
            name={offline ? "wifi-off" : "refresh-cw"}
            size={13}
            color={C.amber}
          />
          <Text style={s.offlineText}>
            {offline ? "Offline workspace" : "Changes awaiting sync"}
            {queue.length ? ` · ${queue.length} pending` : ""}
          </Text>
          <Icon name="chevron-right" size={14} color={C.amber} />
        </Pressable>
      )}
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
      {notice ? (
        <Pressable style={s.toast} onPress={() => setNotice("")}>
          <Text style={s.toastText}>{notice}</Text>
          <Icon name="x" color="#FFF" size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  busy = false,
  disabled = false,
  icon,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  busy?: boolean;
  disabled?: boolean;
  icon?: string;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary ? s.secondary : danger ? { backgroundColor: C.red } : null,
        (pressed || disabled || busy) && { opacity: 0.65 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? C.purple : "#FFF"} />
      ) : (
        <>
          {icon && (
            <Icon name={icon} color={secondary ? C.purple : "#FFF"} size={17} />
          )}
          <Text style={[s.buttonText, secondary && { color: C.purple }]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
export function Field({
  label,
  ...props
}: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 8 }}>
      {label && <Text style={s.fieldLabel}>{label}</Text>}
      <TextInput
        placeholderTextColor="#A1A2B4"
        {...props}
        style={[
          s.input,
          props.multiline && { minHeight: 95, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action && (
        <Pressable onPress={onPress}>
          <Text style={s.link}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}
export function Badge({ status }: { status: string }) {
  const good = [
    "COMPLETED",
    "CLOSED",
    "AVAILABLE",
    "ASSIGNED",
    "ISSUED_TO_ENGINEER",
  ].includes(status);
  const bad = ["PENDING", "QUARANTINE", "SCRAP", "REJECTED"].includes(status);
  return (
    <View
      style={[
        s.badge,
        {
          backgroundColor: good
            ? "#E6F7EE"
            : bad
              ? "#FFF0F0"
              : status === "IN_PROGRESS"
                ? "#FFF2D9"
                : C.lavender,
        },
      ]}
    >
      <Text
        style={[
          s.badgeText,
          {
            color: good
              ? C.green
              : bad
                ? C.red
                : status === "IN_PROGRESS"
                  ? C.amber
                  : C.purple,
          },
        ]}
      >
        {pretty(status)}
      </Text>
    </View>
  );
}
export function Info({ label, value }: { label: string; value: any }) {
  return (
    <View style={s.info}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value || "—"}</Text>
    </View>
  );
}
export function Empty({
  icon = "inbox",
  title,
  description,
}: {
  icon?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon name={icon} size={28} />
      </View>
      <Text style={s.sectionTitle}>{title}</Text>
      {description && (
        <Text style={[s.body, { textAlign: "center" }]}>{description}</Text>
      )}
    </View>
  );
}
export function ErrorText({ error }: { error: string }) {
  return error ? (
    <View style={s.error}>
      <Icon name="alert-circle" color={C.red} size={16} />
      <Text style={s.errorText}>{error}</Text>
    </View>
  ) : null;
}
export function TaskCard({ task }: { task: Row }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/work-order/${task.id}` as any)}
      style={s.taskCard}
    >
      <View style={s.taskTop}>
        <Text style={s.taskCode}>{task.code}</Text>
        <Badge status={task.status} />
      </View>
      <Text style={s.taskType}>{task.type}</Text>
      <View style={s.taskBottom}>
        <View style={{ flex: 1 }}>
          <Text style={s.taskSite}>{task.site_name}</Text>
          <View style={s.meta}>
            <Icon name="map-pin" size={12} color={C.green} />
            <Text style={s.metaText}>{task.city || "Customer site"}</Text>
            <View style={s.metaDot} />
            <Icon name="clock" size={11} color={C.muted} />
            <Text style={s.metaText}>
              {shortDate(task.scheduled_at)}, {time(task.scheduled_at)}
            </Text>
          </View>
        </View>
        <Icon name="chevron-right" color={C.navy} size={18} />
      </View>
      {task.pending_sync && (
        <Text style={[s.small, { color: C.amber, marginTop: 8 }]}>
          Changes saved on device · awaiting sync
        </Text>
      )}
    </Pressable>
  );
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 22, paddingBottom: 32, gap: 18 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerBack: { paddingRight: 5, paddingVertical: 4 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFF",
    letterSpacing: -0.4,
  },
  headerSub: { fontSize: 12, color: "#DCD3F7", marginTop: 5 },
  logo: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoIcon: {
    width: 52,
    height: 57,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 29,
    fontWeight: "800",
    color: C.navy,
    letterSpacing: -1.2,
  },
  logoSub: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.2,
    color: C.muted,
    marginTop: 3,
  },
  button: {
    backgroundColor: C.purple,
    borderRadius: 12,
    paddingHorizontal: 18,
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  buttonText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  secondary: {
    backgroundColor: "#F2EDFF",
    borderWidth: 1,
    borderColor: "#DDD1FF",
  },
  fieldLabel: { color: C.ink, fontSize: 12, fontWeight: "600" },
  input: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: "#E1E0EE",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: C.ink,
    backgroundColor: "#FFF",
  },
  card: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 15,
    padding: 17,
    gap: 12,
    boxShadow: "0 3px 12px rgba(37, 25, 88, 0.025)",
  },
  section: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -0.25,
  },
  link: { fontSize: 12, fontWeight: "600", color: C.purple },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 10, fontWeight: "700" },
  body: { fontSize: 13, lineHeight: 20, color: C.muted },
  small: { fontSize: 11, lineHeight: 17, color: C.muted },
  info: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F1F7",
  },
  infoLabel: { fontSize: 12, color: C.muted, flex: 1 },
  infoValue: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
    flex: 1.5,
    textAlign: "right",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 10,
  },
  emptyIcon: {
    backgroundColor: C.lavender,
    width: 61,
    height: 61,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  error: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: "#FFF0F1",
    borderRadius: 10,
  },
  errorText: { color: C.red, fontSize: 12, lineHeight: 18, flex: 1 },
  taskCard: {
    padding: 17,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EBEAF4",
    backgroundColor: "#FFF",
    boxShadow: "0 3px 9px rgba(36,20,90,.03)",
  },
  taskTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  taskCode: { fontSize: 13, fontWeight: "800", color: C.navy },
  taskType: { color: C.purple, fontSize: 12, fontWeight: "600", marginTop: 3 },
  taskBottom: { flexDirection: "row", alignItems: "center", marginTop: 13 },
  taskSite: { fontSize: 13, fontWeight: "600", color: C.ink },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 7,
    flexWrap: "wrap",
  },
  metaText: { fontSize: 10, color: C.muted },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#D1CDE0",
    marginHorizontal: 3,
  },
  offline: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: "#FFF5DF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offlineText: { fontSize: 11, color: C.amber, flex: 1 },
  toast: {
    position: "absolute",
    bottom: 13,
    left: 15,
    right: 15,
    backgroundColor: C.navy,
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 5px 20px #21213B22",
  },
  toastText: { color: "#FFF", fontSize: 12, lineHeight: 18, flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  split: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: C.line,
  },
  pillActive: { backgroundColor: C.purple, borderColor: C.purple },
  pillText: { fontSize: 12, fontWeight: "600", color: C.muted },
  pillTextActive: { color: "#FFF" },
  divider: { height: 1, backgroundColor: C.line },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: C.lavender,
    alignItems: "center",
    justifyContent: "center",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#D3CCE8",
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: C.purple, borderColor: C.purple },
  checkLabel: { fontSize: 13, color: C.ink, flex: 1, lineHeight: 20 },
});
