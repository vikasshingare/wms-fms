import React from "react";
import { Redirect, Tabs } from "expo-router";
import { useStore } from "../../lib/store";
import { C, Icon } from "../../components/ui";
export default function TabLayout() {
  const { token } = useStore();
  if (!token) return <Redirect href="/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.purple,
        tabBarInactiveTintColor: "#9694AB",
        tabBarStyle: {
          height: 76,
          paddingTop: 10,
          paddingBottom: 12,
          borderTopColor: "#EAE7F2",
          backgroundColor: "#FFF",
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 3 },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Icon name="home" color={String(color)} size={20} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color }) => (
            <Icon name="clipboard" color={String(color)} size={20} />
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: "Stock",
          tabBarIcon: ({ color }) => (
            <Icon name="box" color={String(color)} size={20} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => (
            <Icon name="grid" color={String(color)} size={20} />
          ),
        }}
      />
    </Tabs>
  );
}
