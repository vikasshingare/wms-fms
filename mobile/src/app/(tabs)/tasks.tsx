import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useStore } from "../../lib/store";
import {
  C,
  Empty,
  Field,
  Header,
  Screen,
  TaskCard,
  s,
} from "../../components/ui";
import { dateValue, done } from "../../lib/types";
export default function Tasks() {
  const { data } = useStore();
  const [filter, setFilter] = useState("All"),
    [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());
  const tasks = [...(data?.work_orders || [])].sort(
    (a, b) =>
      Number(done(a.status)) - Number(done(b.status)) ||
      dateValue(a.scheduled_at).getTime() - dateValue(b.scheduled_at).getTime(),
  );
  const today = new Date().toDateString();
  const groups: Record<string, any[]> = {
    All: tasks,
    Today: tasks.filter(
      (t) => dateValue(t.scheduled_at).toDateString() === today,
    ),
    Upcoming: tasks.filter(
      (t) =>
        dateValue(t.scheduled_at).getTime() > now &&
        dateValue(t.scheduled_at).toDateString() !== today,
    ),
    Completed: tasks.filter((t) => done(t.status)),
  };
  const filtered = groups[filter].filter((t) =>
    `${t.code} ${t.site_name} ${t.type}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Screen
      header={
        <Header
          title="My tasks"
          subtitle={`${tasks.filter((t) => !done(t.status)).length} open assignments · Your day, organized`}
        />
      }
    >
      <Field
        placeholder="Search work order, site or service"
        value={search}
        onChangeText={setSearch}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {Object.keys(groups).map((label) => (
          <Pressable
            key={label}
            onPress={() => setFilter(label)}
            style={[s.pill, filter === label && s.pillActive]}
          >
            <Text style={[s.pillText, filter === label && s.pillTextActive]}>
              {label} ({groups[label].length})
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.split}>
        <Text style={[s.small, { fontWeight: "600", letterSpacing: 0.7 }]}>
          ASSIGNED WORK ORDERS
        </Text>
        <Text style={[s.small, { color: C.purple }]}>
          {filtered.length} visits
        </Text>
      </View>
      {filtered.map((t) => (
        <TaskCard task={t} key={t.id} />
      ))}
      {!filtered.length && (
        <Empty
          title="No tasks in this view"
          description="Try another filter or search. Pull your latest assignments from the home screen."
          icon="clipboard"
        />
      )}
    </Screen>
  );
}
