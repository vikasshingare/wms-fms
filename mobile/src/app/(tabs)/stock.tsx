import React, { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "../../lib/store";
import {
  Badge,
  Button,
  C,
  Card,
  Empty,
  Field,
  Header,
  Icon,
  Screen,
  Section,
  s,
} from "../../components/ui";
import { shortDate } from "../../lib/types";
export default function Stock() {
  const { data, user } = useStore();
  const [search, setSearch] = useState("");
  const assets = (data?.assets || []).filter(
    (a) => a.holder_user_id === user?.id || a.location_id === user?.location_id,
  );
  const filtered = assets.filter((a) =>
    `${a.serial} ${a.product_name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Screen
      header={
        <Header
          title="My stock"
          subtitle="Every asset. One traceable custody."
        />
      }
    >
      <Card style={{ backgroundColor: C.purple, borderColor: C.purple }}>
        <View style={s.split}>
          <View>
            <Text style={{ fontSize: 12, color: "#DFD5FA" }}>
              STOCK IN HAND
            </Text>
            <Text
              style={{
                fontSize: 37,
                fontWeight: "700",
                color: "#FFF",
                marginTop: 5,
              }}
            >
              {assets.length}
              <Text
                style={{ fontSize: 13, fontWeight: "400", color: "#D9CCFA" }}
              >
                {" "}
                assets
              </Text>
            </Text>
          </View>
          <View
            style={[
              s.iconBox,
              {
                width: 60,
                height: 60,
                backgroundColor: "#FFFFFF20",
                borderRadius: 18,
              },
            ]}
          >
            <Icon name="package" size={32} color="#FFF" />
          </View>
        </View>
        <Text style={{ fontSize: 11, color: "#DDD3F9" }}>
          {assets.filter((a) => a.status === "RETURNED_TO_ENGINEER").length}{" "}
          returns awaiting handover
        </Text>
      </Card>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Receive"
            secondary
            icon="download"
            onPress={() => router.push("/receive-stock")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Send / return"
            secondary
            icon="upload"
            onPress={() => router.push("/return-stock")}
          />
        </View>
      </View>
      <Field
        placeholder="Search serial or product"
        value={search}
        onChangeText={setSearch}
      />
      <Section title="Assets in your custody" />
      {filtered.map((asset) => (
        <Card key={asset.id}>
          <View style={s.row}>
            <View style={s.iconBox}>
              <Icon name="box" />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={s.sectionTitle}>{asset.product_name}</Text>
              <Text style={[s.small, { color: C.purple, fontWeight: "600" }]}>
                {asset.serial}
              </Text>
            </View>
          </View>
          <View style={s.split}>
            <Badge status={asset.status} />
            <Text style={s.small}>
              {asset.condition} · {shortDate(asset.created_at)}
            </Text>
          </View>
        </Card>
      ))}
      {!filtered.length && (
        <Empty
          title="No assets found"
          description="Accept a stock transfer to add assets to your field inventory."
          icon="package"
        />
      )}
    </Screen>
  );
}
