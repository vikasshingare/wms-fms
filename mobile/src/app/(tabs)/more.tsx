import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "../../lib/store";
import {
  Button,
  C,
  Card,
  Header,
  Icon,
  Logo,
  Screen,
  s,
} from "../../components/ui";
export default function More() {
  const { user, logout, queue, data } = useStore();
  const links = [
    {
      title: "Attendance",
      detail: "Start and finish your working day",
      icon: "calendar",
      route: "/attendance",
    },
    {
      title: "Receive stock",
      detail: "Accept assets issued by your hub",
      icon: "download",
      route: "/receive-stock",
    },
    {
      title: "Send & return stock",
      detail: "Arrange a traceable asset handover",
      icon: "upload",
      route: "/return-stock",
    },
    {
      title: "Offline & sync",
      detail: queue.length
        ? `${queue.length} changes waiting to sync`
        : "All your changes in one place",
      icon: "refresh-cw",
      route: "/sync",
    },
  ];
  return (
    <Screen
      header={
        <Header
          title="Your workspace"
          subtitle="Everything you need, wherever work takes you."
        />
      }
    >
      <Card>
        <View style={s.row}>
          <View
            style={[s.iconBox, { height: 56, width: 56, borderRadius: 18 }]}
          >
            <Text style={{ fontSize: 21, fontWeight: "700", color: C.purple }}>
              {user?.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.sectionTitle}>{user?.name}</Text>
            <Text style={s.small}>Field Service Engineer</Text>
            <Text style={[s.small, { color: C.purple }]}>{user?.email}</Text>
          </View>
        </View>
      </Card>
      <Card>
        {links.map((link, index) => (
          <Pressable
            key={link.title}
            onPress={() => router.push(link.route as any)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 14,
              borderBottomWidth: index === links.length - 1 ? 0 : 1,
              borderBottomColor: C.line,
            }}
          >
            <Icon name={link.icon} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.sectionTitle, { fontSize: 13 }]}>
                {link.title}
              </Text>
              <Text style={s.small}>{link.detail}</Text>
            </View>
            <Icon name="chevron-right" size={17} color={C.muted} />
          </Pressable>
        ))}
      </Card>
      <Card>
        <Text style={s.sectionTitle}>A connected service journey</Text>
        <Text style={s.body}>
          From warehouse custody to customer confirmation, every visit stays
          connected to your team&apos;s Service360 workspace.
        </Text>
        <Text style={s.small}>
          Assigned location:{" "}
          {data?.locations.find((l) => l.id === user?.location_id)?.name ||
            "Engineer inventory"}
        </Text>
      </Card>
      <Button
        title="Sign out"
        secondary
        icon="log-out"
        onPress={() => logout().then(() => router.replace("/login"))}
      />
      <View style={{ alignItems: "center", paddingVertical: 18 }}>
        <Logo small />
      </View>
    </Screen>
  );
}
