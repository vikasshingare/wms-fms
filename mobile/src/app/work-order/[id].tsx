import React, { useEffect, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useStore } from "../../lib/store";
import { API_URL, key, request } from "../../lib/api";
import { captureLocation } from "../../lib/location";
import {
  done,
  LocalEvidence,
  pretty,
  Row,
  shortDate,
  time,
} from "../../lib/types";
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
  Section,
  s,
} from "../../components/ui";
import { Scanner } from "../../components/Scanner";
import { Signature } from "../../components/Signature";

const defaultItems = [
  { id: "site_verified", label: "Customer and service location verified" },
  { id: "installation_tested", label: "Installation / service tests passed" },
  {
    id: "customer_briefed",
    label: "Customer briefed and equipment demonstrated",
  },
];
export default function WorkOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, user, token, submit, offline, setNotice } = useStore();
  const task = data?.work_orders.find((w) => String(w.id) === id);
  const [stage, setStage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [scanner, setScanner] = useState(false),
    [scanFor, setScanFor] = useState("serial"),
    [serial, setSerial] = useState(""),
    [oldSerial, setOldSerial] = useState(""),
    [checks, setChecks] = useState<Record<string, boolean>>({}),
    [photos, setPhotos] = useState<LocalEvidence[]>([]),
    [name, setName] = useState(""),
    [accepted, setAccepted] = useState(false),
    [resolution, setResolution] = useState(""),
    [signature, setSignature] = useState<string[]>([]),
    [pending, setPending] = useState(false),
    [reason, setReason] = useState(""),
    [loadedKey, setLoadedKey] = useState(""),
    [gpsFailed, setGpsFailed] = useState(false),
    [scanMessage, setScanMessage] = useState("");
  const draftKey = `${key}.${user?.id}.draft.${id}`;
  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await AsyncStorage.getItem(draftKey);
      if (!active) return;
      if (saved) {
        const d = JSON.parse(saved);
        setSerial(d.serial || "");
        setOldSerial(d.oldSerial || "");
        setChecks(d.checks || {});
        setPhotos(d.photos || []);
        setName(d.name || "");
        setAccepted(d.accepted || false);
        setResolution(d.resolution || "");
        setSignature(d.signature || []);
        setStage(d.stage || 0);
      } else {
        setSerial(task?.allocated_serial || "");
        setOldSerial(task?.serial || "");
        setChecks({});
        setPhotos([]);
        setName("");
        setAccepted(false);
        setResolution("");
        setSignature([]);
        setStage(0);
      }
      setLoadedKey(draftKey);
    })();
    return () => {
      active = false;
    };
  }, [draftKey, task?.allocated_serial, task?.serial]);
  useEffect(() => {
    if (loadedKey === draftKey)
      AsyncStorage.setItem(
        draftKey,
        JSON.stringify({
          serial,
          oldSerial,
          checks,
          photos,
          name,
          accepted,
          resolution,
          signature,
          stage: Math.min(stage, 3),
        }),
      ).catch(() =>
        setError(
          "This device could not save the draft. Free storage or use smaller photos before working offline.",
        ),
      );
  }, [
    loadedKey,
    draftKey,
    serial,
    oldSerial,
    checks,
    photos,
    name,
    accepted,
    resolution,
    signature,
    stage,
  ]);
  if (!task)
    return (
      <Screen header={<Header title="Work order" back />}>
        <Empty
          title="Work order unavailable"
          description="Refresh your workspace to load your assignments."
        />
      </Screen>
    );
  const template = data?.checklist_templates?.[0];
  const items: Row[] = template?.items?.length ? template.items : defaultItems;
  const evidenceTypes: string[] = template?.evidence_types?.length
    ? template.evidence_types
    : ["Shop front", "Inside shop", "Installed device"];
  const savedEvidence: Row[] = Array.isArray(task.evidence)
    ? task.evidence
    : [];
  const allPhotos = [...savedEvidence, ...photos];
  const hasPhoto = (type: string) => allPhotos.some((p) => p.type === type);
  const isExecution = task.status === "IN_PROGRESS";
  const needSerial = ["Installation", "Replacement"].includes(task.type);
  const needOld = [
    "Replacement",
    "De-installation",
    "Service",
    "Preventive Maintenance",
  ].includes(task.type);
  const action = async (command: string, payload: Row = {}) => {
    setError("");
    setBusy(true);
    try {
      const r = await submit(
        `/work-orders/${id}/action`,
        { action: command, ...payload },
        `${task.code} · ${pretty(command)}`,
      );
      setNotice(
        r.queued
          ? "Action saved on device. Sync to update your team."
          : `${pretty(command)} recorded.`,
      );
      if (command === "start") setStage(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const checkIn = async (withGps = true) => {
    setBusy(true);
    setError("");
    try {
      const coordinates = withGps ? await captureLocation() : {};
      const r = await submit(
        `/work-orders/${id}/action`,
        { action: "check_in", ...coordinates },
        `${task.code} · Site check-in`,
      );
      setNotice(
        r.queued
          ? "Check-in saved on device."
          : "You are checked in at the site.",
      );
      setGpsFailed(false);
    } catch (e: any) {
      setError(e.message);
      if (withGps) setGpsFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const validateScan = async (value: string, target = scanFor) => {
    if (target === "old_serial") setOldSerial(value);
    else setSerial(value);
    setScanMessage("");
    setError("");
    try {
      if (offline) {
        const a = data?.assets.find((a) => a.serial === value);
        if (!a)
          throw new Error(
            "Serial not present in your saved inventory. Reconnect to validate.",
          );
        setScanMessage(
          "Serial found in saved inventory. Server validation will run when synced.",
        );
      } else {
        const asset = await request("/assets/validate-scan", token, {
          serial: value,
          work_order_id: Number(id),
        });
        setScanMessage(`${asset.product_name} · ${pretty(asset.status)}`);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };
  const pick = async (type: string, camera = false) => {
    setError("");
    try {
      if (camera) {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted)
          throw new Error(
            "Allow camera access to capture evidence, or choose a photo.",
          );
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        base64: true,
        quality: 0.45,
        allowsEditing: false,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const photo = result.assets[0];
      if (!photo.base64)
        throw new Error(
          "This image could not be read. Please choose another photo.",
        );
      if (photo.base64.length > 7_000_000)
        throw new Error("Choose an image smaller than 5 MB.");
      const dataUrl = `data:${photo.mimeType || "image/jpeg"};base64,${photo.base64}`;
      setPhotos((old) => [
        ...old.filter((p) => p.type !== type),
        {
          type,
          name:
            photo.fileName || `${type.toLowerCase().replace(/ /g, "-")}.jpg`,
          uri: photo.uri,
          data: dataUrl,
        },
      ]);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const next = () => {
    setError("");
    if (stage <= 1) {
      if (needSerial && !serial.trim()) {
        setError("Scan or enter the asset serial before proceeding.");
        return;
      }
      if (needOld && !oldSerial.trim()) {
        setError("Enter the existing asset serial before proceeding.");
        return;
      }
      if (items.some((i) => i.required !== false && !checks[i.id])) {
        setError("Complete every required service checklist item.");
        return;
      }
      setStage(2);
    } else {
      if (evidenceTypes.some((type) => !hasPhoto(type))) {
        setError("Attach a photo for each required evidence type.");
        return;
      }
      setStage(3);
    }
  };
  const complete = async () => {
    setError("");
    if (!name.trim() || !accepted) {
      setError("Enter the customer name and capture their acceptance.");
      return;
    }
    if (!resolution.trim()) {
      setError("Add a short resolution summary.");
      return;
    }
    setBusy(true);
    try {
      const r = await submit(
        `/work-orders/${id}/action`,
        {
          action: "complete",
          work_order_id: Number(id),
          serial: serial.trim() || undefined,
          old_serial: oldSerial.trim() || undefined,
          checklist: items.map((i) => ({ id: i.id, checked: !!checks[i.id] })),
          evidence: savedEvidence,
          _local_evidence: photos,
          confirmation: {
            name: name.trim(),
            accepted,
            signature_points: signature,
          },
          resolution: resolution.trim(),
        },
        `${task.code} · Complete service`,
      );
      await AsyncStorage.removeItem(draftKey);
      if (r.queued) {
        setNotice(
          "Completion saved to your outbox. Awaiting server validation.",
        );
        router.push("/sync");
      } else {
        setNotice("Service completed. Your inventory has been updated.");
        setStage(4);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const completed = done(task.status);
  return (
    <Screen
      header={
        <Header
          title={task.code}
          subtitle={task.type}
          back
          right={<Badge status={task.status} />}
        />
      }
    >
      {completed ? (
        <>
          <View style={styles.success}>
            <View style={styles.successIcon}>
              <Icon name="check" color="#FFF" size={42} />
            </View>
            <Text style={styles.successTitle}>Task completed</Text>
            <Text style={styles.successCode}>{task.code}</Text>
            <Text style={[s.body, { textAlign: "center" }]}>
              Your service record and asset movements have been saved
              successfully.
            </Text>
          </View>
          <Card>
            <Info label="Customer" value={task.customer_name} />
            <Info label="Site" value={task.site_name} />
            <Info label="Resolution" value={task.resolution || resolution} />
            <Info label="Completed" value={shortDate(task.completed_at)} />
          </Card>
          <Button
            title="Back to tasks"
            onPress={() => router.replace("/(tabs)/tasks")}
          />
        </>
      ) : (
        <>
          <View style={styles.steps}>
            {["Check-in", "Execute", "Evidence", "Confirm"].map((label, i) => {
              const current = isExecution ? Math.max(stage, 1) : 0;
              return (
                <View key={label} style={styles.step}>
                  <View
                    style={[styles.stepDot, i <= current && styles.stepActive]}
                  >
                    {i < current ? (
                      <Icon name="check" color="#FFF" size={12} />
                    ) : (
                      <Text
                        style={[
                          styles.stepNumber,
                          i <= current && { color: "#FFF" },
                        ]}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepText,
                      i <= current && { color: C.purple },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
          {(!isExecution || stage <= 1) && (
            <>
              <Section title="Site & asset details" />
              <Card>
                <Info label="Customer" value={task.customer_name} />
                <Info label="Service location" value={task.site_name} />
                <Info label="Site ID" value={task.site_code} />
                <Info label="Asset / product" value={task.product_name} />
                <Info
                  label="Scheduled"
                  value={`${shortDate(task.scheduled_at)} · ${time(task.scheduled_at)}`}
                />
                <View style={s.row}>
                  <Icon name="map-pin" size={16} />
                  <Text style={[s.body, { flex: 1, color: C.ink }]}>
                    {task.address}
                    {task.city ? `, ${task.city}` : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Directions"
                      secondary
                      icon="navigation"
                      onPress={() =>
                        Linking.openURL(
                          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.latitude && task.longitude ? `${task.latitude},${task.longitude}` : task.address)}`,
                        )
                      }
                    />
                  </View>
                  {task.contact_phone && (
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Contact"
                        secondary
                        icon="phone"
                        onPress={() =>
                          Linking.openURL(`tel:${task.contact_phone}`)
                        }
                      />
                    </View>
                  )}
                </View>
              </Card>
              {task.summary && (
                <Card>
                  <Text style={s.sectionTitle}>Service request</Text>
                  <Text style={s.body}>{task.summary}</Text>
                  {task.description ? (
                    <Text style={s.small}>{task.description}</Text>
                  ) : null}
                </Card>
              )}
              {!isExecution && (
                <>
                  <ErrorText error={error} />
                  {task.status === "ASSIGNED" ||
                  task.status === "ASSET_PARTS_ALLOCATED" ? (
                    <Button
                      title="Accept assignment"
                      icon="check"
                      busy={busy}
                      onPress={() => action("accept")}
                    />
                  ) : task.status === "ACCEPTED" ? (
                    <Button
                      title="Start travelling"
                      icon="navigation"
                      busy={busy}
                      onPress={() => action("en_route")}
                    />
                  ) : task.status === "EN_ROUTE" ? (
                    <>
                      <Button
                        title="Check in at site"
                        icon="map-pin"
                        busy={busy}
                        onPress={() => checkIn()}
                      />
                      {gpsFailed && (
                        <Button
                          title="Check in without GPS"
                          secondary
                          busy={busy}
                          onPress={() => checkIn(false)}
                        />
                      )}
                    </>
                  ) : task.status === "PENDING" ? (
                    <Button
                      title="Resume visit"
                      icon="play"
                      busy={busy}
                      onPress={() => action("resume")}
                    />
                  ) : task.status === "CHECKED_IN" ? (
                    <Button
                      title="Start service"
                      icon="tool"
                      busy={busy}
                      onPress={() => action("start")}
                    />
                  ) : (
                    <Text style={s.body}>
                      This work order is {pretty(task.status).toLowerCase()}.
                      Your dispatcher can help with the next step.
                    </Text>
                  )}
                </>
              )}
              {isExecution && (
                <>
                  <Section title="Scan equipment" />
                  {needSerial && (
                    <Card>
                      <View style={s.split}>
                        <Text style={s.fieldLabel}>
                          {task.type === "Replacement"
                            ? "Replacement asset serial"
                            : "Asset serial number"}
                        </Text>
                        <Pressable
                          accessibilityLabel="Scan asset"
                          onPress={() => {
                            setScanFor("serial");
                            setScanner(true);
                          }}
                        >
                          <Icon name="maximize" />
                        </Pressable>
                      </View>
                      <Field
                        value={serial}
                        onChangeText={setSerial}
                        placeholder="Scan or enter serial"
                        autoCapitalize="characters"
                      />
                      <Button
                        title="Validate serial"
                        secondary
                        icon="check-circle"
                        onPress={() => validateScan(serial, "serial")}
                      />
                    </Card>
                  )}
                  {needOld && (
                    <Card>
                      <View style={s.split}>
                        <Text style={s.fieldLabel}>Existing asset serial</Text>
                        <Pressable
                          accessibilityLabel="Scan existing asset"
                          onPress={() => {
                            setScanFor("old_serial");
                            setScanner(true);
                          }}
                        >
                          <Icon name="maximize" />
                        </Pressable>
                      </View>
                      <Field
                        value={oldSerial}
                        onChangeText={setOldSerial}
                        placeholder="Existing installed serial"
                        autoCapitalize="characters"
                      />
                    </Card>
                  )}
                  {scanMessage && (
                    <Text style={[s.small, { color: C.green }]}>
                      {scanMessage}
                    </Text>
                  )}
                  <Section title="Service checklist" />
                  <Card>
                    {items.map((item) => (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!checks[item.id] }}
                        onPress={() =>
                          setChecks((c) => ({ ...c, [item.id]: !c[item.id] }))
                        }
                        key={item.id}
                        style={s.checkRow}
                      >
                        <View
                          style={[s.checkbox, checks[item.id] && s.checked]}
                        >
                          {checks[item.id] && (
                            <Icon name="check" color="#FFF" size={14} />
                          )}
                        </View>
                        <Text style={s.checkLabel}>
                          {item.label}
                          {item.required === false ? " (optional)" : ""}
                        </Text>
                      </Pressable>
                    ))}
                  </Card>
                  <ErrorText error={error} />
                  <Button
                    title="Continue to evidence"
                    icon="arrow-right"
                    onPress={next}
                  />
                </>
              )}
            </>
          )}
          {isExecution && stage === 2 && (
            <>
              <Section title="Capture evidence" />
              <Text style={s.body}>
                Add clear photos to document the visit. Your photos stay in the
                service record.
              </Text>
              {evidenceTypes.map((type) => {
                const photo = allPhotos.find((p) => p.type === type);
                return (
                  <Card key={type}>
                    <View style={s.row}>
                      {photo ? (
                        <Image
                          source={{
                            uri:
                              photo.uri ||
                              photo.data ||
                              (/^(http|data:)/.test(photo.url || "")
                                ? photo.url
                                : `${API_URL.replace("/api", "")}${photo.url}`),
                            headers: { Authorization: `Bearer ${token}` },
                          }}
                          style={styles.photo}
                        />
                      ) : (
                        <View style={[styles.photo, styles.photoEmpty]}>
                          <Icon
                            name={
                              type === "Installed device" ? "monitor" : "image"
                            }
                            size={27}
                          />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text style={[s.sectionTitle, { fontSize: 13 }]}>
                          {type}
                        </Text>
                        <Text
                          style={[
                            s.small,
                            { color: photo ? C.green : C.muted },
                          ]}
                        >
                          {photo ? "Photo attached" : "Required evidence"}
                        </Text>
                      </View>
                      {photo && (
                        <Icon name="check-circle" color={C.green} size={19} />
                      )}
                    </View>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Button
                          title={photo ? "Replace photo" : "Choose photo"}
                          secondary
                          icon="image"
                          onPress={() => pick(type)}
                        />
                      </View>
                      {Platform.OS !== "web" && (
                        <View style={{ flex: 1 }}>
                          <Button
                            title="Capture"
                            secondary
                            icon="camera"
                            onPress={() => pick(type, true)}
                          />
                        </View>
                      )}
                    </View>
                  </Card>
                );
              })}
              <ErrorText error={error} />
              <Button
                title="Continue to confirmation"
                icon="arrow-right"
                onPress={next}
              />
              <Button
                title="Back to checklist"
                secondary
                onPress={() => setStage(1)}
              />
            </>
          )}
          {isExecution && stage === 3 && (
            <>
              <Section title="Customer confirmation" />
              <Card>
                <View style={s.row}>
                  <View style={[s.iconBox, { backgroundColor: "#E9F8F0" }]}>
                    <Icon name="user-check" color={C.green} />
                  </View>
                  <Text style={[s.body, { flex: 1 }]}>
                    Confirm the work with your customer before closing the
                    visit.
                  </Text>
                </View>
                <Field
                  label="Customer name"
                  placeholder="Name of the person accepting service"
                  value={name}
                  onChangeText={setName}
                />
                <Field
                  label="Resolution summary"
                  placeholder="What was completed and tested?"
                  value={resolution}
                  onChangeText={setResolution}
                  multiline
                />
                <Signature points={signature} onChange={setSignature} />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: accepted }}
                  onPress={() => setAccepted(!accepted)}
                  style={s.checkRow}
                >
                  <View style={[s.checkbox, accepted && s.checked]}>
                    {accepted && <Icon name="check" color="#FFF" size={14} />}
                  </View>
                  <Text style={s.checkLabel}>
                    The customer confirms that the service was completed and the
                    equipment was demonstrated.
                  </Text>
                </Pressable>
              </Card>
              <Card>
                <View style={s.row}>
                  <Icon name="shield" size={18} />
                  <Text style={[s.small, { flex: 1 }]}>
                    {items.length} checklist items · {allPhotos.length} photos ·
                    Asset custody validated on submission
                  </Text>
                </View>
              </Card>
              <ErrorText error={error} />
              <Button
                title="Complete service"
                icon="check-circle"
                busy={busy}
                onPress={complete}
              />
              <Button
                title="Back to evidence"
                secondary
                onPress={() => setStage(2)}
              />
            </>
          )}
          {isExecution && stage < 3 && (
            <Pressable
              style={{ alignItems: "center", padding: 5 }}
              onPress={() => setPending(!pending)}
            >
              <Text style={[s.link, { color: C.muted }]}>
                Unable to complete this visit?
              </Text>
            </Pressable>
          )}
          {pending && (
            <Card>
              <Field
                label="Reason for pending"
                placeholder="Explain the issue and next action"
                value={reason}
                onChangeText={setReason}
                multiline
              />
              <Button
                title="Mark as pending"
                secondary
                busy={busy}
                disabled={!reason.trim()}
                onPress={() => action("pending", { reason: reason.trim() })}
              />
            </Card>
          )}
        </>
      )}
      <Scanner
        visible={scanner}
        onClose={() => setScanner(false)}
        onScan={(value) => validateScan(value)}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  steps: {
    flexDirection: "row",
    paddingVertical: 4,
    justifyContent: "space-between",
  },
  step: { alignItems: "center", gap: 7, flex: 1 },
  stepDot: {
    height: 25,
    width: 25,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D8D0EB",
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
  },
  stepActive: { backgroundColor: C.purple, borderColor: C.purple },
  stepNumber: { fontSize: 10, fontWeight: "700", color: "#A398B8" },
  stepText: { fontSize: 10, fontWeight: "500", color: C.muted },
  photo: { height: 75, width: 82, borderRadius: 10 },
  photoEmpty: {
    backgroundColor: C.lavender,
    alignItems: "center",
    justifyContent: "center",
  },
  success: {
    alignItems: "center",
    gap: 17,
    paddingHorizontal: 25,
    paddingVertical: 38,
  },
  successIcon: {
    height: 88,
    width: 88,
    borderRadius: 44,
    backgroundColor: "#2EBB71",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
    boxShadow: "0 8px 30px #2EBB7125",
  },
  successTitle: {
    fontSize: 25,
    fontWeight: "700",
    color: "#218846",
    letterSpacing: -0.6,
  },
  successCode: { fontSize: 15, fontWeight: "700", color: C.navy },
});
