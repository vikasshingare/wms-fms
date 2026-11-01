import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useStore } from "../lib/store";
import {
  Badge,
  Button,
  C,
  Card,
  Empty,
  ErrorText,
  Field,
  Header,
  Icon,
  Info,
  Screen,
  s,
} from "../components/ui";
import { Scanner } from "../components/Scanner";
import { Row } from "../lib/types";
export default function ReceiveStock() {
  const { data, user, submit, setNotice } = useStore();
  const [selected, setSelected] = useState<Row | null>(null),
    [serials, setSerials] = useState(""),
    [scanner, setScanner] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const transfers = (data?.transfers || []).filter(
    (t) =>
      t.destination_location_id === user?.location_id &&
      ["IN_TRANSIT", "DISPATCHED"].includes(t.status),
  );
  const receive = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const scanned = serials.split(/[\s,;]+/).filter(Boolean);
      const r = await submit(
        `/transfers/${selected.id}/receive`,
        { serials: scanned },
        `${selected.code} · Receive stock`,
      );
      setNotice(
        r.queued
          ? "Receipt saved to your outbox. Custody updates after sync."
          : "Stock received. These assets are now in your custody.",
      );
      setSelected(null);
      setSerials("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      header={
        <Header
          title="Receive stock"
          subtitle="Scan. Verify. Accept custody."
          back
        />
      }
    >
      <Text style={s.body}>
        Select an incoming transfer and scan the serial numbers of the assets
        physically received.
      </Text>
      {!selected &&
        transfers.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              setSelected(t);
              setSerials("");
            }}
          >
            <Card>
              <View style={s.split}>
                <Text style={s.sectionTitle}>{t.code}</Text>
                <Badge status={t.status} />
              </View>
              <View style={s.row}>
                <Icon name="truck" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.body, { color: C.ink }]}>
                    {t.source_name}
                  </Text>
                  <Text style={s.small}>
                    {t.qty || t.serials?.length} assets → Your stock
                  </Text>
                </View>
                <Icon name="chevron-right" />
              </View>
            </Card>
          </Pressable>
        ))}
      {!selected && !transfers.length && (
        <Empty
          icon="download"
          title="No incoming stock"
          description="Transfers dispatched to your engineer location will appear here."
        />
      )}
      {selected && (
        <>
          <Card>
            <Text style={s.sectionTitle}>{selected.code}</Text>
            <Info label="From" value={selected.source_name} />
            <Info
              label="Expected assets"
              value={selected.qty || selected.serials?.length}
            />
            <Text style={s.small}>Expected serials</Text>
            <Text style={[s.body, { color: C.ink, fontWeight: "500" }]}>
              {selected.serials?.join(" · ")}
            </Text>
          </Card>
          <Button
            title="Scan received asset"
            secondary
            icon="maximize"
            onPress={() => setScanner(true)}
          />
          <Field
            label="Received serials"
            placeholder="Scan or enter one serial per line"
            multiline
            value={serials}
            onChangeText={setSerials}
            autoCapitalize="characters"
          />
          <Text style={s.small}>
            All expected serials must match. Missing or unexpected assets are
            blocked for reconciliation.
          </Text>
          <ErrorText error={error} />
          <Button
            title="Confirm physical receipt"
            icon="check-circle"
            busy={busy}
            disabled={!serials.trim()}
            onPress={receive}
          />
          <Button
            title="Choose another transfer"
            secondary
            onPress={() => {
              setSelected(null);
              setError("");
            }}
          />
        </>
      )}
      <Scanner
        visible={scanner}
        onClose={() => setScanner(false)}
        onScan={(value) =>
          setSerials((old) =>
            [...new Set([...old.split(/[\s,;]+/).filter(Boolean), value])].join(
              "\n",
            ),
          )
        }
      />
    </Screen>
  );
}
