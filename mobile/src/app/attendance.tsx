import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useStore } from "../lib/store";
import { captureLocation } from "../lib/location";
import { time } from "../lib/types";
import {
  Button,
  C,
  Card,
  ErrorText,
  Header,
  Icon,
  Info,
  Screen,
  s,
} from "../components/ui";
export default function Attendance() {
  const { data, submit, setNotice } = useStore();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [gpsFailed, setGpsFailed] = useState(false);
  const record = data?.attendance;
  const started = !!record?.check_in,
    finished = !!record?.check_out;
  const recordAttendance = async (withGps = true) => {
    setBusy(true);
    setError("");
    try {
      const geo = withGps ? await captureLocation() : {};
      const result = await submit(
        "/attendance",
        { action: started ? "check_out" : "check_in", ...geo },
        started ? "Attendance · Check out" : "Attendance · Check in",
      );
      setNotice(
        result.queued
          ? "Attendance saved to your outbox."
          : "Attendance recorded successfully.",
      );
      setGpsFailed(false);
    } catch (e: any) {
      setError(e.message);
      if (withGps) setGpsFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      header={
        <Header
          title="Attendance"
          subtitle="Make a good start. Finish with confidence."
          back
        />
      }
    >
      <Card style={{ alignItems: "center", padding: 30, gap: 15 }}>
        <View style={styles.sun}>
          <Icon name={finished ? "moon" : "sun"} size={40} color={C.purple} />
        </View>
        <Text style={styles.time}>
          {new Date().toLocaleDateString("en-IN", { weekday: "long" })}
        </Text>
        <Text style={s.body}>
          {new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </Text>
        <View style={styles.status}>
          <View
            style={[
              styles.dot,
              { backgroundColor: started && !finished ? C.green : C.purple },
            ]}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: started && !finished ? C.green : C.purple,
            }}
          >
            {finished
              ? "Day completed"
              : started
                ? "You are on duty"
                : "Not checked in yet"}
          </Text>
        </View>
      </Card>
      <Card>
        <Info label="Check-in" value={time(record?.check_in)} />
        <Info label="Check-out" value={time(record?.check_out)} />
        <Info
          label="Location captured"
          value={
            record?.latitude && record?.longitude
              ? `${Number(record.latitude).toFixed(4)}, ${Number(record.longitude).toFixed(4)}`
              : "Not recorded"
          }
        />
      </Card>
      <View style={s.row}>
        <Icon name="map-pin" size={17} color={C.muted} />
        <Text style={[s.small, { flex: 1 }]}>
          Location is requested only when you record your attendance.
        </Text>
      </View>
      <ErrorText error={error} />
      {!finished && (
        <>
          <Button
            title={started ? "Finish my day" : "Start my day"}
            icon={started ? "log-out" : "sun"}
            busy={busy}
            onPress={() => recordAttendance()}
          />
          {gpsFailed && (
            <Button
              title="Record without GPS"
              secondary
              busy={busy}
              onPress={() => recordAttendance(false)}
            />
          )}
        </>
      )}
      {finished && (
        <Text style={[s.body, { textAlign: "center" }]}>
          You&apos;re signed out for today. See you on your next shift.
        </Text>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  sun: {
    height: 90,
    width: 90,
    borderRadius: 30,
    backgroundColor: C.lavender,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  time: { fontSize: 25, color: C.ink, fontWeight: "700" },
  status: {
    backgroundColor: "#F4F1FA",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
