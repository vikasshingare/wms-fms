import React, { useCallback, useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Text, View } from "react-native";
import { Button, Card, ErrorText, Header, Screen, s } from "../components/ui";
import { Scanner } from "../components/Scanner";
import { request } from "../lib/api";
import { useStore } from "../lib/store";
import { canPutAway, Row } from "../lib/types";

type Condition = "GOOD" | "BAD" | "DAMAGE";
type Scan = "master" | "product";
const outcomes: { value: Condition; label: string }[] = [
  { value: "GOOD", label: "Good" },
  { value: "BAD", label: "Bad" },
  { value: "DAMAGE", label: "Damaged" },
];

export default function WarehousePutaway() {
  const { token, user, data, refresh, logout } = useStore();
  const [master, setMaster] = useState<Row | null>(null);
  const [serials, setSerials] = useState<string[]>([]);
  const [options, setOptions] = useState<{asns: Row[];cartons: Row[]}>({asns:[],cartons:[]});
  const [condition, setCondition] = useState<Condition>("GOOD");
  const [destination, setDestination] = useState<Row | null>(null);
  const [bins, setBins] = useState<Row[]>([]);
  const [scanner, setScanner] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOptions = useCallback(async () => {
    if (!token) return;
    try {
      setOptions(await request("/inbound/putaway-options", token));
    } catch (err) { setError((err as Error).message); }
  }, [token]);
  useEffect(() => {
    if (!token || !canPutAway(user)) return;
    let current = true;
    request("/inbound/putaway-options", token).then(next => {
      if (current) setOptions(next);
    }).catch(err => { if (current) setError((err as Error).message); });
    return () => { current = false; };
  }, [token, user]);

  if (!token) return <Redirect href="/login" />;
  if (!canPutAway(user)) return <Redirect href="/(tabs)" />;
  const pending = options.asns;
  const pieces = serials.length;

  async function capture(value: string, stage: Scan) {
    if (!value) return;
    setError("");
    setNotice("");
    if (stage === "master") {
      const carton = options.cartons.find(c => c.barcode === value);
      const asn = pending.find(a => a.id === carton?.asn_id);
      if (!carton || !asn) {
        setError("This master carton has no pending manifest in your warehouse.");
        return;
      }
      setBusy(true);
      try {
        const masters: Row[] = await request("/inbound/masters", token);
        const locations = new Set(masters.filter(m => m.kind === "PALLET" && m.warehouse_id === asn.warehouse_id && m.active).map(m => m.location_id));
        setBins((data?.locations || []).filter(l => l.type === "BIN" && locations.has(l.id) && (!l.product_id || l.product_id === carton.product_id)));
        setMaster(carton);
        setSerials([]);
        setCondition("GOOD");
        setDestination(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!master || pieces >= master.qty) return;
    if (value === master.barcode) { setError("Scan the product barcode, not the master carton."); return; }
    if (serials.some(serial => serial.toUpperCase() === value.toUpperCase())) {
      setError("This product barcode has already been scanned.");
      return;
    }
    if (master.transfer && !master.expected_serials?.includes(value)) {
      setError("This product barcode is not on the transferred master carton.");
      return;
    }
    setSerials(previous => [...previous, value]);
  }

  async function save() {
    if (!master || pieces !== master.qty) return;
    setBusy(true);
    setError("");
    try {
      const rows = serials.map(serial => ({
        master_carton_barcode: master.barcode,
        product_barcode: serial,
        condition,
      }));
      await request(`/inbound/asns/${master.asn_id}/entry/putaway-mapping`, token, {
        rows,
        destination_location_id: condition === "GOOD" || master.transfer ? destination?.id : undefined,
      });
      setNotice(condition === "GOOD" ? "Carton mapped and put away." : "Carton mapped and sent to quarantine.");
      setMaster(null);
      setSerials([]);
      await refresh();
      await loadOptions();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <Screen header={<Header title="Warehouse putaway" subtitle="Master carton → product barcodes → bin" />}>
    <Card>
      <Text style={s.sectionTitle}>Scan a master carton</Text>
      <Text style={s.body}>{pending.length} inbound manifests ready for mapping</Text>
      <Button title="Scan master carton" disabled={busy} onPress={() => setScanner("master")} />
      <Button title="Refresh manifests" secondary disabled={busy} onPress={() => void loadOptions()} />
    </Card>
    {master && <Card>
      <Text style={s.sectionTitle}>{master.barcode}</Text>
      <Text style={s.body}>{pieces} of {master.qty} product pieces mapped</Text>
      <Text style={s.body}>Scan each product_barcode directly under this master carton.</Text>
      <Button title="Scan product barcode" disabled={busy || pieces >= master.qty} onPress={() => setScanner("product")} />
      {serials.map(serial => <Text key={serial} style={s.body}>{serial}</Text>)}
      <Button title="Remove last product barcode" secondary disabled={busy || !serials.length} onPress={() => setSerials(previous => previous.slice(0, -1))} />
      <Text style={s.sectionTitle}>Box condition</Text>
      <View style={{ gap: 6 }}>{outcomes.map(outcome => <Button key={outcome.value} title={outcome.label} secondary={condition !== outcome.value} disabled={busy} onPress={() => setCondition(outcome.value)} />)}</View>
      {(condition === "GOOD" || master.transfer) && <>
        <Text style={s.sectionTitle}>Destination bin</Text>
        {!bins.length && <Text style={s.body}>No eligible bins were found for this warehouse and product.</Text>}
        {bins.map(bin => <Button key={bin.id} title={bin.name} secondary={destination?.id !== bin.id} disabled={busy} onPress={() => setDestination(bin)} />)}
      </>}
      <Button title={condition === "GOOD" ? "Save mapping and put away" : "Save mapping and quarantine"} disabled={busy || pieces !== master.qty || ((condition === "GOOD" || master.transfer) && !destination)} onPress={() => void save()} />
    </Card>}
    <ErrorText error={error} />
    {notice ? <Text accessibilityRole="alert" style={s.body}>{notice}</Text> : null}
    <Button title="Sign out" secondary disabled={busy} onPress={() => void logout()} />
    {scanner && <Scanner visible label={scanner === "product" ? "product barcode" : `${scanner} carton`} onClose={() => setScanner(null)} onScan={value => void capture(value, scanner)} />}
  </Screen>;
}
