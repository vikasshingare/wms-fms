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
  Screen,
  Section,
  s,
} from "../components/ui";
import { Scanner } from "../components/Scanner";
export default function ReturnStock() {
  const { data, user, submit, setNotice } = useStore();
  const [assetId, setAssetId] = useState<number | null>(null),
    [destination, setDestination] = useState<number | null>(null),
    [reason, setReason] = useState(""),
    [condition, setCondition] = useState("GOOD"),
    [scanner, setScanner] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const outstanding = (data?.returns || []).filter(
    (r) => !["RECEIVED", "COMPLETED"].includes(r.status),
  );
  const assets = (data?.assets || []).filter(
    (a) =>
      (a.holder_user_id === user?.id || a.location_id === user?.location_id) &&
      !outstanding.some((r) => r.asset_id === a.id),
  );
  const destinations = (data?.locations || []).filter((l) =>
    ["HUB", "STAGING", "REPAIR"].includes(l.type),
  );
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await submit(
        "/returns",
        {
          asset_id: assetId,
          destination_location_id: destination,
          reason: reason.trim(),
          condition,
        },
        `Return · ${assets.find((a) => a.id === assetId)?.serial}`,
      );
      setNotice(
        r.queued
          ? "Return request saved to your outbox."
          : "Return requested. Keep the asset until the receiving team confirms handover.",
      );
      setAssetId(null);
      setReason("");
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
          title="Send & return stock"
          subtitle="A clear handover. A complete history."
          back
        />
      }
    >
      <Card style={{ backgroundColor: "#F1EBFF", borderColor: "#E0D6FA" }}>
        <View style={s.row}>
          <Icon name="shield" size={22} />
          <Text style={[s.body, { flex: 1, color: C.purpleDark }]}>
            Assets stay in your custody until your hub confirms physical
            receipt.
          </Text>
        </View>
      </Card>
      <Button
        title="Scan an asset to return"
        secondary
        icon="maximize"
        onPress={() => setScanner(true)}
      />
      <Section title="Choose an asset" />
      {assets.map((a) => (
        <Pressable key={a.id} onPress={() => setAssetId(a.id)}>
          <Card
            style={
              assetId === a.id
                ? { borderColor: C.purple, backgroundColor: "#FAF8FF" }
                : {}
            }
          >
            <View style={s.row}>
              <View style={[s.checkbox, assetId === a.id && s.checked]}>
                {assetId === a.id && (
                  <Icon name="check" color="#FFF" size={14} />
                )}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[s.sectionTitle, { fontSize: 13 }]}>
                  {a.product_name}
                </Text>
                <Text style={[s.small, { color: C.purple }]}>{a.serial}</Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
      {!assets.length && (
        <Empty
          title="No assets available to return"
          description="Assets already in an open return cannot be submitted again."
          icon="box"
        />
      )}
      {assetId !== null && (
        <>
          <Section title="Receiving location" />
          <View style={{ gap: 8 }}>
            {destinations.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => setDestination(l.id)}
                style={[s.pill, destination === l.id && s.pillActive]}
              >
                <Text
                  style={[s.pillText, destination === l.id && s.pillTextActive]}
                >
                  {l.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Section title="Asset condition" />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {["GOOD", "DEFECTIVE", "DAMAGED"].map((c) => (
              <Pressable
                key={c}
                onPress={() => setCondition(c)}
                style={[s.pill, condition === c && s.pillActive]}
              >
                <Text style={[s.pillText, condition === c && s.pillTextActive]}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="Return reason"
            placeholder="Why is this asset being returned?"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <ErrorText error={error} />
          <Button
            title="Create return handover"
            icon="upload"
            busy={busy}
            disabled={!destination || !reason.trim()}
            onPress={send}
          />
        </>
      )}
      <Section title="Pending handovers" />
      {outstanding.map((r) => (
        <Card key={r.id}>
          <View style={s.split}>
            <Text style={s.sectionTitle}>{r.code}</Text>
            <Badge status={r.status} />
          </View>
          <Text style={[s.small, { color: C.purple }]}>{r.serial}</Text>
          <Text style={s.body}>{r.destination_name}</Text>
        </Card>
      ))}
      {!outstanding.length && (
        <Text style={s.small}>No return handovers are pending.</Text>
      )}
      <Scanner
        visible={scanner}
        onClose={() => setScanner(false)}
        onScan={(serial) => {
          const a = assets.find((a) => a.serial === serial);
          if (a) {
            setAssetId(a.id);
            setError("");
          } else
            setNotice("This serial is not available in your stock to return.");
        }}
      />
    </Screen>
  );
}
