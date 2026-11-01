import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useStore } from "../lib/store";
import {
  Button,
  C,
  Card,
  Empty,
  ErrorText,
  Header,
  Icon,
  Screen,
  Section,
  s,
} from "../components/ui";
import { shortDate, time } from "../lib/types";
export default function Sync() {
  const { queue, sync, busy, offline, discard, data } = useStore();
  const [error, setError] = useState(""),
    [confirm, setConfirm] = useState("");
  const perform = async () => {
    setError("");
    try {
      await sync();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Screen
      header={
        <Header
          title="Offline & sync"
          subtitle="Your work stays with you."
          back
        />
      }
    >
      <Card style={{ alignItems: "center", padding: 27 }}>
        <View
          style={[
            s.iconBox,
            {
              width: 64,
              height: 64,
              borderRadius: 22,
              backgroundColor: offline ? "#FFF1DA" : C.lavender,
            },
          ]}
        >
          <Icon
            name={offline ? "wifi-off" : "cloud"}
            size={30}
            color={offline ? C.amber : C.purple}
          />
        </View>
        <Text style={[s.sectionTitle, { fontSize: 20 }]}>
          {queue.length
            ? `${queue.length} pending ${queue.length === 1 ? "change" : "changes"}`
            : "Workspace up to date"}
        </Text>
        <Text style={[s.body, { textAlign: "center" }]}>
          {offline
            ? "Showing your saved workspace. Reconnect to the same Wi-Fi as your local server to sync."
            : "Your assigned tasks and inventory are cached on this device for field use."}
        </Text>
      </Card>
      <ErrorText error={error} />
      <Button
        title="Sync now"
        icon="refresh-cw"
        busy={busy}
        onPress={perform}
      />
      {queue.length > 0 && (
        <>
          <Section title="Your outbox" />
          <Text style={s.small}>
            Changes are sent in order. A conflict pauses later changes so
            nothing is silently lost.
          </Text>
        </>
      )}
      {queue.map((item, index) => (
        <Card key={item.id}>
          <View style={s.row}>
            <View
              style={[
                s.iconBox,
                { backgroundColor: item.error ? "#FFF0EE" : C.lavender },
              ]}
            >
              <Icon
                name={item.error ? "alert-circle" : "clock"}
                color={item.error ? C.red : C.purple}
              />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={[s.sectionTitle, { fontSize: 13 }]}>
                {item.label}
              </Text>
              <Text style={s.small}>
                {shortDate(item.created_at)} · {time(item.created_at)} ·{" "}
                {index === 0 ? "Next to sync" : "Waiting"}
              </Text>
            </View>
          </View>
          {item.error && <ErrorText error={item.error} />}
          <Pressable
            onPress={() => setConfirm(confirm === item.id ? "" : item.id)}
          >
            <Text style={[s.small, { color: C.red }]}>
              Discard this pending change
            </Text>
          </Pressable>
          {confirm === item.id && (
            <>
              <Text style={s.small}>
                This removes the saved change from this device. It will not be
                submitted. Later changes may depend on it.
              </Text>
              <Button
                title="Discard pending change"
                danger
                onPress={() =>
                  discard(item.id)
                    .then(() => setConfirm(""))
                    .catch((e) => setError(e.message))
                }
              />
            </>
          )}
        </Card>
      ))}
      {!queue.length && (
        <Empty
          title="Nothing waiting to sync"
          description="If your connection drops, service actions are saved here with a unique transaction ID and retried safely."
          icon="check-circle"
        />
      )}
      <Section title="Recent workspace activity" />
      {(data?.activities || []).slice(0, 5).map((event) => (
        <View
          key={event.id}
          style={{ flexDirection: "row", gap: 11, paddingVertical: 7 }}
        >
          <View style={[s.iconBox, { height: 29, width: 29, borderRadius: 9 }]}>
            <Icon name="activity" size={14} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.body, { color: C.ink }]}>{event.description}</Text>
            <Text style={s.small}>
              {shortDate(event.created_at)} · {time(event.created_at)}
            </Text>
          </View>
        </View>
      ))}
    </Screen>
  );
}
