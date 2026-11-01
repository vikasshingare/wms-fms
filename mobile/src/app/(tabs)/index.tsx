import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useStore } from "../../lib/store";
import {
  Button,
  C,
  Card,
  Empty,
  Header,
  Icon,
  Screen,
  Section,
  TaskCard,
  s,
} from "../../components/ui";
import { dateValue, done } from "../../lib/types";
export default function Home() {
  const { user, data, queue, busy, refresh, setNotice } = useStore();
  const jobs = data?.work_orders || [];
  const pending = [...jobs]
    .sort(
      (a, b) =>
        dateValue(a.scheduled_at).getTime() -
        dateValue(b.scheduled_at).getTime(),
    )
    .filter((w) => !done(w.status) && w.status !== "CANCELLED");
  const completed = jobs.filter((w) => done(w.status)).length;
  const shortcuts = [
    { label: "My tasks", icon: "clipboard", route: "/(tabs)/tasks" },
    { label: "Attendance", icon: "calendar", route: "/attendance" },
    { label: "My stock", icon: "box", route: "/(tabs)/stock" },
    { label: "Receive stock", icon: "download", route: "/receive-stock" },
    { label: "Send stock", icon: "upload", route: "/return-stock" },
    { label: "Sync workspace", icon: "refresh-cw", route: "/sync" },
  ];
  const stats = [
    {
      label: "Today's tasks",
      value: data?.stats.today_tasks ?? pending.length,
      bg: "#EEEAFF",
      color: C.purple,
    },
    {
      label: "Pending",
      value: data?.stats.pending ?? 0,
      bg: "#FFF3DA",
      color: "#CF8A16",
    },
    {
      label: "Overdue",
      value: data?.stats.overdue ?? 0,
      bg: "#FCE8F3",
      color: "#BC5597",
    },
  ];
  return (
    <Screen
      header={
        <Header
          title={`Hello, ${user?.name?.split(" ")[0] || "Engineer"} 👋`}
          subtitle="Let's make every visit count."
          right={
            <Pressable
              accessibilityLabel="Open sync and activity"
              onPress={() => router.push("/sync")}
              style={styles.bell}
            >
              <Icon name="bell" color="#FFF" size={19} />
              {queue.length > 0 && <View style={styles.notification} />}
            </Pressable>
          }
        />
      }
    >
      <View style={styles.dateRow}>
        <View style={s.row}>
          <View style={styles.onlineDot} />
          <Text style={styles.date}>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
          </Text>
        </View>
        <Text style={styles.employee}>FIELD ENGINEER</Text>
      </View>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={[styles.stat, { backgroundColor: stat.bg }]}
          >
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={[styles.statValue, { color: stat.color }]}>
              {stat.value}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.shortcuts}>
        {shortcuts.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.label}
            key={item.label}
            onPress={() => router.push(item.route as any)}
            style={styles.shortcut}
          >
            <View style={styles.shortcutIcon}>
              <Icon name={item.icon} size={23} />
            </View>
            <Text style={styles.shortcutText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <LinearGradient
        colors={["#F1EDFF", "#F9F6FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.dayCard}
      >
        <View style={[s.iconBox, { backgroundColor: "#E4DBFF" }]}>
          <Icon name="trending-up" size={21} />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={styles.dayTitle}>A little progress. A big impact.</Text>
          <Text style={s.small}>
            {completed} of {jobs.length} assigned visits completed
          </Text>
          <View style={styles.progress}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${jobs.length ? (completed / jobs.length) * 100 : 0}%`,
                },
              ]}
            />
          </View>
        </View>
      </LinearGradient>
      <Section
        title="Your next visits"
        action="View all"
        onPress={() => router.push("/(tabs)/tasks")}
      />
      {pending.slice(0, 3).map((task) => (
        <TaskCard task={task} key={task.id} />
      ))}
      {pending.length === 0 && (
        <Empty
          title="You're all caught up"
          description="New assignments will appear here when your dispatcher assigns them."
          icon="check-circle"
        />
      )}
      <Card style={styles.attendance}>
        <View style={s.row}>
          <View style={[s.iconBox, { backgroundColor: "#EAF7F1" }]}>
            <Icon name="sun" color={C.green} />
          </View>
          <View>
            <Text style={styles.dayTitle}>
              {data?.attendance?.check_in && !data?.attendance?.check_out
                ? "Your day is underway"
                : "Ready to start your day?"}
            </Text>
            <Text style={s.small}>Keep your attendance up to date</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push("/attendance")}>
          <Icon name="chevron-right" />
        </Pressable>
      </Card>
      <Button
        title={busy ? "Refreshing…" : "Refresh workspace"}
        secondary
        busy={busy}
        icon="refresh-cw"
        onPress={() => refresh().catch((e) => setNotice(e.message))}
      />
      <Text style={styles.footer}>CONNECTED WORK. BETTER SERVICE.</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  bell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFFFFF15",
    justifyContent: "center",
    alignItems: "center",
  },
  notification: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFA0A6",
    position: "absolute",
    right: 9,
    top: 8,
  },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  date: { fontSize: 11, fontWeight: "500", color: C.muted },
  employee: {
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: "700",
    color: "#A09AAD",
  },
  onlineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#23B77C",
  },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 13, padding: 14, gap: 8 },
  statLabel: { fontSize: 10, fontWeight: "600", color: C.ink },
  statValue: { fontSize: 28, fontWeight: "700", letterSpacing: -1 },
  shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  shortcut: {
    width: "31.3%",
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    paddingVertical: 17,
    gap: 11,
  },
  shortcutIcon: {
    width: 40,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutText: { fontSize: 10, fontWeight: "600", color: C.ink },
  dayCard: {
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EAE2FF",
  },
  dayTitle: { fontSize: 12, fontWeight: "700", color: C.ink },
  progress: {
    height: 4,
    borderRadius: 3,
    backgroundColor: "#E1D7FA",
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: { height: 4, borderRadius: 3, backgroundColor: "#9473F4" },
  attendance: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footer: {
    fontSize: 8,
    letterSpacing: 1.7,
    textAlign: "center",
    fontWeight: "600",
    color: "#B1ADBF",
    paddingTop: 4,
  },
});
