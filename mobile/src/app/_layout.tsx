import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider, useStore } from "../lib/store";
import { C } from "../components/ui";

function Routes() {
  const { ready } = useStore();
  return (
    <View style={styles.outer}>
      <View style={styles.phone}>
        <StatusBar style="light" />
        {ready ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.bg },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="work-order/[id]" />
            <Stack.Screen name="attendance" />
            <Stack.Screen name="receive-stock" />
            <Stack.Screen name="return-stock" />
            <Stack.Screen name="sync" />
          </Stack>
        ) : (
          <ActivityIndicator
            style={{ flex: 1 }}
            color={C.purple}
            size="large"
          />
        )}
      </View>
    </View>
  );
}
export default function Root() {
  return (
    <SafeAreaProvider>
      <Provider>
        <Routes />
      </Provider>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: "#EDE9F7", alignItems: "center" },
  phone: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    overflow: "hidden",
    backgroundColor: C.bg,
    ...(Platform.OS === "web" ? { boxShadow: "0 0 80px #2B155214" } : {}),
  },
});
